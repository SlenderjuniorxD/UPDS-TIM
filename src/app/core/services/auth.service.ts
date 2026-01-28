import { Injectable, inject } from '@angular/core';
import { Auth, signInWithEmailAndPassword, signOut, user, User, UserCredential,sendPasswordResetEmail, authState } from '@angular/fire/auth';
import { Router } from '@angular/router';
import { Observable } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  // Inyecciones (Angular 18 style)
  private auth: Auth = inject(Auth);
  private router: Router = inject(Router);

  readonly authState$ = authState(this.auth);


  readonly userState$: Observable<User | null> = user(this.auth);

  constructor() { }


  login(email: string, pass: string): Promise<UserCredential> {
    return signInWithEmailAndPassword(this.auth, email, pass);
  }

  async logout(): Promise<void> {
    await signOut(this.auth);
    this.router.navigate(['login']); 
  }
  resetPassword(email: string): Promise<void> {
    return sendPasswordResetEmail(this.auth, email);
  }


  get currentUser(): User | null {
    return this.auth.currentUser;
  }
}