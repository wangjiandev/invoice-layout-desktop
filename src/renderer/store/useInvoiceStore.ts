import { create } from 'zustand';
import {
  defaultLayoutSettings,
  type InvoiceCategory,
  type InvoiceItem,
  type LayoutMode,
  type LayoutSettings,
  type LocalPdfDescriptor,
} from '../../shared/types';

interface InvoiceStore {
  items: InvoiceItem[];
  settings: LayoutSettings;
  notice: string | null;
  addDescriptors: (descriptors: LocalPdfDescriptor[]) => void;
  removeItem: (id: string) => void;
  moveItem: (activeId: string, overId: string) => void;
  updateCategory: (id: string, category: InvoiceCategory) => void;
  updateAmount: (id: string, amount: string | null) => void;
  updateLayoutMode: (id: string, layoutMode: LayoutMode) => void;
  updateSettings: (patch: Partial<LayoutSettings>) => void;
  hydrateSettings: () => Promise<void>;
  setNotice: (notice: string | null) => void;
}

function resequence(items: InvoiceItem[]): InvoiceItem[] {
  return items.map((item, order) => ({ ...item, order }));
}

export const useInvoiceStore = create<InvoiceStore>((set, get) => ({
  items: [],
  settings: defaultLayoutSettings,
  notice: null,

  addDescriptors: (descriptors) => {
    const existingPaths = new Set(get().items.map((item) => item.path));
    const accepted: LocalPdfDescriptor[] = [];
    let duplicateCount = 0;

    for (const descriptor of descriptors) {
      if (existingPaths.has(descriptor.path)) {
        duplicateCount += 1;
        continue;
      }
      existingPaths.add(descriptor.path);
      accepted.push(descriptor);
    }

    const startOrder = get().items.length;
    const newItems: InvoiceItem[] = accepted.map((descriptor, index) => ({
      ...descriptor,
      id: crypto.randomUUID(),
      category: 'unclassified',
      amount: null,
      layoutMode: 'standard_2up',
      order: startOrder + index,
      status: 'pending',
    }));

    set((state) => ({
      items: [...state.items, ...newItems],
      notice:
        duplicateCount > 0
          ? `已导入 ${newItems.length} 份，忽略 ${duplicateCount} 份重复文件`
          : `已导入 ${newItems.length} 份 PDF`,
    }));
  },

  removeItem: (id) =>
    set((state) => ({
      items: resequence(state.items.filter((item) => item.id !== id)),
    })),

  moveItem: (activeId, overId) =>
    set((state) => {
      const from = state.items.findIndex((item) => item.id === activeId);
      const to = state.items.findIndex((item) => item.id === overId);
      if (from < 0 || to < 0 || from === to) return state;

      const next = [...state.items];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return { items: resequence(next) };
    }),

  updateCategory: (id, category) =>
    set((state) => ({
      items: state.items.map((item) =>
        item.id === id
          ? {
              ...item,
              category,
              layoutMode: category === 'rail' ? 'rail_8up' : item.layoutMode,
            }
          : item,
      ),
    })),

  updateAmount: (id, amount) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, amount } : item)),
    })),

  updateLayoutMode: (id, layoutMode) =>
    set((state) => ({
      items: state.items.map((item) => (item.id === id ? { ...item, layoutMode } : item)),
    })),

  updateSettings: (patch) => {
    const settings = { ...get().settings, ...patch };
    set({ settings });
    void window.invoiceApp.saveLayoutSettings(settings).catch(() => {
      set({ notice: '排版设置暂时无法保存，本次会话仍可继续使用' });
    });
  },

  hydrateSettings: async () => {
    try {
      const settings = await window.invoiceApp.getLayoutSettings();
      set({ settings });
    } catch {
      set({ notice: '未能读取本地设置，已使用默认值' });
    }
  },

  setNotice: (notice) => set({ notice }),
}));
