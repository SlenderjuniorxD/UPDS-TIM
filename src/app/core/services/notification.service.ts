import { Injectable, inject } from '@angular/core';
import { Firestore, collection, addDoc, query, where, orderBy, collectionData, updateDoc, doc, Timestamp } from '@angular/fire/firestore';
import { Observable } from 'rxjs';

export interface AppNotification {
  id?: string;
  userId: string;
  title: string;     
  message: string; 
  type: 'info' | 'success' | 'warning' | 'error';
  isRead: boolean;
  createdAt: any;
  link?: string; 
}

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private firestore = inject(Firestore);

  // 1. Crear una notificación (El sistema la llama)
  async createNotification(notification: Omit<AppNotification, 'id'>) {
    const ref = collection(this.firestore, 'notifications');
    return addDoc(ref, notification);
  }

  // 2. Obtener notificaciones de un usuario (En tiempo real)
  getUserNotifications(userId: string): Observable<AppNotification[]> {
    const ref = collection(this.firestore, 'notifications');
    const q = query(
      ref, 
      where('userId', '==', userId),
      orderBy('createdAt', 'desc') // Las nuevas primero
    );
    return collectionData(q, { idField: 'id' }) as Observable<AppNotification[]>;
  }

  // 3. Marcar como leída (Cuando hace click en la campanita)
  async markAsRead(notificationId: string) {
    const ref = doc(this.firestore, `notifications/${notificationId}`);
    return updateDoc(ref, { isRead: true });
  }
}