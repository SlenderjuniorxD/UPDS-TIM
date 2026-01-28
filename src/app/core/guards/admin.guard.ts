import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import Swal from 'sweetalert2';

export const adminGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  const user: any = authService.currentUser; 

  if (user && user.email === 'admin@test.com') {
    return true;
  }else{
    Swal.fire({
      icon: 'error',
      title: 'Acceso Denegado',
      text: 'No tienes permisos de administrador para ver esta sección.',
      timer: 2000,
      showConfirmButton: false
    });
    router.navigate(['/student-dashboard']);
    return false;
  }

  if (user && user.rol === 'estudiante') {
    
  }
console.log(""+user.email);
  console.log("enviando a login")
  //router.navigate(['/login']); 
  return false;
};