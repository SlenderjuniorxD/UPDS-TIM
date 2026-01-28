import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Timestamp } from '@angular/fire/firestore';
import Swal from 'sweetalert2';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { ProjectService } from '../../core/services/project.service';
import { Project } from '../../core/models/project.model';
import { PdfUtilService } from '../../core/services/pdf-util.service';

type DashboardView = 'search' | 'project' | 'profile';

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class StudentDashboard {
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private projectService = inject(ProjectService);
  private fb = inject(FormBuilder);
  isEditing = signal(false);

  currentUser: any = null;
  currentProject = signal<Project | null>(null);
  isLoading = signal(false);

  isSidebarOpen = signal(false);
  currentView = signal<DashboardView>('search');
  private pdfUtil = inject(PdfUtilService);
  projectForm: FormGroup;
  selectedFile: File | null = null;
  

  searchForm: FormGroup;
  allApprovedProjects: any[] = []; // Copia completa para filtrar
  searchResults = signal<any[]>([]);

  

  recentTheses = [
    { title: 'Implementación de IA en Logística', autor: 'Ana Lopez', year: 2023, category: 'Sistemas' },
    { title: 'Impacto del Marketing Digital en PyMES', autor: 'Carlos Perez', year: 2024, category: 'Comercial' },
    { title: 'Seguridad en Redes IoT', autor: 'Maria Diaz', year: 2023, category: 'Redes' },
  ];

  private Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false,
    timer: 3000, timerProgressBar: true
  });

  constructor() {
    this.projectForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(10)]],
      description: ['', [Validators.required, Validators.minLength(20)]]
    });
    this.searchForm = this.fb.group({
      query: [''],
      category: [''],
      year: [''],
      type: ['']
    });
    this.loadInitialData();
  }
  async ngOnInit() {
    this.loadInitialData();
    this.loadApprovedProjects(); // Cargar tesis aprobadas al inicio
    
    // Escuchar cambios en el buscador en tiempo real (opcional)
    this.searchForm.valueChanges.subscribe(() => {
      this.onSearch();
    });
  }
  loadApprovedProjects() {
    this.projectService.getApprovedProjects().subscribe(projects => {
      this.allApprovedProjects = projects;
      this.searchResults.set(projects); // Al inicio mostramos todo
    });
  }
  onSearch() {
    const filters = this.searchForm.value;
    const term = filters.query?.toLowerCase() || '';

    const filtered = this.allApprovedProjects.filter(proj => {
      // 1. Filtro de Texto (Título o Autor)
      const matchesText = proj.title?.toLowerCase().includes(term) || 
                          proj.studentName?.toLowerCase().includes(term);

      // 2. Filtro de Categoría (Carrera)
      // Asumimos que guardaste la carrera en el user o proyecto. 
      // Si no, tendrás que ajustar esto.
      const matchesCategory = filters.category ? proj.category === filters.category : true;

      // 3. Filtro de Año
      let matchesYear = true;
      if (filters.year) {
        const date = proj.createdAt instanceof Timestamp ? proj.createdAt.toDate() : new Date(proj.createdAt);
        matchesYear = date.getFullYear().toString() === filters.year;
      }

      return matchesText && matchesCategory && matchesYear;
    });

    this.searchResults.set(filtered);
  }

  changeView(view: DashboardView) {
    this.currentView.set(view);
  }

  async loadInitialData() {
    this.isLoading.set(true);
    const user = this.authService.currentUser;
    if (user) {
      this.currentUser = await this.userService.getUserProfile(user.uid);
      this.projectService.getProjectsByStudent(user.uid).subscribe(projects => {
        if (projects.length > 0) this.currentProject.set(projects[0]); 
        this.isLoading.set(false);
      });
    }
  }
  onFileSelected(event: any) {
    const file = event.target.files[0];
    if (file) {
      if (file.type !== 'application/pdf' && !file.name.endsWith('.docx')) {
        this.Toast.fire({ icon: 'error', title: 'Solo se permiten archivos PDF o DOCX' });
        return;
      }
      this.selectedFile = file;
    }
  }

  // Reemplaza tu función onSubmit con esta versión optimizada

