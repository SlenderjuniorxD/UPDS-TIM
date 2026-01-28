import { Injectable } from '@angular/core';
import * as pdfjsLib from 'pdfjs-dist';

@Injectable({
  providedIn: 'root'
})
export class PdfUtilService {

  constructor() { 

    (pdfjsLib as any).GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  }

  async extractTextFromPdf(file: File, maxPages: number = 10): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    

    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    
    let fullText = '';
    const pagesToRead = Math.min(pdf.numPages, maxPages);
    
    for (let i = 1; i <= pagesToRead; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(' ');
        
      fullText += pageText + ' ';
    }

    return fullText;
  }
}