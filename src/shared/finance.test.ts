import { describe, expect, it } from 'vitest';
import { calculateStatistics, normalizeMoney, parseMoney } from './finance';
import { defaultLayoutTransform, type InvoiceItem } from './types';

function invoice(overrides: Partial<InvoiceItem>): InvoiceItem {
  return {
    id: crypto.randomUUID(),
    documentId: 'document-id',
    fileId: crypto.randomUUID(),
    contentHash: 'hash',
    fileName: 'invoice.pdf',
    sizeBytes: 1024,
    pageIndex: 0,
    pageCount: 1,
    category: 'unclassified',
    amount: null,
    layoutMode: 'standard_2up',
    order: 0,
    status: 'ready',
    reviewState: 'auto_confirmed',
    confidence: 1,
    issues: [],
    categorySource: 'automatic',
    amountSource: 'automatic',
    transform: defaultLayoutTransform,
    ...overrides,
  };
}

describe('money helpers', () => {
  it('normalizes valid non-negative amounts to two decimals', () => {
    expect(normalizeMoney('200')).toBe('200.00');
    expect(normalizeMoney(' 49.8 ')).toBe('49.80');
    expect(normalizeMoney('0.01')).toBe('0.01');
  });

  it('rejects malformed or negative amounts', () => {
    expect(parseMoney('-1.00')).toBeNull();
    expect(parseMoney('12.345')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
  });

  it('uses decimal arithmetic for category and overall totals', () => {
    const result = calculateStatistics([
      invoice({ id: '1', category: 'taxi', amount: '0.10' }),
      invoice({ id: '2', category: 'taxi', amount: '0.20' }),
      invoice({ id: '3', category: 'lodging', amount: '189.00' }),
      invoice({ id: '4', category: 'rail', amount: null }),
    ]);

    expect(result.totalCount).toBe(4);
    expect(result.valuedCount).toBe(3);
    expect(result.totalAmount).toBe('189.30');
    expect(result.byCategory.find((item) => item.category === 'taxi')).toMatchObject({
      count: 2,
      amount: '0.30',
    });
  });
});
