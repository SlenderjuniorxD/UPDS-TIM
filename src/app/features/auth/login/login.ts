import { CommonModule } from '@angular/common';
import { Component, inject,NgZone,signal } from '@angular/core';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Auth, signInWithEmailAndPassword } from '@angular/fire/auth';
import Swal from 'sweetalert2';
import { AuthService } from '../../../core/services/auth.service';
import { UserService } from '../../../core/services/user.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginComponent {
  
  private fb = inject(FormBuilder);
  private authService = inject(AuthService);
  private router = inject(Router);

  loginForm: FormGroup;
  isLoading = signal<boolean>(false);

  private userService = inject(UserService);
  private ngZone = inject(NgZone);

  private Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.onmouseenter = Swal.stopTimer;
      toast.onmouseleave = Swal.resumeTimer;
    }
  });

  constructor() {
    this.loginForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(6)]]
    });
  }
  async onSubmit() {
    if (this.loginForm.invalid) {
      this.loginForm.markAllAsTouched();
      return;
    }

    this.isLoading.set(true); 
    const { email, password } = this.loginForm.value;

    try {

      const credential = await this.authService.login(email, password);
      const uid = credential.user.uid;

      const userProfile = await this.userService.getUserProfile(uid);

      //await this.authService.login(email, password);
      
      this.Toast.fire({
        icon: 'success',
        title: `Bienvenido, ${userProfile?.nombre || 'Usuario'}`
      });

      this.ngZone.run(() => {
        switch (userProfile?.rol) {
          case 'admin':
            this.router.navigate(['/admin-dashboard']);
            break;
          case 'estudiante':
            this.router.navigate(['/student-dashboard']);
            break;
          case 'investigador':
            this.router.navigate(['/researcher-dashboard']); 
            break;
          case 'evaluador':
            this.router.navigate(['/evaluator-dashboard']);
            break;
          default:
            this.Toast.fire({ icon: 'error', title: 'Usuario sin rol asignado.' });
            this.authService.logout(); 
        }
      });

    } catch (error: any) {
      console.error('Login error:', error);
      let mensaje = 'Ocurrió un error inesperado';

      switch (error.code) {
        case 'auth/invalid-credential':
        case 'auth/user-not-found':
        case 'auth/wrong-password':
          mensaje = 'Correo o contraseña incorrectos.';
          break;
        case 'auth/too-many-requests':
          mensaje = 'Cuenta bloqueada temporalmente por muchos intentos.';
          break;
        case 'auth/network-request-failed':
            mensaje = 'Error de conexión. Revisa tu internet.';
            break;
      }

      this.Toast.fire({
        icon: 'error',
        title: mensaje
      });

    } finally {
      this.isLoading.set(false);
    }
  }

  async onForgotPassword() {
    const { value: email } = await Swal.fire({
      title: 'Recuperar Contraseña',
      text: 'Ingresa tu correo institucional y te enviaremos un enlace.',
      input: 'email',
      inputPlaceholder: 'tu.correo@upds.edu.bo',
      showCancelButton: true,
      confirmButtonText: 'Enviar enlace',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#227ffd',
      cancelButtonColor: '#d33',
      inputValidator: (value) => {
        if (!value) {
          return 'Debes escribir un correo!';
        }
        return null;
      }
    });

    if (email) {
      try {
        await this.authService.resetPassword(email);
        Swal.fire('¡Enviado!', 'Revisa tu bandeja de entrada para restablecer tu contraseña.', 'success');
      } catch (error: any) {
        Swal.fire('Error', 'No pudimos enviar el correo. Verifica que la cuenta exista.', 'error');
      }
    }
  }
}