async onSubmit() {
    if (this.projectForm.invalid) return;
    if (!this.isEditing() && !this.selectedFile) return;

    this.isLoading.set(true);
    const formData = this.projectForm.value;

    try {
      const user = this.authService.currentUser;

      // =================================================================================
      // CASO A: MODO EDICIÓN
      // =================================================================================
      if (this.isEditing()) {
        const projectId = this.currentProject()!.id;
        
        // --- A.1: Nuevo archivo subido ---
        if (this.selectedFile) {
          this.Toast.fire({ icon: 'info', title: 'Subiendo nueva versión...' });

          // 1. Extraer texto
          const extractedText = await this.pdfUtil.extractTextFromPdf(this.selectedFile);

          // 2. Subir archivo
          const { url, path, delete_token } = await this.projectService.uploadThesisFile(this.selectedFile, projectId);

          // 3. Actualizar Firestore (Ponemos estado 'pending' para que se vean los spinners)
          const updateData = {
              title: formData.title,
              description: formData.description,
              textContent: extractedText,
              fileUrl: url,
              filePath: path,
              originalFileName: this.selectedFile.name,
              status: 'subido',
              updatedAt: Timestamp.now(),
              virusScanStatus: 'pending', 
              plagiarismScore: null
          };

          // --- CAMBIO CLAVE AQUÍ ---
          // 1. Lanzamos la actualización sin 'await' para no bloquear la pantalla
          this.projectService.updateProject(projectId, updateData);

          // 2. Cerramos el formulario INMEDIATAMENTE
          this.isEditing.set(false);
          this.projectForm.reset();
          this.selectedFile = null;
          this.isLoading.set(false); 

          // 3. Mostramos mensaje y seguimos con seguridad en segundo plano
          this.Toast.fire({ icon: 'success', title: 'Nueva versión subida' });

          // El chequeo de seguridad sigue aquí abajo...
          const result = await this.projectService.runAutomatedSecurityCheck(
              projectId, url, formData.title, formData.description, extractedText, delete_token
          );

          // Manejamos el resultado silenciosamente o con alerta final
          if (result === 'plagiarism_rejected') {
             Swal.fire({ title: 'ALERTA', text: 'El documento fue rechazado por plagio tras el análisis.', icon: 'error' });
          } else if (result === 'infected') {
             Swal.fire({ title: 'ALERTA', text: 'Se detectó un virus. El documento ha sido marcado.', icon: 'warning' });
          } else {
             this.Toast.fire({ icon: 'success', title: 'Análisis completado: Documento limpio.' });
          }

        } 
        // --- A.2: Solo edición de texto ---
        else {
          const updateData = {
            title: formData.title,
            description: formData.description,
            updatedAt: Timestamp.now()
          };
          await this.projectService.updateProject(projectId, updateData);
          this.Toast.fire({ icon: 'success', title: 'Información actualizada' });
          this.finalizeAction();
        }
      } 
      
      // =================================================================================
      // CASO B: MODO CREACIÓN (Nuevo Proyecto)
      // =================================================================================
      else {
        this.Toast.fire({ icon: 'info', title: 'Creando proyecto...' });
        const extractedText = await this.pdfUtil.extractTextFromPdf(this.selectedFile!);
        
        const newProject: any = {
          studentId: user?.uid,
          studentName: this.currentUser?.nombre,
          title: formData.title,
          description: formData.description,
          textContent: extractedText,
          status: 'subido',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          virusScanStatus: 'pending' // Importante inicializar así
        };

        const projectId = await this.projectService.createProject(newProject);
        const { url, path, delete_token } = await this.projectService.uploadThesisFile(this.selectedFile!, projectId);
        await this.projectService.updateProjectFileUrl(projectId, url, path, this.selectedFile!.name);

        // Cerramos formulario inmediatamente
        this.isLoading.set(false);
        this.projectForm.reset();
        this.selectedFile = null;

        // Avisamos que empieza el análisis
        this.Toast.fire({ icon: 'info', title: 'Proyecto creado. Iniciando análisis...' });

        // Seguridad en segundo plano
        await this.projectService.runAutomatedSecurityCheck(
            projectId, url, formData.title, formData.description, extractedText, delete_token 
        ); 
      }

    } catch (error: any) {
      console.error(error);
      this.Toast.fire({ icon: 'error', title: 'Error: ' + error.message });
      this.isLoading.set(false);
    }
}
  handleSecurityResult(result: string) {
    if (result === 'plagiarism_rejected') {
      Swal.fire({
        title: 'PROYECTO RECHAZADO',
        text: 'Se ha detectado un nivel de similitud superior al 50%. El archivo ha sido eliminado.',
        icon: 'error',
        confirmButtonColor: '#d33'
      }).then(() => {
         // Si se rechaza, limpiamos la selección actual
         this.currentProject.set(null); 
      });
      this.finalizeAction(); // Limpia formulario

    } else if (result === 'infected') {
      Swal.fire('Atención', 'Se detectó una amenaza en el archivo. El proyecto ha sido observado.', 'warning');
      this.finalizeAction();

    } else {
      const msg = this.isEditing() ? '¡Proyecto actualizado correctamente!' : '¡Proyecto aceptado y enviado a revisión!';
      this.Toast.fire({ icon: 'success', title: msg });
      this.finalizeAction();
    }
}
finalizeAction() {
    this.projectForm.reset();
    this.selectedFile = null;
    this.isEditing.set(false); // Salimos del modo edición
    this.isLoading.set(false);
}
  // Agrega esta función en tu clase DashboardComponent
