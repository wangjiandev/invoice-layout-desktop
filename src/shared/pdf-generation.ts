import fontkit from '@pdf-lib/fontkit';
import Decimal from 'decimal.js';
import { PDFDocument, PDFPage, PDFFont, degrees, rgb, type PDFEmbeddedPage } from 'pdf-lib';
import { calculateStatistics } from './finance';
import {
  categoryLabels,
  type GeneratedPdfInput,
  type InvoiceItem,
  type LayoutMode,
  type LayoutSettings,
  type Rotation,
} from './types';

export const A4_WIDTH_PT = 595.28;
export const A4_HEIGHT_PT = 841.89;
const MM_TO_PT = 72 / 25.4;
const CELL_PADDING_PT = 2 * MM_TO_PT;

export interface PdfGenerationRequest {
  items: InvoiceItem[];
  settings: LayoutSettings;
  sources: Array<{ fileId: string; bytes: Uint8Array }>;
  fontBytes: Uint8Array;
  generatedAt: string;
}

interface Cell {
  x: number;
  y: number;
  width: number;
  height: number;
}

function safeText(text: string): string {
  return Array.from(text.normalize('NFKC').replace(/[\u{1F000}-\u{1FAFF}]/gu, '□'))
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint < 32 || codePoint === 127 ? ' ' : character;
    })
    .join('');
}

function truncate(font: PDFFont, text: string, size: number, maxWidth: number): string {
  const normalized = safeText(text);
  if (font.widthOfTextAtSize(normalized, size) <= maxWidth) return normalized;
  let value = normalized;
  while (value.length > 1 && font.widthOfTextAtSize(`${value}…`, size) > maxWidth) {
    value = value.slice(0, -1);
  }
  return `${value}…`;
}

async function createDocument(
  fontBytes: Uint8Array,
): Promise<{ document: PDFDocument; font: PDFFont }> {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  // The bundled asset is already a compact Simplified Chinese subset. Keep its
  // complete cmap: re-subsetting this converted font drops composite glyphs in
  // Preview and Poppler.
  const font = await document.embedFont(fontBytes, { subset: false });
  document.setCreator('票据排版助手');
  document.setProducer('票据排版助手 / pdf-lib');
  return { document, font };
}

function drawFooter(page: PDFPage, font: PDFFont, label: string, pageNumber: number): void {
  page.drawText(`${label} · 第 ${pageNumber} 页`, {
    x: 24,
    y: 14,
    size: 7,
    font,
    color: rgb(0.55, 0.57, 0.53),
  });
}

function drawSummaryPages(
  document: PDFDocument,
  font: PDFFont,
  items: InvoiceItem[],
  generatedAt: string,
): void {
  const statistics = calculateStatistics(items);
  const pageGroups: InvoiceItem[][] = [];
  pageGroups.push(items.slice(0, 20));
  for (let index = 20; index < items.length; index += 28) {
    pageGroups.push(items.slice(index, index + 28));
  }

  pageGroups.forEach((group, groupIndex) => {
    const page = document.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const left = 42;
    let y = A4_HEIGHT_PT - 68;
    page.drawText(groupIndex === 0 ? '报销票据汇总' : '报销明细（续）', {
      x: left,
      y,
      size: 22,
      font,
      color: rgb(0.1, 0.13, 0.11),
    });
    y -= 25;
    page.drawText(`生成时间：${generatedAt.replace('T', ' ').slice(0, 16)}`, {
      x: left,
      y,
      size: 9,
      font,
      color: rgb(0.42, 0.45, 0.4),
    });
    y -= 30;

    if (groupIndex === 0) {
      page.drawRectangle({
        x: left,
        y: y - 54,
        width: A4_WIDTH_PT - left * 2,
        height: 54,
        color: rgb(0.94, 0.96, 0.87),
        borderColor: rgb(0.82, 0.85, 0.72),
        borderWidth: 0.6,
      });
      page.drawText('报销总金额', { x: left + 14, y: y - 22, size: 10, font });
      page.drawText(`¥${statistics.totalAmount}`, {
        x: left + 14,
        y: y - 45,
        size: 19,
        font,
        color: rgb(0.24, 0.34, 0.11),
      });
      page.drawText(`${statistics.totalCount} 份票据`, {
        x: A4_WIDTH_PT - left - 90,
        y: y - 34,
        size: 10,
        font,
      });
      y -= 76;

      page.drawText('分类统计', { x: left, y, size: 13, font });
      y -= 19;
      for (const statistic of statistics.byCategory.filter((entry) => entry.count > 0)) {
        page.drawText(`${categoryLabels[statistic.category]}  ${statistic.count} 份`, {
          x: left + 5,
          y,
          size: 9,
          font,
        });
        const amount = `¥${statistic.amount}`;
        page.drawText(amount, {
          x: A4_WIDTH_PT - left - font.widthOfTextAtSize(amount, 9),
          y,
          size: 9,
          font,
        });
        page.drawLine({
          start: { x: left, y: y - 6 },
          end: { x: A4_WIDTH_PT - left, y: y - 6 },
          thickness: 0.35,
          color: rgb(0.85, 0.86, 0.82),
        });
        y -= 20;
      }
      y -= 10;
    }

    page.drawText('逐票明细', { x: left, y, size: 13, font });
    y -= 20;
    page.drawText('序号', { x: left, y, size: 8, font });
    page.drawText('文件 / 页码', { x: left + 38, y, size: 8, font });
    page.drawText('分类', { x: 405, y, size: 8, font });
    page.drawText('金额', { x: 486, y, size: 8, font });
    y -= 8;
    page.drawLine({
      start: { x: left, y },
      end: { x: A4_WIDTH_PT - left, y },
      thickness: 0.7,
      color: rgb(0.35, 0.38, 0.33),
    });
    y -= 16;

    for (const item of group) {
      page.drawText(String(item.order + 1), { x: left, y, size: 8, font });
      const fileLabel =
        item.pageCount > 1
          ? `${item.fileName} · ${item.pageIndex + 1}/${item.pageCount}`
          : item.fileName;
      page.drawText(truncate(font, fileLabel, 8, 315), { x: left + 38, y, size: 8, font });
      page.drawText(categoryLabels[item.category], { x: 405, y, size: 8, font });
      const amount = `¥${item.amount ?? '0.00'}`;
      page.drawText(amount, {
        x: A4_WIDTH_PT - left - font.widthOfTextAtSize(amount, 8),
        y,
        size: 8,
        font,
      });
      y -= 22;
    }
    drawFooter(page, font, '汇总', groupIndex + 1);
  });
}

