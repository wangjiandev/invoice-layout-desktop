import { GlobalWorkerOptions, getDocument, type PDFDocumentProxy } from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { analyzeInvoiceText } from '../../shared/invoice-analysis';
import type { AnalysisIssue, AnalysisResult, RegisteredPdfDescriptor } from '../../shared/types';

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

interface PositionedText {
  text: string;
  x: number;
  y: number;
  width: number;
}

function reconstructLines(items: PositionedText[]): string {
  const sorted = [...items].sort((left, right) => {
    if (Math.abs(left.y - right.y) > 2.5) return right.y - left.y;
    return left.x - right.x;
  });
  const lines: PositionedText[][] = [];
  for (const item of sorted) {
    const line = lines.find((candidate) => Math.abs(candidate[0].y - item.y) <= 2.5);
    if (line) line.push(item);
    else lines.push([item]);
  }

  return lines
    .map((line) => {
      const ordered = line.sort((left, right) => left.x - right.x);
      let result = '';
      let previousEnd = Number.NEGATIVE_INFINITY;
      for (const item of ordered) {
        if (result && item.x - previousEnd > 2) result += ' ';
        result += item.text;
        previousEnd = item.x + item.width;
      }
      return result;
    })
    .filter(Boolean)
    .join('\n');
}

async function pageText(document: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await document.getPage(pageNumber);
  const content = await page.getTextContent();
  const items: PositionedText[] = [];
  for (const item of content.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    items.push({
      text: item.str,
      x: item.transform[4],
      y: item.transform[5],
      width: item.width,
    });
  }
  return reconstructLines(items);
}

export async function openPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  return getDocument({
    data: bytes.slice(),
    cMapUrl: new URL('pdfjs/cmaps/', document.baseURI).toString(),
    cMapPacked: true,
    standardFontDataUrl: new URL('pdfjs/standard_fonts/', document.baseURI).toString(),
    wasmUrl: new URL('pdfjs/wasm/', document.baseURI).toString(),
  }).promise;
}

export async function analyzePdfDocument(
  descriptor: RegisteredPdfDescriptor,
  bytes: Uint8Array,
): Promise<AnalysisResult> {
  try {
    const document = await openPdf(bytes);
    const pages = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const analysis = analyzeInvoiceText({
        text: await pageText(document, pageNumber),
        categoryHint: descriptor.categoryHint,
      });
      pages.push({
        pageIndex: pageNumber - 1,
        pageCount: document.numPages,
        widthPt: viewport.width,
        heightPt: viewport.height,
        ...analysis,
      });
    }
    return { fileId: descriptor.fileId, pageCount: document.numPages, pages };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'PDF 解析失败';
    const encrypted = /password/i.test(message);
    const issue: AnalysisIssue = encrypted
      ? { code: 'ENCRYPTED_PDF', message: 'PDF 已加密，请先解除密码保护' }
      : { code: 'INVALID_PDF', message: 'PDF 损坏或格式不受支持' };
    return {
      fileId: descriptor.fileId,
      pageCount: 1,
      pages: [
        {
          pageIndex: 0,
          pageCount: 1,
          widthPt: 0,
          heightPt: 0,
          category: descriptor.categoryHint ?? 'unclassified',
          amount: null,
          layoutMode: descriptor.categoryHint === 'rail' ? 'rail_8up' : 'standard_2up',
          status: 'error',
          reviewState: 'review_required',
          confidence: 0,
          issues: [issue],
          categorySource: descriptor.categoryHint ? 'path_hint' : 'missing',
          amountSource: 'missing',
        },
      ],
    };
  }
}