removeSelectedFile() {
  this.selectedFile = null; // Borramos la variable que guarda el archivo
  
  // Opcional: Resetear el input del formulario si lo usas
  // this.projectForm.get('file')?.setValue(null); 
  
  // IMPORTANTE: Si necesitas limpiar el input file nativo para que el evento (change)
  // se dispare de nuevo aunque seleccionen el mismo archivo, puedes hacerlo así:
  const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
  if (fileInput) {
    fileInput.value = '';
  }
}
startEditing() {
  const project = this.currentProject();
  if (!project) return;

  this.isEditing.set(true);
  
  // Rellenamos el formulario con los datos actuales
  this.projectForm.patchValue({
    title: project.title,
    description: project.description
  });
  
  // OJO: No seteamos el archivo porque ese es un input type="file"
  // Pero guardamos la referencia de que ya existe un archivo
}
cancelEditing() {
  this.isEditing.set(false);
  this.projectForm.reset();
  this.selectedFile = null;
}
  onLogout() {
    this.authService.logout();
  }

  toggleSidebar() {
    this.isSidebarOpen.update(v => !v);
  }
  closeSidebar() {
    this.isSidebarOpen.set(false);
  }


  /*async onSubmit() {
    if (this.projectForm.invalid || !this.selectedFile) {
      this.Toast.fire({ icon: 'warning', title: 'Completa el formulario y selecciona un archivo' });
      return;
    }

    this.isLoading.set(true);
    
    try {
      const user = this.authService.currentUser;
      if (!user) throw new Error('No hay sesión');

      // 1. Crear registro base
      const newProject: any = {
        studentId: user.uid,
        studentName: this.currentUser?.nombre || 'Estudiante',
        title: this.projectForm.value.title,
        description: this.projectForm.value.description,
        status: 'borrador', // Inicia como borrador hasta que suba el archivo
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now()
      };

      const projectId = await this.projectService.createProject(newProject);

      // 2. Subir Archivo
      const { url, path } = await this.projectService.uploadThesisFile(this.selectedFile, projectId);

      // 3. Actualizar proyecto
      await this.projectService.updateProjectFileUrl(projectId, url, path, this.selectedFile.name);

      this.Toast.fire({ icon: 'success', title: '¡Proyecto enviado a revisión!' });
      this.projectForm.reset();
      this.selectedFile = null;

      console.log('Iniciando escaneo para ID:', projectId); // <--- Agrega esto para depurar
      await this.projectService.runAutomatedSecurityCheck(
          projectId, 
          url, 
          this.projectForm.value.title, 
          this.projectForm.value.description
      );
      //await this.projectService.runAutomatedSecurityCheck(projectId, url);

    } catch (error: any) {
      console.error(error);
      this.Toast.fire({ icon: 'error', title: 'Error al subir proyecto: ' + error.message });
    } finally {
      this.isLoading.set(false);
    }
  }
  onLogout() {
    this.authService.logout();
  }*/
}
