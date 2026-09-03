import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultLayoutSettings } from '../shared/types';
import App from './App';
import { useInvoiceStore } from './store/useInvoiceStore';

vi.mock('./services/pdf-source-cache', () => ({
  getSourcePdfBytes: vi.fn(async () => new Uint8Array([1, 2, 3])),
  getSourcePdfDocument: vi.fn(() => new Promise(() => undefined)),
  releaseSourcePdf: vi.fn(),
}));

vi.mock('./services/pdf-engine', () => ({
  analyzePdfDocument: vi.fn(async (descriptor: { fileId: string }) => ({
    fileId: descriptor.fileId,
    pageCount: 1,
    pages: [
      {
        pageIndex: 0,
        pageCount: 1,
        widthPt: 595,
        heightPt: 396,
        category: 'taxi',
        amount: '102.30',
        layoutMode: 'standard_2up',
        status: 'ready',
        reviewState: 'auto_confirmed',
        confidence: 0.98,
        issues: [],
        categorySource: 'automatic',
        amountSource: 'automatic',
      },
    ],
  })),
}));

vi.mock('./services/pdf-generation-client', () => ({
  generatePdfsInWorker: vi.fn(),
}));

describe('App', () => {
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

  it('renders the empty workspace and fixed layout controls', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '票据排版助手' })).toBeInTheDocument();
    expect(screen.getByText('还没有票据')).toBeInTheDocument();
    expect(screen.getByText('每页 2 份')).toBeInTheDocument();
    expect(screen.getByText('每页 8 份')).toBeInTheDocument();
  });

  it('imports PDF descriptors and reports hash duplicates', async () => {
    const user = userEvent.setup();
    const picker = window.invoiceApp.pickPdfFiles as ReturnType<typeof vi.fn>;
    picker.mockResolvedValue({
      documents: [
        {
          fileId: crypto.randomUUID(),
          contentHash: 'hash-a',
          fileName: 'a.pdf',
          sizeBytes: 1000,
          categoryHint: 'taxi',
        },
      ],
      duplicateCount: 1,
      rejectedCount: 0,
    });
    render(<App />);
    await user.click(screen.getByRole('button', { name: '选择 PDF' }));
    expect(await screen.findAllByTestId('invoice-row')).toHaveLength(1);
    expect(screen.getByText(/忽略 1 份重复文件/)).toBeInTheDocument();
  });

  it('shows automatically recognized category statistics', async () => {
    const user = userEvent.setup();
    const picker = window.invoiceApp.pickPdfFiles as ReturnType<typeof vi.fn>;
    picker.mockResolvedValue({
      documents: [
        {
          fileId: crypto.randomUUID(),
          contentHash: 'hash-taxi',
          fileName: 'taxi.pdf',
          sizeBytes: 1200,
          categoryHint: 'taxi',
        },
      ],
      duplicateCount: 0,
      rejectedCount: 0,
    });
    render(<App />);
    await user.click(screen.getByRole('button', { name: '选择 PDF' }));
    expect(await screen.findByText('可以生成')).toBeInTheDocument();
    expect(screen.getAllByText('¥102.30')).toHaveLength(2);
    expect(screen.getByText('已确认')).toBeInTheDocument();
  });

  it('keeps generation disabled when no invoice is loaded', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: '生成 A4 PDF' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '打印' })).toBeDisabled();
  });
});
