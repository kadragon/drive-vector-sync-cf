/**
 * PDF text extraction utilities
 *
 * Trace:
 *   task_id: TASK-019
 */

import * as pdfjsLib from 'pdfjs-dist';

/**
 * Extract text content from PDF buffer
 */
export async function extractTextFromPDF(pdfBuffer: ArrayBuffer): Promise<string> {
  try {
    // Load PDF document
    const loadingTask = pdfjsLib.getDocument({ data: pdfBuffer });
    const pdf = await loadingTask.promise;

    const textPages: string[] = [];

    // Extract text from each page
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Combine text items into a single string
      const pageText = textContent.items
        .map((item: any) => {
          if ('str' in item) {
            return item.str;
          }
          return '';
        })
        .join(' ');

      textPages.push(pageText);
    }

    // Combine all pages
    return textPages.join('\n\n');
  } catch (error) {
    console.error('Failed to extract text from PDF:', error);
    throw new Error(`PDF text extraction failed: ${(error as Error).message}`);
  }
}

/**
 * Check if buffer appears to be a valid PDF
 */
export function isPDFBuffer(buffer: ArrayBuffer): boolean {
  const arr = new Uint8Array(buffer);
  // Check for PDF magic number: %PDF
  return (
    arr.length >= 4 &&
    arr[0] === 0x25 && // %
    arr[1] === 0x50 && // P
    arr[2] === 0x44 && // D
    arr[3] === 0x46 // F
  );
}
