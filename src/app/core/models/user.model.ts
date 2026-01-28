export interface UserProfile {
  uid: string;
  email: string;
  nombre: string;
  rol: 'estudiante' | 'investigador' | 'evaluador' | 'admin';
  carrera: string;
}