import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { defaultLayoutSettings, type DesktopApi } from '../shared/types';

const emptyImport = { documents: [], duplicateCount: 0, rejectedCount: 0 };
const invoiceAppMock: DesktopApi = {
  pickPdfFiles: vi.fn(async () => emptyImport),
  importDroppedPdfFiles: vi.fn(async () => emptyImport),
  readRegisteredPdf: vi.fn(async () => new Uint8Array()),
  releaseRegisteredPdf: vi.fn(async () => undefined),
  getLayoutSettings: vi.fn(async () => defaultLayoutSettings),
  saveLayoutSettings: vi.fn(async (settings) => settings),
  prepareGeneratedPdfs: vi.fn(async () => ({ generationId: crypto.randomUUID(), artifacts: [] })),
  saveGeneratedPdfs: vi.fn(async () => ({ canceled: true, fileNames: [] })),
  printGeneratedPdf: vi.fn(async () => ({ success: false, canceled: true })),
  openGeneratedPdf: vi.fn(async () => true),
  discardGeneration: vi.fn(async () => undefined),
};

Object.defineProperty(window, 'invoiceApp', {
  configurable: true,
  value: invoiceAppMock,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
