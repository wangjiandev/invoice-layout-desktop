import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { categoryLabels, invoiceCategories, type InvoiceItem } from '../../shared/types';
import { normalizeMoney } from '../../shared/finance';
import { useInvoiceStore } from '../store/useInvoiceStore';

interface SortableInvoiceRowProps {
  item: InvoiceItem;
}

function formatBytes(size: number): string {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function SortableInvoiceRow({ item }: SortableInvoiceRowProps) {
  const [amountDraft, setAmountDraft] = useState(item.amount ?? '');
  const updateCategory = useInvoiceStore((state) => state.updateCategory);
  const updateAmount = useInvoiceStore((state) => state.updateAmount);
  const updateLayoutMode = useInvoiceStore((state) => state.updateLayoutMode);
  const removeItem = useInvoiceStore((state) => state.removeItem);
  const setNotice = useInvoiceStore((state) => state.setNotice);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  useEffect(() => setAmountDraft(item.amount ?? ''), [item.amount]);

  const commitAmount = () => {
    if (amountDraft.trim() === '') {
      updateAmount(item.id, null);
      return;
    }

    const normalized = normalizeMoney(amountDraft);
    if (normalized === null) {
      setAmountDraft(item.amount ?? '');
      setNotice('金额格式无效，请输入不超过两位小数的非负金额');
      return;
    }

    setAmountDraft(normalized);
    updateAmount(item.id, normalized);
  };

  return (
    <article
      ref={setNodeRef}
      className={`invoice-row ${isDragging ? 'is-dragging' : ''}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="invoice-row"
    >
      <button
        type="button"
        className="drag-handle"
        aria-label={`拖动 ${item.fileName}`}
        {...attributes}
        {...listeners}
      >
        ⠿
      </button>

      <div className="pdf-badge" aria-hidden="true">
        PDF
      </div>

      <div className="file-cell">
        <strong title={item.fileName}>{item.fileName}</strong>
        <span>{formatBytes(item.sizeBytes)} · 等待解析</span>
      </div>

      <label className="field-cell">
        <span>分类</span>
        <select
          aria-label={`${item.fileName} 分类`}
          value={item.category}
          onChange={(event) =>
            updateCategory(item.id, event.target.value as InvoiceItem['category'])
          }
        >
          {invoiceCategories.map((category) => (
            <option key={category} value={category}>
              {categoryLabels[category]}
            </option>
          ))}
        </select>
      </label>

      <label className="field-cell amount-cell">
        <span>金额</span>
        <div className="money-input">
          <span>¥</span>
          <input
            aria-label={`${item.fileName} 金额`}
            inputMode="decimal"
            placeholder="0.00"
            value={amountDraft}
            onChange={(event) => setAmountDraft(event.target.value)}
            onBlur={commitAmount}
            onKeyDown={(event) => {
              if (event.key === 'Enter') event.currentTarget.blur();
            }}
          />
        </div>
      </label>

      <label className="field-cell layout-cell">
        <span>排版</span>
        <select
          aria-label={`${item.fileName} 排版`}
          value={item.layoutMode}
          onChange={(event) =>
            updateLayoutMode(item.id, event.target.value as InvoiceItem['layoutMode'])
          }
        >
          <option value="standard_2up">普通 2 联</option>
          <option value="rail_8up">火车票 8 联</option>
        </select>
      </label>

      <button
        type="button"
        className="remove-button"
        aria-label={`删除 ${item.fileName}`}
        onClick={() => removeItem(item.id)}
      >
        ×
      </button>
    </article>
  );
}
