import { inject, PLATFORM_ID } from '@angular/core'; // <--- 1. Importar PLATFORM_ID
import { isPlatformBrowser } from '@angular/common'; // <--- 2. Importar isPlatformBrowser
import { Router, type CanActivateFn } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { map, take } from 'rxjs/operators';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const platformId = inject(PLATFORM_ID);

  if (!isPlatformBrowser(platformId)) {
    return true; 
  }

  return authService.authState$.pipe(
    take(1),
    map(user => {
      console.log('Estado del usuario (Navegador):', user ? 'Logueado' : 'No Logueado');
      console.log("usuario: " +user?.email)
      if (user) {
        console.log(user)
        return true;
      } else {
        console.log("false" +user),
        router.navigate(['/login']);
        return false;
      }
    })
    
  );
  
};