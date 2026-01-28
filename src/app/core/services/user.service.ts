import { Injectable, inject } from '@angular/core';
import { Firestore, doc, getDoc, setDoc, updateDoc, deleteDoc, collection, collectionData, query, orderBy } from '@angular/fire/firestore';
import { UserProfile } from '../models/user.model'; // Asegúrate que la ruta sea correcta a tu interfaz
import { Observable } from 'rxjs';
import { initializeApp, getApp, getApps, deleteApp, FirebaseApp } from '@angular/fire/app';
import { getAuth, createUserWithEmailAndPassword, Auth } from '@angular/fire/auth';
import { environment } from '../../../environments/environment';

@Injectable({
  providedIn: 'root'
})
export class UserService {
  private firestore = inject(Firestore);

  getUsers(): Observable<UserProfile[]> {
    const usersRef = collection(this.firestore, 'users');
    const q = query(usersRef, orderBy('nombre'));
    return collectionData(q, { idField: 'uid' }) as Observable<UserProfile[]>;
  }

  async createUser(user: UserProfile, password: string): Promise<void> {
    const secondaryAppName = 'secondaryApp';
    let secondaryApp: FirebaseApp;

    if (getApps().length > 1) {
      secondaryApp = getApp(secondaryAppName);
    } else {
      secondaryApp = initializeApp(environment.firebase, secondaryAppName);
    }

    const secondaryAuth = getAuth(secondaryApp);

    try {
      const userCredential = await createUserWithEmailAndPassword(secondaryAuth, user.email, password);
      const uid = userCredential.user.uid;

      const userDocRef = doc(this.firestore, `users/${uid}`);
      const newUser: UserProfile = { ...user, uid };
      await setDoc(userDocRef, newUser);
      
    } catch (error) {
      throw error;
    }
  }
  async updateUser(user: UserProfile): Promise<void> {
    const userDocRef = doc(this.firestore, `users/${user.uid}`);
    await updateDoc(userDocRef, { ...user });
  }
  async deleteUser(uid: string): Promise<void> {
    const userDocRef = doc(this.firestore, `users/${uid}`);
    await deleteDoc(userDocRef);
  }

  async getUserProfile(uid: string): Promise<UserProfile | null> {
    const userDocRef = doc(this.firestore, `users/${uid}`);
    const docSnap = await getDoc(userDocRef);

    if (docSnap.exists()) {
      return docSnap.data() as UserProfile;
    } else {
      console.error('No se encontró el perfil del usuario en Firestore');
      return null;
    }
  }

  
}