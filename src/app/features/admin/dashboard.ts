import { Component, inject, signal, OnInit } from '@angular/core'; // <--- Agregamos OnInit
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms'; // <--- Agregamos FormsModule
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service'; // <--- Importamos ProjectService
import Swal from 'sweetalert2';
import { UserProfile } from '../../core/models/user.model';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule], // <--- Importamos FormsModule para el Select
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class AdminDashboard implements OnInit {
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private projectService = inject(ProjectService); // <--- Inyectamos
  private fb = inject(FormBuilder);

  // VISTA ACTUAL: 'users' (lo que ya tenías) o 'assignments' (lo nuevo)
  currentView = signal<'users' | 'assignments'>('users');
  carreras = [
    'Ingeniería de Sistemas',
    'Ingeniería Comercial',
    'Derecho',
    'Psicología',
    'Administración de Empresas',
    'Contaduría Pública'
  ];

  // DATOS
  users$ = this.userService.getUsers(); // Tu lista original
  projects = signal<any[]>([]);         // Lista de tesis
  evaluators = signal<UserProfile[]>([]); // Lista filtrada solo de profes
  
  isModalOpen = signal(false);
  isEditMode = signal(false);
  isLoading = signal(false);

  userForm: FormGroup;
  currentUserId: string | null = null;

  private Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => { toast.onmouseenter = Swal.stopTimer; toast.onmouseleave = Swal.resumeTimer; }
  });

  constructor() {
    this.userForm = this.fb.group({
      nombre: ['', Validators.required],
      email: ['', [Validators.required, Validators.email]],
      rol: ['estudiante', Validators.required],
      carrera: [''],
      password: [''] 
    });
  }
  onRoleChange() {
    const rol = this.userForm.get('rol')?.value;
    const carreraControl = this.userForm.get('carrera');

    // Si es Admin, no necesita carrera. Los demás sí.
    if (rol === 'admin') {
      carreraControl?.clearValidators();
      carreraControl?.setValue('');
      carreraControl?.disable();
    } else {
      carreraControl?.setValidators(Validators.required);
      carreraControl?.enable();
    }
    carreraControl?.updateValueAndValidity();
  }

  // --- NUEVO: Cargar datos al iniciar ---
  ngOnInit() {
    this.loadAssignmentsData();
  }

  loadAssignmentsData() {
    // 1. Traer Proyectos
    this.projectService.getAllProjects().subscribe(projs => {
      this.projects.set(projs);
    });

    // 2. Traer Evaluadores (Filtramos tu users$ para sacar solo los profes)
    this.users$.subscribe(users => {
      const docentes = users.filter(u => u.rol === 'evaluador' || u.rol === 'investigador');
      this.evaluators.set(docentes);
    });
  }

  // --- NUEVO: Cambiar de Vista ---
  changeView(view: 'users' | 'assignments') {
    this.currentView.set(view);
  }

  // --- NUEVO: Lógica de Asignación ---
  async onAssign(project: any, event: any) {
    const evaluatorId = event.target.value;
    if (!evaluatorId) return;

    // Buscamos el nombre del evaluador para guardarlo también
    const evaluator = this.evaluators().find(e => e.uid === evaluatorId);

    try {
      await this.projectService.assignEvaluator(project.id, evaluator!.uid, evaluator!.nombre);
      
      this.Toast.fire({
        icon: 'success',
        title: 'Asignación Guardada',
        text: `Proyecto asignado a ${evaluator!.nombre}`
      });
    } catch (error) {
      this.Toast.fire({ icon: 'error', title: 'No se pudo asignar' });
    }
  }

  // --- TU CÓDIGO EXISTENTE (CRUD USUARIOS) ---
  
  openCreateModal() {
    this.isEditMode.set(false);
    this.userForm.reset({ rol: 'estudiante', carrera: '' }); // Reset carrera
    this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(6)]);
    this.userForm.get('email')?.enable(); 
    this.userForm.get('carrera')?.enable(); // Habilitar por defecto
    this.isModalOpen.set(true);
  }

  openEditModal(user: UserProfile) {
    this.isEditMode.set(true);
    this.currentUserId = user.uid;
    this.userForm.patchValue({
      nombre: user.nombre,
      email: user.email,
      rol: user.rol,
      carrera: user.carrera || ''
    });
    this.userForm.get('password')?.clearValidators(); 
    this.userForm.get('password')?.updateValueAndValidity();
    this.userForm.get('email')?.disable(); 
    this.isModalOpen.set(true);
  }

  closeModal() { this.isModalOpen.set(false); }

  async onSubmit() {
    if (this.userForm.invalid) return;
    this.isLoading.set(true);
    const formData = this.userForm.getRawValue();

    try {
      if (this.isEditMode()) {
        const userToUpdate: UserProfile = {
          uid: this.currentUserId!,
          nombre: formData.nombre,
          email: formData.email,
          rol: formData.rol,
          carrera: formData.rol === 'admin' ? null : formData.carrera
        };
        await this.userService.updateUser(userToUpdate);
        this.Toast.fire({ icon: 'success', title: 'Usuario actualizado correctamente' });
      } else {
        const newUser: UserProfile = {
          uid: '',
          nombre: formData.nombre,
          email: formData.email,
          rol: formData.rol,
          carrera: formData.carrera
        };
        await this.userService.createUser(newUser, formData.password);
        this.Toast.fire({ icon: 'success', title: 'Usuario registrado exitosamente' });
      }
      this.closeModal();
    } catch (error: any) {
      console.error(error);
      this.Toast.fire({ icon: 'error', title: error.message || 'Error' });
    } finally {
      this.isLoading.set(false);
    }
  }

  async onDelete(uid: string) {
    const result = await Swal.fire({
      title: '¿Estás seguro?', text: "No podrás revertir esta acción", icon: 'warning',
      showCancelButton: true, confirmButtonColor: '#d33', cancelButtonColor: '#3085d6',
      confirmButtonText: 'Sí, eliminar', cancelButtonText: 'Cancelar'
    });

    if (result.isConfirmed) {
      try {
        await this.userService.deleteUser(uid);
        this.Toast.fire({ icon: 'success', title: 'Usuario eliminado correctamente' });
      } catch (error) {
        this.Toast.fire({ icon: 'error', title: 'No se pudo eliminar' });
      }
    }
  }

  onLogout() { this.authService.logout(); }
}