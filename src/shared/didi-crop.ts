import type { InvoiceCategory, SourceCrop } from './types';

export interface PositionedPageText {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const FOOTER_MARGIN_PT = 12;
const HIDDEN_MARKER_ALLOWANCE_PT = 25;

export interface PdfPageBox {
  left: number;
  bottom: number;
  right: number;
  top: number;
}

export function detectDidiFooterCrop(
  items: PositionedPageText[],
  pageBox: PdfPageBox,
  category: InvoiceCategory,
  knownDidiDocument = false,
): SourceCrop | undefined {
  if (category !== 'taxi') return undefined;

  const marker = items
    .filter((item) => item.text.normalize('NFKC').trim().toLowerCase() === 'didi')
    .filter((item) => item.y > pageBox.top * 0.15 && item.y < pageBox.top * 0.7)
    .sort((left, right) => left.y - right.y)[0];
  if (!marker && !knownDidiDocument) return undefined;

  const yPt = marker
    ? Math.max(0, marker.y - FOOTER_MARGIN_PT)
    : Math.max(0, pageBox.bottom - HIDDEN_MARKER_ALLOWANCE_PT);
  const heightPt = pageBox.top - yPt;
  if (heightPt < (pageBox.top - pageBox.bottom) * 0.25) return undefined;

  return {
    xPt: pageBox.left,
    yPt,
    widthPt: pageBox.right - pageBox.left,
    heightPt,
    reason: 'didi_footer',
  };
}
