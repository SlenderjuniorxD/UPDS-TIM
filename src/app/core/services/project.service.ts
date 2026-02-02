import { Injectable, inject } from '@angular/core';
import { Firestore, collection, addDoc, query, where, collectionData, Timestamp, doc, updateDoc, orderBy } from '@angular/fire/firestore';
import { Storage, ref, uploadBytes, getDownloadURL } from '@angular/fire/storage';
import { Project } from '../models/project.model';
import { firstValueFrom, Observable } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { SecurityService } from './security.service';
import { PdfUtilService } from './pdf-util.service';
import { NotificationService } from './notification.service';

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  private firestore = inject(Firestore);
  private storage = inject(Storage);
  private http = inject(HttpClient);
  private securityService = inject(SecurityService);
  private pdfUtil = inject(PdfUtilService);
  private notificationService = inject(NotificationService);

  private cloudName = 'dx2sjm09f'; 
  private uploadPreset = 'upds-upload';

  async createProject(project: Omit<Project, 'id'>): Promise<string> {
    const projectsRef = collection(this.firestore, 'projects');
    const docRef = await addDoc(projectsRef, project);
    return docRef.id;
  }
  // 2. Subir Archivo a CLOUDINARY (CAMBIADO)
  async uploadThesisFile(file: File, projectId: string): Promise<{ url: string, path: string,delete_token: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', this.uploadPreset);
    formData.append('folder', `proyectos/${projectId}`);
    
    

    const nameWithoutExt = file.name.substring(0, file.name.lastIndexOf('.')) || file.name;

    formData.append('public_id', `${nameWithoutExt}_${Date.now()}`);

    const uploadUrl = `https://api.cloudinary.com/v1_1/${this.cloudName}/upload`;

    try {
      const response: any = await firstValueFrom(this.http.post(uploadUrl, formData));
      
      console.log('Respuesta Cloudinary:', response);
      
      return { 
        url: response.secure_url,  
        path: response.public_id,
        delete_token: response.delete_token
      };
    } catch (error) {
      console.error('Error subiendo a Cloudinary', error);
      throw error;
    }
  }
  async deleteFileFromCloudinary(deleteToken: string): Promise<void> {
    const url = `https://api.cloudinary.com/v1_1/${this.cloudName}/delete_by_token`;
    const formData = new FormData();
    formData.append('token', deleteToken);

    await firstValueFrom(this.http.post(url, formData));
    console.log('🗑️ Archivo eliminado de Cloudinary por Plagio Alto');
  }
  async deleteProject(projectId: string): Promise<void> {
    const docRef = doc(this.firestore, `projects/${projectId}`);
    await import('@angular/fire/firestore').then(m => m.deleteDoc(docRef)); 
    console.log('🗑️ Registro eliminado de Firestore');
  }

  async updateProjectFileUrl(projectId: string, fileUrl: string, filePath: string, fileName: string) {
    const docRef = doc(this.firestore, `projects/${projectId}`);
    await updateDoc(docRef, { 
      fileUrl, 
      filePath, 
      originalFileName: fileName,
      status: 'subido',
      updatedAt: Timestamp.now()
    });
  }
  getProjectsByStudent(studentId: string): Observable<Project[]> {
    const projectsRef = collection(this.firestore, 'projects');
    const q = query(projectsRef, where('studentId', '==', studentId));
    return collectionData(q, { idField: 'id' }) as Observable<Project[]>;
  }

