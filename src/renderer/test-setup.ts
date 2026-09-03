import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
import { defaultLayoutSettings, type DesktopApi } from '../shared/types';

const invoiceAppMock: DesktopApi = {
  pickPdfFiles: vi.fn(async () => []),
  getDroppedFilePath: vi.fn(() => ''),
  inspectPdfPaths: vi.fn(async () => []),
  getLayoutSettings: vi.fn(async () => defaultLayoutSettings),
  saveLayoutSettings: vi.fn(async (settings) => settings),
};

Object.defineProperty(window, 'invoiceApp', {
  configurable: true,
  value: invoiceAppMock,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
