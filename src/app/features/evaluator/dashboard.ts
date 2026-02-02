import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import Swal from 'sweetalert2'
import { UserService } from 'src/app/core/services/user.service';

@Component({
  selector: 'app-evaluator-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class EvaluatorDashboard implements OnInit{
  private authService = inject(AuthService);
  private projectService = inject(ProjectService);
  private userService = inject(UserService);
  

  currentUser: any = null;
  assignedProjects = signal<any[]>([]);
  isLoading = signal(true);

  evaluatorCareer = signal<string>('');

  currentTab = signal<'pending' | 'history'>('pending');

  pendingProjects = computed(() => {
    return this.assignedProjects().filter(p => p.status === 'revision_tutor');
  });
  historyProjects = computed(() => {
    return this.assignedProjects().filter(p => 
      p.status === 'aprobado' || p.status === 'observado'
    );
  });

  selectedProject: any = null;
  isModalOpen = signal(false);

  rubric = {
    planteamiento: 0, // Max 20
    marcoTeorico: 0,  // Max 30
    metodologia: 0,   // Max 30
    conclusiones: 0   // Max 20
  };

  feedbackText = '';

  

  // En evaluator-dashboard.ts

async ngOnInit() {
    this.currentUser = this.authService.currentUser;
    
    if (this.currentUser) {
      this.isLoading.set(true);
      
      try {
        // 3. AHORA SÍ FUNCIONARÁ ESTA LÍNEA
        // Obtenemos el perfil completo del docente para saber su carrera
        const userProfile = await this.userService.getUserProfile(this.currentUser.uid);
        const career = userProfile?.carrera || 'Sistemas'; 
        this.evaluatorCareer.set(career);
        console.log("🟢 1. Iniciando escucha en tiempo real para:", career);
        
        // Obtenemos la carrera (asegúrate de que en Firebase se llame 'carrera' o 'category')
        // Ponemos 'Sistemas' como valor por defecto por si el campo está vacío
        const myCareer = userProfile?.carrera || 'Sistemas'; 

        console.log("👨‍🏫 Docente de carrera:", myCareer);

        // Llamamos a la función que busca por carrera (Pool de Tesis)
        this.projectService.getProjectsByCareer(career).subscribe(projs => {
          console.log("🔥 2. CAMBIOS DETECTADOS EN FIRESTORE:", projs);
          console.log("   -> Estados recibidos:", projs.map(p => `${p.title}: ${p.status}`));
          
          this.assignedProjects.set(projs);
          this.isLoading.set(false);
        });

      } catch (error) {
        console.error("Error cargando perfil:", error);
        this.isLoading.set(false);
      }
    }
  }

  loadProjects() {
    this.projectService.getProjectsByEvaluator(this.currentUser.uid).subscribe(projs => {
      this.assignedProjects.set(projs);
      this.isLoading.set(false);
    });
  }

  openGradeModal(project: any) {
    this.selectedProject = project;
    if (project.rubricScores) {
      this.rubric = { ...project.rubricScores };
      this.feedbackText = project.feedback || '';
    } else {
      this.rubric = { planteamiento: 0, marcoTeorico: 0, metodologia: 0, conclusiones: 0 };
      this.feedbackText = '';
    }
    this.isModalOpen.set(true);
  }

  closeModal() {
    this.isModalOpen.set(false);
    this.selectedProject = null;
  }

  // Calcular nota final en tiempo real
  get totalScore(): number {
    return (this.rubric.planteamiento || 0) + 
           (this.rubric.marcoTeorico || 0) + 
           (this.rubric.metodologia || 0) + 
           (this.rubric.conclusiones || 0);
  }


  async submitGrade() {
    if (this.totalScore > 100) {
      Swal.fire({
        title: 'Puntaje Excedido',
        text: `La nota total es ${this.totalScore}/100. Por favor ajusta los criterios para no superar el límite.`,
        icon: 'error'
      });
      return; // Detenemos la función
    }
    if (!this.feedbackText) {
      Swal.fire('Falta feedback', 'Por favor escribe una retroalimentación general.', 'warning');
      return;
    }

    try {
      await this.projectService.gradeProject(
        this.selectedProject.id, 
        this.rubric, 
        this.totalScore, 
        this.feedbackText,
        this.selectedProject.studentId
      );
      

      Swal.fire({
        title: 'Calificación Enviada',
        text: `El estudiante ha obtenido: ${this.totalScore}/100`,
        icon: this.totalScore >= 51 ? 'success' : 'warning'
      });
      
      this.closeModal();
      //this.loadProjects();
    } catch (error) {
      console.error(error);
      Swal.fire('Error', 'No se pudo guardar la calificación', 'error');
    }
  }
  switchTab(tab: 'pending' | 'history') {
    this.currentTab.set(tab);
  }
  onLogout() { this.authService.logout(); }
}