async runAutomatedSecurityCheck(
  projectId: string, 
  fileUrl: string, 
  title: string, 
  description: string, 
  textContent: string,
  deleteToken: string
): Promise<{ status: 'clean' | 'infected' | 'plagiarism_rejected', score: number }> { // <--- CAMBIO AQUÍ: Ahora devuelve un objeto
  
  try {
    console.log('1. Enviando a VirusTotal...');
    const analysisId = await this.securityService.scanFile(fileUrl);
    
    console.log('Esperando análisis de virus (15s)...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    const report = await this.securityService.getAnalysisResult(analysisId);
    const isInfected = report.stats.malicious > 0;

    if (isInfected) {
      await this.updateProjectStatus(projectId, 'observado', {
        virusScanStatus: 'infected',
        plagiarismScore: 0,
        securityReportId: analysisId,
        lastCheck: Timestamp.now()
      });
      // Devolvemos el objeto con estado infected
      return { status: 'infected', score: 0 };
    }

    console.log('Virus limpio. Actualizando estado visual...');
    await this.updateProjectStatus(projectId, 'subido', { virusScanStatus: 'clean' });
    await new Promise(resolve => setTimeout(resolve, 1000));

    console.log(' Iniciando cálculo de originalidad...');
    const plagiarismScore = await this.checkInternalPlagiarism(title, textContent);
    console.log(`📊 Resultado Plagio: ${plagiarismScore}%`);

    if (plagiarismScore > 50) {
      console.warn('🚨 ALERTA: PLAGIO EXCESIVO. EJECUTANDO ELIMINACIÓN.');
      
      if (deleteToken) await this.deleteFileFromCloudinary(deleteToken);
      await this.deleteProject(projectId); // <--- AQUÍ LO BORRA

      // ¡IMPORTANTE! Devolvemos el puntaje AQUÍ para que el frontend lo sepa
      // aunque el proyecto ya no exista en la BD.
      return { status: 'plagiarism_rejected', score: plagiarismScore };
    }

    await this.updateProjectStatus(projectId, 'revision_tutor', {
      virusScanStatus: 'clean',    
      plagiarismScore: plagiarismScore,
      securityReportId: analysisId,
      lastCheck: Timestamp.now()
    });

    return { status: 'clean', score: plagiarismScore };

  } catch (error) {
    console.error('Fallo en el escaneo automático', error);
    throw error; 
  }
}
  async updateProjectStatus(projectId: string, status: any, extraData?: any,studentId?: string) {
    const docRef = doc(this.firestore, `projects/${projectId}`);
    await updateDoc(docRef, { 
      status, 
      ...extraData,
      updatedAt: Timestamp.now() 
    });

    if (studentId) {
        let title = 'Actualización de Estado';
        let msg = 'El estado de tu proyecto ha cambiado.';
        let type: any = 'info';

        if (status === 'observado' && extraData?.virusScanStatus === 'infected') {
            title = 'Amenaza Detectada';
            msg = 'Se ha detectado un virus en tu archivo. Por favor sube uno limpio.';
            type = 'error';
        }
        else if (status === 'revision_tutor') {
            title = 'Análisis Completado';
            msg = 'Tu archivo pasó las pruebas de seguridad y plagio. Ahora está con el tutor.';
            type = 'success';
        }

        await this.notificationService.createNotification({
            userId: studentId,
            title: title,
            message: msg,
            type: type,
            isRead: false,
            createdAt: Timestamp.now()
        });
    }
  }
  /*getAllProjects(): Observable<Project[]> {

    const projectsRef = collection(this.firestore, 'projects');

    return collectionData(projectsRef, { idField: 'id' }) as Observable<Project[]>;
  }*/

  private normalizeText(text: string): string[] {
    return text
      .toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
      .replace(/[^\w\s]/gi, '')
      .split(/\s+/) 
      .filter(word => word.length > 3); 
  }


  private calculateJaccardSimilarity(textA: string, textB: string): number {
    const setA = new Set(this.normalizeText(textA));
    const setB = new Set(this.normalizeText(textB));

    const intersection = new Set([...setA].filter(x => setB.has(x)));
    

    const union = new Set([...setA, ...setB]);

    if (union.size === 0) return 0;
    

    return (intersection.size / union.size) * 100;
  }


  private async checkInternalPlagiarism(currentTitle: string, currentContent: string): Promise<number> {
    const projectsSnapshot = await firstValueFrom(this.getAllProjects());
    
    let maxSimilarity = 0;

    for (const project of projectsSnapshot) {

      if (project.title === currentTitle || !(project as any).textContent) continue;

      const dbProjectContent = (project as any).textContent;


      const titleSim = this.calculateJaccardSimilarity(currentTitle, project.title);
      

      const contentSim = this.calculateJaccardSimilarity(currentContent, dbProjectContent);


      const totalSim = (titleSim * 0.2) + (contentSim * 0.8);

      if (totalSim > maxSimilarity) {
        maxSimilarity = totalSim;
      }
    }

    return Math.round(maxSimilarity);
  }
  async updateProject(projectId: string, data: any): Promise<void> {
  // 'projects' es el nombre de tu colección. Si usas otro nombre (ej: 'tesis'), cámbialo aquí.
  const projectRef = doc(this.firestore, 'projects', projectId);
  
  // updateDoc solo actualiza los campos que le envíes, no borra el resto del documento.
  return await updateDoc(projectRef, data);
}
getAllProjects(): Observable<any[]> {
  const projectsRef = collection(this.firestore, 'projects');
  // Ordenamos por fecha para ver los recientes primero
  const q = query(projectsRef, orderBy('createdAt', 'desc'));
  return collectionData(q, { idField: 'id' });
}
  async assignEvaluator(projectId: string, evaluatorId: string, evaluatorName: string) {
  const projectRef = doc(this.firestore, 'projects', projectId);
  return updateDoc(projectRef, {
    evaluatorId: evaluatorId,
    evaluatorName: evaluatorName,
    // Cambiamos estado a revisión, porque ya tiene profe asignado
    status: 'revision_tutor', 
    assignedAt: Timestamp.now()
  });
}
// En tu project.service.ts

// Obtener proyectos aprobados (para el buscador público)
getApprovedProjects(): Observable<any[]> {
  const projectsRef = collection(this.firestore, 'projects');
  // Filtramos solo los que ya pasaron todo el proceso
  const q = query(projectsRef, where('status', '==', 'aprobado'), orderBy('createdAt', 'desc'));
  return collectionData(q, { idField: 'id' });
}
getProjectsByEvaluator(evaluatorId: string): Observable<any[]> {
  const projectsRef = collection(this.firestore, 'projects');
  // Filtramos donde el campo 'evaluatorId' coincida con el usuario logueado
  const q = query(
    projectsRef, 
    where('evaluatorId', '==', evaluatorId),
    where('status', 'in', ['revision_tutor', 'aprobado', 'observado']) // Solo los que ya pasaron filtros automáticos
  );
  return collectionData(q, { idField: 'id' });
}
async gradeProject(projectId: string, scores: any, finalGrade: number, feedback: string,studentId: string) {
  console.log("Generando notificación para el usuario:", studentId); // <--- LOG PARA DEBUG
  const projectRef = doc(this.firestore, 'projects', projectId);
  const newStatus = finalGrade >= 51 ? 'aprobado' : 'observado';

  await updateDoc(projectRef, {
      rubricScores: scores,
      finalGrade: finalGrade,
      feedback: feedback,
      status: newStatus,
      gradedAt: Timestamp.now()
    });

  if (studentId) {
        await this.notificationService.createNotification({
            userId: studentId, // <--- Esto debe coincidir con el UID del estudiante
            title: finalGrade >= 51 ? '¡Proyecto Aprobado!' : 'Proyecto Observado',
            message: `Tu tutor ha calificado tu tesis con una nota de ${finalGrade}/100.`,
            type: finalGrade >= 51 ? 'success' : 'warning',
            isRead: false,
            createdAt: Timestamp.now()
        });
        console.log("🔔 Notificación creada con éxito en Firestore");
    } else {
        console.error("❌ NO se creó la notificación porque falta studentId");
    }
}
// Traer proyectos por Carrera que estén listos para revisión
// En project.service.ts

getProjectsByCareer(career: string): Observable<any[]> {
  const projectsRef = collection(this.firestore, 'projects');
  
  const q = query(
    projectsRef, 
    where('category', '==', career), // Busca coincidencias de carrera
    where('status', 'in', ['revision_tutor', 'aprobado', 'observado']), // Solo listos para revisar
    //orderBy('createdAt', 'desc')
  );
  
  return collectionData(q, { idField: 'id' });
}
  /*async createProject(project: Omit<Project, 'id'>): Promise<string> {
    const projectsRef = collection(this.firestore, 'projects');
    const docRef = await addDoc(projectsRef, project);
    return docRef.id; // Retornamos el ID generado
  }

  async uploadThesisFile(file: File, projectId: string): Promise<{ url: string, path: string }> {
    // Ruta: proyectos/{id_proyecto}/{nombre_archivo}
    const filePath = `projects/${projectId}/${Date.now()}_${file.name}`;
    const storageRef = ref(this.storage, filePath);
    

    await uploadBytes(storageRef, file);

    const url = await getDownloadURL(storageRef);
    return { url, path: filePath };
  }


  async updateProjectFileUrl(projectId: string, fileUrl: string, filePath: string, name: string) {
    const docRef = doc(this.firestore, `projects/${projectId}`);
    await updateDoc(docRef, { 
      fileUrl, 
      filePath, 
      status: 'subido', // Cambia estado a "subido"
      updatedAt: Timestamp.now()
    });
  }


  getProjectsByStudent(studentId: string): Observable<Project[]> {
    const projectsRef = collection(this.firestore, 'projects');
    // Query: Dame los proyectos donde studentId == al ID del usuario logueado
    const q = query(projectsRef, where('studentId', '==', studentId));
    return collectionData(q, { idField: 'id' }) as Observable<Project[]>;
  }*/
}