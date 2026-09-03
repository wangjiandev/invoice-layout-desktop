export const invoiceCategories = [
  'unclassified',
  'ai_subscription',
  'lodging',
  'taxi',
  'flight',
  'rail',
  'other',
] as const;

export type InvoiceCategory = (typeof invoiceCategories)[number];

export const categoryLabels: Record<InvoiceCategory, string> = {
  unclassified: '未分类',
  ai_subscription: 'AI 订阅',
  lodging: '住宿',
  taxi: '打车',
  flight: '机票',
  rail: '火车票',
  other: '其他',
};

export type LayoutMode = 'standard_2up' | 'rail_8up';
export type InvoiceStatus = 'pending' | 'ready' | 'error';

export interface LocalPdfDescriptor {
  path: string;
  fileName: string;
  sizeBytes: number;
}

export interface InvoiceItem extends LocalPdfDescriptor {
  id: string;
  category: InvoiceCategory;
  amount: string | null;
  layoutMode: LayoutMode;
  order: number;
  status: InvoiceStatus;
}

export interface LayoutSettings {
  paperSize: 'A4';
  standardPerPage: 2;
  railPerPage: 8;
  marginMm: number;
  showCutLines: boolean;
  includeSummary: boolean;
}

export interface CategoryStatistic {
  category: InvoiceCategory;
  count: number;
  amount: string;
}

export interface InvoiceStatistics {
  totalCount: number;
  valuedCount: number;
  totalAmount: string;
  byCategory: CategoryStatistic[];
}

export interface AnalyzeInvoicesRequest {
  paths: string[];
}

export interface GenerateA4PdfRequest {
  invoices: InvoiceItem[];
  settings: LayoutSettings;
  outputPath: string;
}

export interface PrintPdfRequest {
  path: string;
  printerName?: string;
}

export interface DesktopApi {
  pickPdfFiles: () => Promise<LocalPdfDescriptor[]>;
  getDroppedFilePath: (file: File) => string;
  inspectPdfPaths: (paths: string[]) => Promise<LocalPdfDescriptor[]>;
  getLayoutSettings: () => Promise<LayoutSettings>;
  saveLayoutSettings: (settings: LayoutSettings) => Promise<LayoutSettings>;
}

export const defaultLayoutSettings: LayoutSettings = {
  paperSize: 'A4',
  standardPerPage: 2,
  railPerPage: 8,
  marginMm: 5,
  showCutLines: true,
  includeSummary: true,
};
