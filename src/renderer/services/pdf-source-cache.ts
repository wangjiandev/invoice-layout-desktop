import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdf } from './pdf-engine';

const sourceCache = new Map<string, Uint8Array>();
const documentCache = new Map<string, Promise<PDFDocumentProxy>>();

export async function getSourcePdfBytes(fileId: string): Promise<Uint8Array> {
  const cached = sourceCache.get(fileId);
  if (cached) return cached;
  const bytes = new Uint8Array(await window.invoiceApp.readRegisteredPdf(fileId));
  sourceCache.set(fileId, bytes);
  return bytes;
}

export function getSourcePdfDocument(fileId: string): Promise<PDFDocumentProxy> {
  let document = documentCache.get(fileId);
  if (!document) {
    document = getSourcePdfBytes(fileId).then((bytes) => openPdf(bytes));
    documentCache.set(fileId, document);
  }
  return document;
}

export function releaseSourcePdf(fileId: string): void {
  sourceCache.delete(fileId);
  const document = documentCache.get(fileId);
  documentCache.delete(fileId);
  if (document) void document.then((pdf) => pdf.loadingTask.destroy()).catch(() => undefined);
}

export function clearSourcePdfCache(): void {
  sourceCache.clear();
  for (const document of documentCache.values()) {
    void document.then((pdf) => pdf.loadingTask.destroy()).catch(() => undefined);
  }
  documentCache.clear();
}
