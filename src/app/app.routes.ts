import { Routes } from '@angular/router';
import { LoginComponent } from './features/auth/login/login';
import { authGuard } from './core/guards/auth.guard';
import { StudentDashboard } from './features/student/dashboard';
import { AdminDashboard } from './features/admin/dashboard';
import { EvaluatorDashboard } from './features/evaluator/dashboard';
import { ReseatcherDashboard } from './features/researcher/dashboard';
import { adminGuard } from './core/guards/admin.guard';

export const routes: Routes = [
    { path: '', redirectTo: 'login', pathMatch: 'full' },
    { path: 'login', component: LoginComponent },

    { 
      path: 'student-dashboard', 
      component: StudentDashboard , 
      canActivate: [authGuard] 
    },
    { 
      path: 'admin-dashboard', 
      component: AdminDashboard, 
      canActivate: [authGuard,adminGuard] 
    },
    { 
      path: 'evaluator-dashboard', 
      component: EvaluatorDashboard, 
      canActivate: [authGuard] 
    },
    { 
      path: 'researcher-dashboard', 
      component: ReseatcherDashboard, 
      canActivate: [authGuard]
    },
    
    { path: '**', redirectTo: 'login' }

];