function cellsForPage(mode: LayoutMode, marginPt: number): Cell[] {
  const usableWidth = A4_WIDTH_PT - marginPt * 2;
  const usableHeight = A4_HEIGHT_PT - marginPt * 2;
  const columns = mode === 'rail_8up' ? 2 : 1;
  const rows = mode === 'rail_8up' ? 4 : 2;
  const cellWidth = usableWidth / columns;
  const cellHeight = usableHeight / rows;
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      cells.push({
        x: marginPt + column * cellWidth,
        y: A4_HEIGHT_PT - marginPt - (row + 1) * cellHeight,
        width: cellWidth,
        height: cellHeight,
      });
    }
  }
  return cells;
}

function drawCutLines(page: PDFPage, mode: LayoutMode, marginPt: number): void {
  const color = rgb(0.72, 0.73, 0.69);
  const left = marginPt;
  const right = A4_WIDTH_PT - marginPt;
  const bottom = marginPt;
  const top = A4_HEIGHT_PT - marginPt;
  if (mode === 'standard_2up') {
    page.drawLine({
      start: { x: left, y: A4_HEIGHT_PT / 2 },
      end: { x: right, y: A4_HEIGHT_PT / 2 },
      thickness: 0.6,
      dashArray: [5, 4],
      color,
    });
    return;
  }

  page.drawLine({
    start: { x: A4_WIDTH_PT / 2, y: bottom },
    end: { x: A4_WIDTH_PT / 2, y: top },
    thickness: 0.45,
    dashArray: [4, 3],
    color,
  });
  const usableHeight = top - bottom;
  for (let row = 1; row < 4; row += 1) {
    const y = top - (usableHeight * row) / 4;
    page.drawLine({
      start: { x: left, y },
      end: { x: right, y },
      thickness: row === 2 ? 0.9 : 0.45,
      dashArray: row === 2 ? [7, 4] : [4, 3],
      color,
    });
  }
}

function rotationOrigin(
  rotation: Rotation,
  x: number,
  y: number,
  scaledWidth: number,
  scaledHeight: number,
): { x: number; y: number } {
  if (rotation === 90) return { x: x + scaledHeight, y };
  if (rotation === 180) return { x: x + scaledWidth, y: y + scaledHeight };
  if (rotation === 270) return { x, y: y + scaledWidth };
  return { x, y };
}

function drawEmbeddedInvoice(
  page: PDFPage,
  embedded: PDFEmbeddedPage,
  item: InvoiceItem,
  cell: Cell,
): void {
  const rotated = item.transform.rotation === 90 || item.transform.rotation === 270;
  const sourceWidth = rotated ? embedded.height : embedded.width;
  const sourceHeight = rotated ? embedded.width : embedded.height;
  const innerWidth = Math.max(1, cell.width - CELL_PADDING_PT * 2);
  const innerHeight = Math.max(1, cell.height - CELL_PADDING_PT * 2);
  const fitScale = Math.min(innerWidth / sourceWidth, innerHeight / sourceHeight);
  const scale = (fitScale * Math.min(100, Math.max(50, item.transform.scalePercent))) / 100;
  const boundingWidth = sourceWidth * scale;
  const boundingHeight = sourceHeight * scale;
  const freeX = Math.max(0, innerWidth - boundingWidth);
  const freeY = Math.max(0, innerHeight - boundingHeight);
  const requestedX = item.transform.offsetXmm * MM_TO_PT;
  const requestedY = item.transform.offsetYmm * MM_TO_PT;
  const offsetX = Math.min(freeX / 2, Math.max(-freeX / 2, requestedX));
  const offsetY = Math.min(freeY / 2, Math.max(-freeY / 2, requestedY));
  const x = cell.x + CELL_PADDING_PT + freeX / 2 + offsetX;
  const y = cell.y + CELL_PADDING_PT + freeY / 2 + offsetY;
  const origin = rotationOrigin(
    item.transform.rotation,
    x,
    y,
    embedded.width * scale,
    embedded.height * scale,
  );
  page.drawPage(embedded, {
    x: origin.x,
    y: origin.y,
    xScale: scale,
    yScale: scale,
    rotate: degrees(item.transform.rotation),
  });
}

