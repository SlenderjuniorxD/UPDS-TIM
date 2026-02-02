import { Timestamp } from '@angular/fire/firestore';

export type ProjectStatus = 
  | 'borrador'          
  | 'subido'    
  | 'revision_tutor'     
  | 'observado'         
  | 'aprobado';   

export interface Project {
  id: string;
  studentId: string;
  studentName: string;
  title: string;
  description: string;
  
  // Archivos y Análisis
  fileUrl?: string;
  filePath?: string;
  originalFileName?: string;
  
  virusScanStatus?: 'pending' | 'clean' | 'infected';
  plagiarismScore?: number;
  
  status: ProjectStatus;
  versions: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}