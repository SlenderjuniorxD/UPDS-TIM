import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

@Injectable({
  providedIn: 'root'
})
export class SecurityService {
  private http = inject(HttpClient);
  
  private apiKey = '18e9c76f17f83741c48523b65f2a4bd3c94b621febfa0f1a864ba84f9dd463cf'; 
  private apiUrl = 'https://www.virustotal.com/api/v3/urls';

  async scanFile(fileUrl: string): Promise<string> {
    const formData = new FormData();
    formData.append('url', fileUrl);

    const headers = new HttpHeaders({
      'x-apikey': this.apiKey
    });

    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(this.apiUrl);

    try {
      const response: any = await firstValueFrom(
        this.http.post(proxyUrl, formData, { headers })
      );

      return response.data.id; 
    } catch (error) {
      console.error('Error enviando a VirusTotal:', error);
      throw error;
    }
  }

  async getAnalysisResult(analysisId: string): Promise<any> {
    const headers = new HttpHeaders({
      'x-apikey': this.apiKey
    });

    const reportUrl = `https://www.virustotal.com/api/v3/analyses/${analysisId}`;
    const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(reportUrl);

    const response: any = await firstValueFrom(
      this.http.get(proxyUrl, { headers })
    );

    return response.data.attributes; 
  }
}