async function drawLayoutPages(
  document: PDFDocument,
  font: PDFFont,
  items: InvoiceItem[],
  mode: LayoutMode,
  settings: LayoutSettings,
  sources: Map<string, Uint8Array>,
  footerLabel: string,
): Promise<void> {
  const perPage = mode === 'rail_8up' ? 8 : 2;
  const marginPt = settings.marginMm * MM_TO_PT;
  const cells = cellsForPage(mode, marginPt);
  const embeddedCache = new Map<string, PDFEmbeddedPage>();

  for (let start = 0; start < items.length; start += perPage) {
    const page = document.addPage([A4_WIDTH_PT, A4_HEIGHT_PT]);
    const group = items.slice(start, start + perPage);
    for (let index = 0; index < group.length; index += 1) {
      const item = group[index];
      const cacheKey = `${item.fileId}:${item.pageIndex}`;
      let embedded = embeddedCache.get(cacheKey);
      if (!embedded) {
        const bytes = sources.get(item.fileId);
        if (!bytes) throw new Error(`缺少源文件：${item.fileName}`);
        [embedded] = await document.embedPdf(bytes, [item.pageIndex]);
        embeddedCache.set(cacheKey, embedded);
      }
      drawEmbeddedInvoice(page, embedded, item, cells[index]);
    }
    if (settings.showCutLines) drawCutLines(page, mode, marginPt);
    drawFooter(page, font, footerLabel, Math.floor(start / perPage) + 1);
  }
}

async function finalize(document: PDFDocument): Promise<Uint8Array> {
  const bytes = await document.save({ useObjectStreams: true });
  const verified = await PDFDocument.load(bytes);
  for (const page of verified.getPages()) {
    const { width, height } = page.getSize();
    if (Math.abs(width - A4_WIDTH_PT) > 0.1 || Math.abs(height - A4_HEIGHT_PT) > 0.1) {
      throw new Error('生成结果包含非 A4 页面');
    }
  }
  return bytes;
}

export async function generatePdfArtifacts(
  request: PdfGenerationRequest,
): Promise<GeneratedPdfInput[]> {
  const ordered = [...request.items].sort((left, right) => left.order - right.order);
  const standard = ordered.filter((item) => item.layoutMode === 'standard_2up');
  const rail = ordered.filter((item) => item.layoutMode === 'rail_8up');
  const sources = new Map(request.sources.map((source) => [source.fileId, source.bytes]));
  const outputs: GeneratedPdfInput[] = [];

  const bundle = await createDocument(request.fontBytes);
  bundle.document.setTitle('报销打印包');
  if (request.settings.includeSummary) {
    drawSummaryPages(bundle.document, bundle.font, ordered, request.generatedAt);
  }
  await drawLayoutPages(
    bundle.document,
    bundle.font,
    standard,
    'standard_2up',
    request.settings,
    sources,
    '普通票据',
  );
  await drawLayoutPages(
    bundle.document,
    bundle.font,
    rail,
    'rail_8up',
    request.settings,
    sources,
    '铁路票据',
  );
  const bundleBytes = await finalize(bundle.document);
  outputs.push({ kind: 'bundle', bytes: bundleBytes, pageCount: bundle.document.getPageCount() });

  if (standard.length > 0) {
    const output = await createDocument(request.fontBytes);
    output.document.setTitle('普通票据');
    await drawLayoutPages(
      output.document,
      output.font,
      standard,
      'standard_2up',
      request.settings,
      sources,
      '普通票据',
    );
    const bytes = await finalize(output.document);
    outputs.push({ kind: 'standard', bytes, pageCount: output.document.getPageCount() });
  }

  if (rail.length > 0) {
    const output = await createDocument(request.fontBytes);
    output.document.setTitle('铁路票据');
    await drawLayoutPages(
      output.document,
      output.font,
      rail,
      'rail_8up',
      request.settings,
      sources,
      '铁路票据',
    );
    const bytes = await finalize(output.document);
    outputs.push({ kind: 'rail', bytes, pageCount: output.document.getPageCount() });
  }

  const inputTotal = ordered.reduce((sum, item) => sum.plus(item.amount ?? 0), new Decimal(0));
  const statisticsTotal = new Decimal(calculateStatistics(ordered).totalAmount);
  if (!inputTotal.equals(statisticsTotal)) throw new Error('生成前后金额汇总不一致');
  return outputs;
}
