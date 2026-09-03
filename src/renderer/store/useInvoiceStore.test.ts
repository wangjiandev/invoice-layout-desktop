import { beforeEach, describe, expect, it } from 'vitest';
import { defaultLayoutSettings } from '../../shared/types';
import { useInvoiceStore } from './useInvoiceStore';

describe('useInvoiceStore', () => {
  beforeEach(() => {
    useInvoiceStore.setState({ items: [], settings: defaultLayoutSettings, notice: null });
  });

  it('reorders and resequences imported files', () => {
    const store = useInvoiceStore.getState();
    store.addDescriptors([
      { path: '/synthetic/a.pdf', fileName: 'a.pdf', sizeBytes: 100 },
      { path: '/synthetic/b.pdf', fileName: 'b.pdf', sizeBytes: 200 },
      { path: '/synthetic/c.pdf', fileName: 'c.pdf', sizeBytes: 300 },
    ]);

    const imported = useInvoiceStore.getState().items;
    useInvoiceStore.getState().moveItem(imported[2].id, imported[0].id);

    expect(useInvoiceStore.getState().items.map((item) => item.fileName)).toEqual([
      'c.pdf',
      'a.pdf',
      'b.pdf',
    ]);
    expect(useInvoiceStore.getState().items.map((item) => item.order)).toEqual([0, 1, 2]);
  });

  it('switches a rail category to the eight-up layout', () => {
    useInvoiceStore
      .getState()
      .addDescriptors([{ path: '/synthetic/rail.pdf', fileName: 'rail.pdf', sizeBytes: 100 }]);
    const item = useInvoiceStore.getState().items[0];

    useInvoiceStore.getState().updateCategory(item.id, 'rail');

    expect(useInvoiceStore.getState().items[0]).toMatchObject({
      category: 'rail',
      layoutMode: 'rail_8up',
    });
  });
});
