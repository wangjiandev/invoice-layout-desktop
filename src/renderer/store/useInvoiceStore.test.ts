import { beforeEach, describe, expect, it } from 'vitest';
import { defaultLayoutSettings, type AnalysisResult } from '../../shared/types';
import { getGenerationBlockers, useInvoiceStore } from './useInvoiceStore';

function descriptor(name: string, hint: 'rail' | null = null) {
  return {
    fileId: crypto.randomUUID(),
    contentHash: `hash-${name}`,
    fileName: name,
    sizeBytes: 100,
    categoryHint: hint,
  };
}

function analysis(fileId: string, category: 'taxi' | 'rail' = 'taxi'): AnalysisResult {
  return {
    fileId,
    pageCount: 1,
    pages: [
      {
        pageIndex: 0,
        pageCount: 1,
        widthPt: 595,
        heightPt: 396,
        category,
        amount: '10.00',
        layoutMode: category === 'rail' ? 'rail_8up' : 'standard_2up',
        status: 'ready',
        reviewState: 'auto_confirmed',
        confidence: 0.98,
        issues: [],
        categorySource: 'automatic',
        amountSource: 'automatic',
      },
    ],
  };
}

describe('useInvoiceStore', () => {
  beforeEach(() => {
    useInvoiceStore.setState({
      documents: [],
      items: [],
      settings: defaultLayoutSettings,
      notice: null,
      revision: 0,
      isGenerating: false,
    });
  });

  it('expands analyzed documents and reorders page items', () => {
    const first = descriptor('a.pdf');
    const second = descriptor('b.pdf');
    useInvoiceStore.getState().addDocuments([first, second]);
    useInvoiceStore.getState().applyAnalysis(analysis(first.fileId));
    useInvoiceStore.getState().applyAnalysis(analysis(second.fileId));
    const imported = useInvoiceStore.getState().items;
    useInvoiceStore.getState().moveItem(imported[1].id, imported[0].id);
    expect(useInvoiceStore.getState().items.map((item) => item.fileName)).toEqual([
      'b.pdf',
      'a.pdf',
    ]);
    expect(useInvoiceStore.getState().items.map((item) => item.order)).toEqual([0, 1]);
  });

  it('switches a rail category to the eight-up layout and requires confirmation', () => {
    const source = descriptor('rail.pdf');
    useInvoiceStore.getState().addDocuments([source]);
    useInvoiceStore.getState().applyAnalysis(analysis(source.fileId));
    const item = useInvoiceStore.getState().items[0];
    useInvoiceStore.getState().updateCategory(item.id, 'rail');
    expect(useInvoiceStore.getState().items[0]).toMatchObject({
      category: 'rail',
      layoutMode: 'rail_8up',
      reviewState: 'review_required',
    });
  });

  it('blocks generation until a manual edit is confirmed', () => {
    const source = descriptor('invoice.pdf');
    useInvoiceStore.getState().addDocuments([source]);
    useInvoiceStore.getState().applyAnalysis(analysis(source.fileId));
    const item = useInvoiceStore.getState().items[0];
    useInvoiceStore.getState().updateAmount(item.id, '12.00');
    expect(getGenerationBlockers(useInvoiceStore.getState().items)).toContain(
      '存在待人工确认的票据',
    );
    expect(useInvoiceStore.getState().confirmItem(item.id)).toBe(true);
    expect(getGenerationBlockers(useInvoiceStore.getState().items)).toEqual([]);
  });
});
