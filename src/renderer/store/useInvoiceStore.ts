import { create } from 'zustand';
import { normalizeMoney, parseMoney } from '../../shared/finance';
import {
  defaultLayoutSettings,
  defaultLayoutTransform,
  type AnalysisResult,
  type InvoiceCategory,
  type InvoiceDocument,
  type InvoiceItem,
  type LayoutMode,
  type LayoutSettings,
  type LayoutTransform,
  type RegisteredPdfDescriptor,
} from '../../shared/types';

interface InvoiceStore {
  documents: InvoiceDocument[];
  items: InvoiceItem[];
  settings: LayoutSettings;
  notice: string | null;
  revision: number;
  isGenerating: boolean;
  addDocuments: (
    descriptors: RegisteredPdfDescriptor[],
    duplicateCount?: number,
    rejectedCount?: number,
  ) => void;
  applyAnalysis: (result: AnalysisResult) => void;
  removeItem: (id: string) => string | null;
  moveItem: (activeId: string, overId: string) => void;
  updateCategory: (id: string, category: InvoiceCategory) => void;
  updateAmount: (id: string, amount: string | null) => void;
  updateLayoutMode: (id: string, layoutMode: LayoutMode) => void;
  updateTransform: (id: string, patch: Partial<LayoutTransform>) => void;
  resetTransform: (id: string) => void;
  confirmItem: (id: string) => boolean;
  updateSettings: (patch: Partial<LayoutSettings>) => void;
  hydrateSettings: () => Promise<void>;
  setGenerating: (value: boolean) => void;
  setNotice: (notice: string | null) => void;
}

function resequence(items: InvoiceItem[]): InvoiceItem[] {
  return items.map((item, order) => ({ ...item, order }));
}

function pendingItem(descriptor: RegisteredPdfDescriptor, order: number): InvoiceItem {
  return {
    id: `${descriptor.fileId}:pending`,
    documentId: descriptor.fileId,
    fileId: descriptor.fileId,
    contentHash: descriptor.contentHash,
    fileName: descriptor.fileName,
    sizeBytes: descriptor.sizeBytes,
    pageIndex: 0,
    pageCount: 1,
    category: descriptor.categoryHint ?? 'unclassified',
    amount: null,
    layoutMode: descriptor.categoryHint === 'rail' ? 'rail_8up' : 'standard_2up',
    order,
    status: 'analyzing',
    reviewState: 'review_required',
    confidence: 0,
    issues: [],
    categorySource: descriptor.categoryHint ? 'path_hint' : 'missing',
    amountSource: 'missing',
    transform: { ...defaultLayoutTransform },
  };
}

function markManualReview(item: InvoiceItem): InvoiceItem {
  if (item.status === 'error') return item;
  return {
    ...item,
    status: 'review_required',
    reviewState: 'review_required',
    confidence: 1,
  };
}

export function getGenerationBlockers(items: InvoiceItem[]): string[] {
  if (items.length === 0) return ['请先导入 PDF 票据'];
  const blockers: string[] = [];
  if (items.some((item) => item.status === 'analyzing' || item.status === 'pending')) {
    blockers.push('仍有票据正在分析');
  }
  if (items.some((item) => item.status === 'error')) blockers.push('存在无法处理的 PDF');
  if (items.some((item) => item.category === 'unclassified')) blockers.push('存在未分类票据');
  if (items.some((item) => parseMoney(item.amount) === null)) blockers.push('存在未填写金额的票据');
  if (items.some((item) => item.reviewState === 'review_required'))
    blockers.push('存在待人工确认的票据');
  return blockers;
}

export function summarizeStatuses(items: InvoiceItem[]) {
  return {
    analyzing: items.filter((item) => item.status === 'analyzing' || item.status === 'pending')
      .length,
    review: items.filter(
      (item) => item.reviewState === 'review_required' && item.status !== 'error',
    ).length,
    error: items.filter((item) => item.status === 'error').length,
    confirmed: items.filter(
      (item) => item.reviewState !== 'review_required' && item.status === 'ready',
    ).length,
  };
}

