import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Timestamp, Firestore, doc, getDoc } from '@angular/fire/firestore';
import Swal from 'sweetalert2';
import { AuthService } from '../../core/services/auth.service';
import { UserService } from '../../core/services/user.service';
import { ProjectService } from '../../core/services/project.service';
import { Project } from '../../core/models/project.model';
import { PdfUtilService } from '../../core/services/pdf-util.service';
import { NotificationService } from '../../core/services/notification.service';

type DashboardView = 'search' | 'project' | 'profile';

@Component({
  selector: 'app-student-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class StudentDashboard implements OnInit {
  private authService = inject(AuthService);
  private userService = inject(UserService);
  private projectService = inject(ProjectService);
  private notificationService = inject(NotificationService);
  private pdfUtil = inject(PdfUtilService);
  private firestore = inject(Firestore);
  private fb = inject(FormBuilder);
  
  // SEÑALES DE ESTADO
  isEditing = signal(false);
  isLoading = signal(false);      // Carga general
  isSubmitting = signal(false);   // Botón guardar
  isSidebarOpen = signal(false);
  
  // VISTAS
  currentView = signal<DashboardView>('search');
  
  // DATOS USUARIO / PROYECTO
  currentUser: any = null;
  currentProject = signal<Project | null>(null);
  
  // DATOS BUSCADOR
  allApprovedProjects: any[] = []; 
  searchResults = signal<any[]>([]);
  
  // DATOS NOTIFICACIONES
  notifications = signal<any[]>([]);
  unreadCount = signal(0);
  showNotifications = signal(false);

  // === HISTORIA DE USUARIO #2: FECHAS LÍMITE (LO QUE FALTABA) ===
  deadlineDate = signal<Date | null>(null);
  
  daysRemaining = computed(() => {
    const deadline = this.deadlineDate();
    if (!deadline) return 0; // Si no hay fecha, 0

    const today = new Date();
    // Calculamos diferencia en milisegundos
    const diffTime = deadline.getTime() - today.getTime();
    // Convertimos a días
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays > 0 ? diffDays : 0;
  });

  // FORMULARIOS
  projectForm: FormGroup;
  searchForm: FormGroup;
  selectedFile: File | null = null;
  
  // FILTROS VISUALES
  carreras = [
    'Todas',
    'Ingeniería de Sistemas',
    'Ingeniería Comercial',
    'Derecho',
    'Psicología',
    'Administración de Empresas',
    'Contaduría Pública'
  ];
  selectedCategory = signal('Todas');

  private Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false,
    timer: 3000, timerProgressBar: true
  });

  constructor() {
    this.projectForm = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(5)]],
      description: ['', [Validators.required, Validators.minLength(10)]]
    });
    this.searchForm = this.fb.group({
      query: [''],
      category: [''],
      year: ['']
    });
  }

  async ngOnInit() {
    this.isLoading.set(true);
    await this.loadInitialData();
    this.loadApprovedProjects(); 
    this.loadDeadline(); // <--- CARGAMOS LA FECHA AQUÍ
    
    // Suscripción al buscador
    this.searchForm.valueChanges.subscribe(() => { this.onSearch(); });

    // Suscripción a notificaciones
    if (this.authService.currentUser) {
      this.notificationService.getUserNotifications(this.authService.currentUser.uid)
      .subscribe(notifs => {
          this.notifications.set(notifs);
          this.unreadCount.set(notifs.filter(n => !n.isRead).length);
      });
    }
  }

  // --- 1. CARGA DE DATOS ---
  async loadInitialData() {
    const user = this.authService.currentUser;
    if (user) {
      this.currentUser = await this.userService.getUserProfile(user.uid);
      
      this.projectService.getProjectsByStudent(user.uid).subscribe(projects => {
        if (projects.length > 0) this.currentProject.set(projects[0]); 
        this.isLoading.set(false);
      });
    } else {
      this.isLoading.set(false);
    }
  }

  loadApprovedProjects() {
    this.projectService.getApprovedProjects().subscribe(projects => {
      this.allApprovedProjects = projects;
      this.searchResults.set(projects);
    });
  }

  // --- NUEVA FUNCIÓN: CARGAR FECHA LÍMITE ---
  async loadDeadline() {
    try {
      const docRef = doc(this.firestore, 'settings', 'deadlines');
      const docSnap = await getDoc(docRef);

      if (docSnap.exists()) {
        const data = docSnap.data();
        const myCareer = this.currentUser?.carrera || 'General';
        
        // Buscamos la fecha de MI carrera, si no existe usamos General
        const careerTimestamp = data[myCareer] || data['General'];

        if (careerTimestamp) {
          this.deadlineDate.set(careerTimestamp.toDate());
          console.log(`📅 Fecha límite cargada para ${myCareer}:`, this.deadlineDate());
        }
      }
    } catch (error) {
      console.error("Error cargando fechas límite", error);
    }
  }

  // --- 2. BUSCADOR ---
  onSearch(category?: string) {
    if (category) {
      this.selectedCategory.set(category);
      // Si selecciona 'Todas', limpiamos el valor del form, si no, ponemos la carrera
      this.searchForm.patchValue({ category: category === 'Todas' ? '' : category });
    }
  
    const filters = this.searchForm.value;
    const term = filters.query?.toLowerCase() || '';
    const activeCat = this.selectedCategory();
  
    const filtered = this.allApprovedProjects.filter(proj => {
      const matchesText = (proj.title?.toLowerCase().includes(term) || 
                          proj.studentName?.toLowerCase().includes(term));
      
      const matchesCategory = activeCat === 'Todas' 
        ? true 
        : proj.category === activeCat;
  
      let matchesYear = true;
      if (filters.year) {
        const date = proj.createdAt instanceof Timestamp ? proj.createdAt.toDate() : new Date(proj.createdAt);
        matchesYear = date.getFullYear().toString() === filters.year.toString();
      }
  
      return matchesText && matchesCategory && matchesYear;
    });
  
    this.searchResults.set(filtered);
  }

  // --- 3. GESTIÓN DE PROYECTO (SUBIR / EDITAR) ---
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

  removeSelectedFile() {
    this.selectedFile = null;
    const fileInput = document.querySelector('input[type="file"]') as HTMLInputElement;
    if (fileInput) fileInput.value = '';
  }

  async onSubmit() {
    if (this.projectForm.invalid) return;
    if (!this.isEditing() && !this.selectedFile) return;

    this.isSubmitting.set(true); 
    
    const formData = this.projectForm.value;

    try {
      const user = this.authService.currentUser;
      let projectId: string;
      let extractedText = '';
      let fileInfo: any = null; 
      let isNewVersion = false;

      if (this.isEditing()) {
        projectId = this.currentProject()!.id;
        
        if (this.selectedFile) {
          this.Toast.fire({ icon: 'info', title: 'Subiendo archivo...' });
          
          extractedText = await this.pdfUtil.extractTextFromPdf(this.selectedFile);
          fileInfo = await this.projectService.uploadThesisFile(this.selectedFile, projectId);
          
          const previousVersions = this.currentProject()?.versions || [];
          const newVersionEntry = {
            url: fileInfo.url,
            fileName: this.selectedFile.name,
            uploadedAt: Timestamp.now(),
            comment: 'Nueva versión subida'
          };

          await this.projectService.updateProject(projectId, {
            title: formData.title,
            description: formData.description,
            textContent: extractedText,
            fileUrl: fileInfo.url,
            filePath: fileInfo.path,
            originalFileName: this.selectedFile.name,
            status: 'subido',
            updatedAt: Timestamp.now(),
            virusScanStatus: 'pending', 
            plagiarismScore: null,
            versions: [...previousVersions, newVersionEntry]
          });
          isNewVersion = true;
        } else {
          await this.projectService.updateProject(projectId, {
            title: formData.title,
            description: formData.description,
            updatedAt: Timestamp.now()
          });
          this.Toast.fire({ icon: 'success', title: 'Datos actualizados' });
        }

      } else {
        // CREACIÓN
        this.Toast.fire({ icon: 'info', title: 'Creando proyecto...' });
        
        extractedText = await this.pdfUtil.extractTextFromPdf(this.selectedFile!);
        
        const newProject: any = {
          studentId: user?.uid,
          studentName: this.currentUser?.nombre,
          // Guardamos la carrera correcta para el evaluador
          category: this.currentUser?.carrera || 'Ingeniería de Sistemas', 
          title: formData.title,
          description: formData.description,
          textContent: extractedText,
          status: 'subido',
          createdAt: Timestamp.now(),
          updatedAt: Timestamp.now(),
          virusScanStatus: 'pending',
          versions: []
        };

        projectId = await this.projectService.createProject(newProject);
        fileInfo = await this.projectService.uploadThesisFile(this.selectedFile!, projectId);
        
        const firstVersion = {
           url: fileInfo.url,
           fileName: this.selectedFile!.name,
           uploadedAt: Timestamp.now(),
           comment: 'Versión inicial'
        };

        await this.projectService.updateProject(projectId, {
           fileUrl: fileInfo.url, 
           filePath: fileInfo.path, 
           originalFileName: this.selectedFile!.name,
           versions: [firstVersion]
        });
        isNewVersion = true;
      }

      this.finalizeAction(); 

      // SEGUNDO PLANO: SEGURIDAD
      if (isNewVersion && fileInfo) {
        this.projectService.runAutomatedSecurityCheck(
          projectId, 
          fileInfo.url, 
          formData.title, 
          formData.description, 
          extractedText, 
          fileInfo.delete_token
        ).then(async (result) => {
            if (result.status === 'plagiarism_rejected') {
               await Swal.fire({
                   title: 'PROYECTO ELIMINADO',
                   html: `<div style="text-align: center;"><p>Nivel crítico de similitud:</p><h1 style="color: #ea580c; font-size: 3rem;">${result.score}%</h1></div>`,
                   icon: 'error',
                   allowOutsideClick: false
               });
               this.currentProject.set(null);
            }
            else if (result.status === 'infected') {
               await Swal.fire('AMENAZA DETECTADA', 'El archivo tiene virus.', 'error');
            }
            else if (result.status === 'clean') {
               const docRef = doc(this.firestore, 'projects', projectId);
               const docSnap = await getDoc(docRef);
               if (docSnap.exists()) {
                  this.currentProject.set({ id: projectId, ...docSnap.data() } as any);
                  this.Toast.fire({ icon: 'success', title: 'Análisis finalizado' });
               }
            }
        });
      }

    } catch (error: any) {
      console.error(error);
      this.Toast.fire({ icon: 'error', title: 'Error: ' + error.message });
      this.isSubmitting.set(false);
    }
  }

  // --- UTILIDADES ---
  finalizeAction() {
    this.isEditing.set(false);
    setTimeout(() => this.isSubmitting.set(false), 500);
    this.projectForm.reset();
    this.selectedFile = null;
  }

  startEditing() {
    const project = this.currentProject();
    if (!project) return;
    this.isSubmitting.set(false);
    this.isEditing.set(true);
    this.projectForm.patchValue({
      title: project.title,
      description: project.description
    });
  }

  cancelEditing() {
    this.isEditing.set(false);
    this.projectForm.reset();
    this.selectedFile = null;
    this.isSubmitting.set(false);
  }

  // --- NOTIFICACIONES Y PERFIL ---
  toggleNotifications() {
    this.showNotifications.update(v => !v);
  }

  markRead(n: any) {
    if (!n.isRead) {
        this.notificationService.markAsRead(n.id);
    }
  }

  changeView(view: DashboardView) { this.currentView.set(view); }
  onLogout() { this.authService.logout(); }
  toggleSidebar() { this.isSidebarOpen.update(v => !v); }
  closeSidebar() { this.isSidebarOpen.set(false); }
}