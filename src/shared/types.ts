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
export type InvoiceStatus = 'pending' | 'analyzing' | 'ready' | 'review_required' | 'error';
export type ReviewState = 'auto_confirmed' | 'review_required' | 'manual_confirmed';
export type FieldSource = 'automatic' | 'path_hint' | 'manual' | 'missing';
export type Rotation = 0 | 90 | 180 | 270;
export type ArtifactKind = 'bundle' | 'standard' | 'rail';

export interface LayoutTransform {
  rotation: Rotation;
  scalePercent: number;
  offsetXmm: number;
  offsetYmm: number;
}

export interface AnalysisIssue {
  code:
    | 'NO_TEXT_LAYER'
    | 'AMOUNT_NOT_FOUND'
    | 'AMOUNT_MISMATCH'
    | 'CATEGORY_UNCERTAIN'
    | 'ENCRYPTED_PDF'
    | 'INVALID_PDF'
    | 'ANALYSIS_FAILED';
  message: string;
}

export interface InvoiceDocument {
  fileId: string;
  contentHash: string;
  fileName: string;
  sizeBytes: number;
  categoryHint: InvoiceCategory | null;
  pageCount: number | null;
}

export type RegisteredPdfDescriptor = Omit<InvoiceDocument, 'pageCount'>;

export interface ImportPdfResult {
  documents: RegisteredPdfDescriptor[];
  duplicateCount: number;
  rejectedCount: number;
}

export interface InvoiceItem {
  id: string;
  documentId: string;
  fileId: string;
  contentHash: string;
  fileName: string;
  sizeBytes: number;
  pageIndex: number;
  pageCount: number;
  category: InvoiceCategory;
  amount: string | null;
  layoutMode: LayoutMode;
  order: number;
  status: InvoiceStatus;
  reviewState: ReviewState;
  confidence: number;
  issues: AnalysisIssue[];
  categorySource: FieldSource;
  amountSource: FieldSource;
  transform: LayoutTransform;
}

export interface AnalyzedInvoicePage {
  pageIndex: number;
  pageCount: number;
  widthPt: number;
  heightPt: number;
  category: InvoiceCategory;
  amount: string | null;
  layoutMode: LayoutMode;
  status: InvoiceStatus;
  reviewState: ReviewState;
  confidence: number;
  issues: AnalysisIssue[];
  categorySource: FieldSource;
  amountSource: FieldSource;
}

export interface AnalysisResult {
  fileId: string;
  pageCount: number;
  pages: AnalyzedInvoicePage[];
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

export interface GeneratedPdfInput {
  kind: ArtifactKind;
  bytes: Uint8Array;
  pageCount: number;
}

export interface GeneratedPdfArtifact extends GeneratedPdfInput {
  fileName: string;
}

export interface PreparedPdfArtifact {
  kind: ArtifactKind;
  fileName: string;
  pageCount: number;
  sizeBytes: number;
}

export interface GenerationSession {
  generationId: string;
  artifacts: PreparedPdfArtifact[];
}

export interface SaveGeneratedResult {
  canceled: boolean;
  outputDirectory?: string;
  fileNames: string[];
}

export interface PrintGeneratedResult {
  success: boolean;
  canceled: boolean;
  reason?: string;
}

export interface DesktopApi {
  pickPdfFiles: () => Promise<ImportPdfResult>;
  importDroppedPdfFiles: (files: File[]) => Promise<ImportPdfResult>;
  readRegisteredPdf: (fileId: string) => Promise<Uint8Array>;
  releaseRegisteredPdf: (fileId: string) => Promise<void>;
  getLayoutSettings: () => Promise<LayoutSettings>;
  saveLayoutSettings: (settings: LayoutSettings) => Promise<LayoutSettings>;
  prepareGeneratedPdfs: (artifacts: GeneratedPdfInput[]) => Promise<GenerationSession>;
  saveGeneratedPdfs: (generationId: string) => Promise<SaveGeneratedResult>;
  printGeneratedPdf: (generationId: string, kind: ArtifactKind) => Promise<PrintGeneratedResult>;
  openGeneratedPdf: (generationId: string, kind: ArtifactKind) => Promise<boolean>;
  discardGeneration: (generationId: string) => Promise<void>;
}

export const defaultLayoutTransform: LayoutTransform = {
  rotation: 0,
  scalePercent: 100,
  offsetXmm: 0,
  offsetYmm: 0,
};

export const defaultLayoutSettings: LayoutSettings = {
  paperSize: 'A4',
  standardPerPage: 2,
  railPerPage: 8,
  marginMm: 5,
  showCutLines: true,
  includeSummary: true,
};
