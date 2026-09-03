import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { useInvoiceStore } from './store/useInvoiceStore';
import { defaultLayoutSettings } from '../shared/types';

describe('App', () => {
  beforeEach(() => {
    useInvoiceStore.setState({ items: [], settings: defaultLayoutSettings, notice: null });
  });

  it('renders the empty workspace and fixed layout controls', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: '票据排版助手' })).toBeInTheDocument();
    expect(screen.getByText('还没有票据')).toBeInTheDocument();
    expect(screen.getByText('每页 2 份')).toBeInTheDocument();
    expect(screen.getByText('每页 8 份')).toBeInTheDocument();
  });

  it('imports selected PDF descriptors and ignores duplicate paths', async () => {
    const user = userEvent.setup();
    const picker = window.invoiceApp.pickPdfFiles as ReturnType<typeof vi.fn>;
    picker.mockResolvedValue([
      { path: '/synthetic/a.pdf', fileName: 'a.pdf', sizeBytes: 1000 },
      { path: '/synthetic/a.pdf', fileName: 'a.pdf', sizeBytes: 1000 },
    ]);

    render(<App />);
    await user.click(screen.getByRole('button', { name: '选择 PDF' }));

    expect(await screen.findAllByTestId('invoice-row')).toHaveLength(1);
    expect(screen.getByText(/忽略 1 份重复文件/)).toBeInTheDocument();
  });

  it('keeps generation and printing as explicit pending features', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '生成 A4 PDF' }));
    expect(screen.getByRole('status')).toHaveTextContent('PDF 生成功能将在 PDF 排版阶段接入');
  });

  it('updates category statistics from a committed manual amount', async () => {
    const user = userEvent.setup();
    const picker = window.invoiceApp.pickPdfFiles as ReturnType<typeof vi.fn>;
    picker.mockResolvedValue([
      { path: '/synthetic/taxi.pdf', fileName: 'taxi.pdf', sizeBytes: 1200 },
    ]);

    render(<App />);
    await user.click(screen.getByRole('button', { name: '选择 PDF' }));
    await user.selectOptions(screen.getByLabelText('taxi.pdf 分类'), 'taxi');
    await user.type(screen.getByLabelText('taxi.pdf 金额'), '102.3');
    await user.tab();

    expect(screen.getAllByText('打车')).toHaveLength(2);
    expect(screen.getAllByText('¥102.30')).toHaveLength(2);
  });
});
