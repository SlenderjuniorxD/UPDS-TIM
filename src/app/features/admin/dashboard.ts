import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { UserService } from '../../core/services/user.service';
import { AuthService } from '../../core/services/auth.service';
import { ProjectService } from '../../core/services/project.service';
import { UserProfile } from '../../core/models/user.model';
import Swal from 'sweetalert2';
import { Firestore, doc, getDoc, setDoc, Timestamp } from '@angular/fire/firestore';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.css',
})
export class AdminDashboard implements OnInit {
  private userService = inject(UserService);
  private authService = inject(AuthService);
  private projectService = inject(ProjectService);
  private fb = inject(FormBuilder);
  private firestore = inject(Firestore);

  // VISTAS: Cambiamos 'assignments' por 'monitoring'
  currentView = signal<'users' | 'monitoring' | 'settings'>('users');
  
  carreras = [
    'Ingeniería de Sistemas', 'Ingeniería Comercial', 'Derecho', 
    'Psicología', 'Administración de Empresas', 'Contaduría Pública'
  ];

  // DATOS
  users$ = this.userService.getUsers();
  projects = signal<any[]>([]); // Lista de todas las tesis
  
  // ESTADÍSTICAS SIMPLES (Computed)
  stats = computed(() => {
    const total = this.projects().length;
    const approved = this.projects().filter(p => p.status === 'aprobado').length;
    const pending = this.projects().filter(p => p.status === 'revision_tutor' || p.status === 'subido').length;
    return { total, approved, pending };
  });

  deadlines: { [key: string]: string } = {}; 

  isModalOpen = signal(false);
  isEditMode = signal(false);
  isLoading = signal(false);
  isSavingDates = signal(false);

  userForm: FormGroup;
  currentUserId: string | null = null;

  private Toast = Swal.mixin({
    toast: true, position: 'top-end', showConfirmButton: false, timer: 3000,
    timerProgressBar: true
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

  ngOnInit() {
    this.loadData();
    this.loadDeadlines();
  }

  loadData() {
    // Solo cargamos proyectos para verlos, ya no necesitamos evaluadores aquí
    this.projectService.getAllProjects().subscribe(projs => { 
      this.projects.set(projs); 
    });
  }

  // --- GESTIÓN DE FECHAS (Igual que antes) ---
  async loadDeadlines() {
    try {
      const docRef = doc(this.firestore, 'settings', 'deadlines');
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        this.carreras.forEach(c => {
          if (data[c]) {
            this.deadlines[c] = data[c].toDate().toISOString().split('T')[0];
          }
        });
      }
    } catch (error) { console.error(error); }
  }

  async saveDeadlines() {
    this.isSavingDates.set(true);
    try {
      const dataToSave: any = {};
      Object.keys(this.deadlines).forEach(key => {
        if (this.deadlines[key]) {
          const parts = this.deadlines[key].split('-');
          dataToSave[key] = Timestamp.fromDate(new Date(+parts[0], +parts[1]-1, +parts[2], 12));
        }
      });
      await setDoc(doc(this.firestore, 'settings', 'deadlines'), dataToSave, { merge: true });
      this.Toast.fire({ icon: 'success', title: 'Calendario Guardado' });
    } catch (error) { this.Toast.fire({ icon: 'error', title: 'Error al guardar' }); } 
    finally { this.isSavingDates.set(false); }
  }

  // --- NAVEGACIÓN ---
  changeView(view: 'users' | 'monitoring' | 'settings') {
    this.currentView.set(view);
  }

  // --- CRUD USUARIOS (Se mantiene igual, resumido aquí) ---
  onRoleChange() {
    const rol = this.userForm.get('rol')?.value;
    const carreraControl = this.userForm.get('carrera');
    if (rol === 'admin') {
      carreraControl?.clearValidators(); carreraControl?.setValue(''); carreraControl?.disable();
    } else {
      carreraControl?.setValidators(Validators.required); carreraControl?.enable();
    }
    carreraControl?.updateValueAndValidity();
  }

  openCreateModal() { this.isEditMode.set(false); this.userForm.reset({ rol: 'estudiante', carrera: '' }); this.userForm.get('password')?.setValidators([Validators.required, Validators.minLength(6)]); this.userForm.get('email')?.enable(); this.userForm.get('carrera')?.enable(); this.isModalOpen.set(true); }
  openEditModal(user: UserProfile) { this.isEditMode.set(true); this.currentUserId = user.uid; this.userForm.patchValue({ nombre: user.nombre, email: user.email, rol: user.rol, carrera: user.carrera || '' }); this.userForm.get('password')?.clearValidators(); this.userForm.get('password')?.updateValueAndValidity(); this.userForm.get('email')?.disable(); this.isModalOpen.set(true); }
  closeModal() { this.isModalOpen.set(false); }
  
  async onSubmit() {
      if (this.userForm.invalid) return;
      this.isLoading.set(true);
      const formData = this.userForm.getRawValue();
      try {
        if (this.isEditMode()) {
          const userToUpdate: UserProfile = { uid: this.currentUserId!, nombre: formData.nombre, email: formData.email, rol: formData.rol, carrera: formData.rol === 'admin' ? null : formData.carrera };
          await this.userService.updateUser(userToUpdate);
          this.Toast.fire({ icon: 'success', title: 'Actualizado' });
        } else {
          const newUser: UserProfile = { uid: '', nombre: formData.nombre, email: formData.email, rol: formData.rol, carrera: formData.carrera };
          await this.userService.createUser(newUser, formData.password);
          this.Toast.fire({ icon: 'success', title: 'Registrado' });
        }
        this.closeModal();
      } catch (error: any) { this.Toast.fire({ icon: 'error', title: error.message }); } finally { this.isLoading.set(false); }
  }

  async onDelete(uid: string) {
      const result = await Swal.fire({ title: '¿Eliminar?', icon: 'warning', showCancelButton: true, confirmButtonText: 'Sí', confirmButtonColor: '#d33' });
      if (result.isConfirmed) { await this.userService.deleteUser(uid); this.Toast.fire({ icon: 'success', title: 'Eliminado' }); }
  }

  onLogout() { this.authService.logout(); }
}