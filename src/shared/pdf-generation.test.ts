import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { A4_HEIGHT_PT, A4_WIDTH_PT, generatePdfArtifacts } from './pdf-generation';
import { defaultLayoutSettings, defaultLayoutTransform, type InvoiceItem } from './types';

async function syntheticSource(pageCount: number): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (let index = 0; index < pageCount; index += 1) {
    const page = document.addPage([595, 396]);
    page.drawText(`Synthetic invoice ${index + 1}`, { x: 35, y: 330, size: 24, font });
    page.drawText(`Total CNY ${(index + 1) * 10}.00`, { x: 35, y: 240, size: 18, font });
  }
  return document.save();
}

function item(index: number, layoutMode: InvoiceItem['layoutMode']): InvoiceItem {
  return {
    id: `item-${index}`,
    documentId: 'document-1',
    fileId: 'file-1',
    contentHash: 'synthetic-hash',
    fileName: 'synthetic.pdf',
    sizeBytes: 1000,
    pageIndex: index,
    pageCount: 10,
    category: layoutMode === 'rail_8up' ? 'rail' : 'taxi',
    amount: `${(index + 1) * 10}.00`,
    layoutMode,
    order: index,
    status: 'ready',
    reviewState: 'auto_confirmed',
    confidence: 1,
    issues: [],
    categorySource: 'automatic',
    amountSource: 'automatic',
    transform: { ...defaultLayoutTransform },
  };
}

describe('PDF generation', () => {
  it('creates a bundle plus standard and rail booklets on exact A4 pages', async () => {
    const source = await syntheticSource(10);
    const fontBytes = new Uint8Array(
      await readFile(path.join(process.cwd(), 'src/assets/NotoSansSC-Regular.ttf')),
    );
    const items = [
      item(0, 'standard_2up'),
      ...Array.from({ length: 9 }, (_, index) => item(index + 1, 'rail_8up')),
    ];
    const artifacts = await generatePdfArtifacts({
      items,
      settings: defaultLayoutSettings,
      sources: [{ fileId: 'file-1', bytes: source }],
      fontBytes,
      generatedAt: '2026-09-03T12:30:00.000Z',
    });

    expect(artifacts.map((artifact) => [artifact.kind, artifact.pageCount])).toEqual([
      ['bundle', 4],
      ['standard', 1],
      ['rail', 2],
    ]);
    for (const artifact of artifacts) {
      const document = await PDFDocument.load(artifact.bytes);
      for (const page of document.getPages()) {
        expect(page.getWidth()).toBeCloseTo(A4_WIDTH_PT, 1);
        expect(page.getHeight()).toBeCloseTo(A4_HEIGHT_PT, 1);
      }
    }
  }, 30_000);
});