export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  documents: [],
  items: [],
  settings: defaultLayoutSettings,
  notice: null,
  revision: 0,
  isGenerating: false,

  addDocuments: (descriptors, duplicateCount = 0, rejectedCount = 0) => {
    const startOrder = get().items.length;
    const newDocuments: InvoiceDocument[] = descriptors.map((descriptor) => ({
      ...descriptor,
      pageCount: null,
    }));
    const newItems = descriptors.map((descriptor, index) =>
      pendingItem(descriptor, startOrder + index),
    );
    const messages = [`已导入 ${descriptors.length} 份 PDF`];
    if (duplicateCount) messages.push(`忽略 ${duplicateCount} 份重复文件`);
    if (rejectedCount) messages.push(`拒绝 ${rejectedCount} 份无效文件`);
    set((state) => ({
      documents: [...state.documents, ...newDocuments],
      items: [...state.items, ...newItems],
      revision: state.revision + 1,
      notice: messages.join('，'),
    }));
  },

  applyAnalysis: (result) =>
    set((state) => {
      const placeholderIndex = state.items.findIndex((item) => item.fileId === result.fileId);
      if (placeholderIndex < 0) return state;
      const placeholder = state.items[placeholderIndex];
      const analyzedItems: InvoiceItem[] = result.pages.map((page, index) => ({
        id: `${result.fileId}:${page.pageIndex}`,
        documentId: result.fileId,
        fileId: result.fileId,
        contentHash: placeholder.contentHash,
        fileName: placeholder.fileName,
        sizeBytes: placeholder.sizeBytes,
        pageIndex: page.pageIndex,
        pageCount: page.pageCount,
        category: page.category,
        amount: page.amount,
        layoutMode: page.layoutMode,
        order: placeholder.order + index,
        status: page.status,
        reviewState: page.reviewState,
        confidence: page.confidence,
        issues: page.issues,
        categorySource: page.categorySource,
        amountSource: page.amountSource,
        transform: { ...defaultLayoutTransform },
      }));
      const remaining = state.items.filter((item) => item.fileId !== result.fileId);
      remaining.splice(placeholderIndex, 0, ...analyzedItems);
      return {
        items: resequence(remaining),
        documents: state.documents.map((document) =>
          document.fileId === result.fileId
            ? { ...document, pageCount: result.pageCount }
            : document,
        ),
        revision: state.revision + 1,
      };
    }),

  removeItem: (id) => {
    const current = get().items;
    const item = current.find((candidate) => candidate.id === id);
    if (!item) return null;
    const next = current.filter((candidate) => candidate.id !== id);
    const releaseFile = !next.some((candidate) => candidate.fileId === item.fileId);
    set((state) => ({
      items: resequence(next),
      documents: releaseFile
        ? state.documents.filter((document) => document.fileId !== item.fileId)
        : state.documents,
      revision: state.revision + 1,
    }));
    return releaseFile ? item.fileId : null;
  },

  moveItem: (activeId, overId) =>
    set((state) => {
      const from = state.items.findIndex((item) => item.id === activeId);
      const to = state.items.findIndex((item) => item.id === overId);
      if (from < 0 || to < 0 || from === to) return state;
      const next = [...state.items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { items: resequence(next), revision: state.revision + 1 };
    }),

  updateCategory: (id, category) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? markManualReview({
              ...item,
              category,
              categorySource: 'manual',
              layoutMode: category === 'rail' ? 'rail_8up' : item.layoutMode,
            })
          : item,
      ),
      revision: state.revision + 1,
    })),

  updateAmount: (id, amount) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? markManualReview({ ...item, amount, amountSource: amount ? 'manual' : 'missing' })
          : item,
      ),
      revision: state.revision + 1,
    })),

  updateLayoutMode: (id, layoutMode) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, layoutMode } : item)),
      revision: state.revision + 1,
    })),

  updateTransform: (id, patch) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              transform: {
                ...item.transform,
                ...patch,
                scalePercent: Math.min(
                  100,
                  Math.max(50, patch.scalePercent ?? item.transform.scalePercent),
                ),
                offsetXmm: Math.min(30, Math.max(-30, patch.offsetXmm ?? item.transform.offsetXmm)),
                offsetYmm: Math.min(30, Math.max(-30, patch.offsetYmm ?? item.transform.offsetYmm)),
              },
            }
          : item,
      ),
      revision: state.revision + 1,
    })),

  resetTransform: (id) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id ? { ...item, transform: { ...defaultLayoutTransform } } : item,
      ),
      revision: state.revision + 1,
    })),

  confirmItem: (id) => {
    const item = get().items.find((candidate) => candidate.id === id);
    if (!item || item.status === 'error') return false;
    const normalized = item.amount ? normalizeMoney(item.amount) : null;
    if (!normalized || item.category === 'unclassified') return false;
    set((state) => ({
      items: state.items.map((candidate) =>
        candidate.id === id
          ? {
              ...candidate,
              amount: normalized,
              status: 'ready',
              reviewState: 'manual_confirmed',
              issues: [],
            }
          : candidate,
      ),
      revision: state.revision + 1,
      notice: '票据信息已确认',
    }));
    return true;
  },

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set((state) => ({ settings, revision: state.revision + 1 }));
    void window.invoiceApp.saveLayoutSettings(settings).catch(() => {
      set({ notice: '排版设置暂时无法保存，本次会话仍可继续使用' });
    });
  },

  hydrateSettings: async () => {
    try {
      set({ settings: await window.invoiceApp.getLayoutSettings() });
    } catch {
      set({ notice: '未能读取本地设置，已使用默认值' });
    }
  },

  setGenerating: (isGenerating) => set({ isGenerating }),
  setNotice: (notice) => set({ notice }),
}));
