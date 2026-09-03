import { useEffect, useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  categoryLabels,
  invoiceCategories,
  type InvoiceItem,
  type Rotation,
} from '../../shared/types';
import { normalizeMoney } from '../../shared/finance';
import { releaseSourcePdf } from '../services/pdf-source-cache';
import { useInvoiceStore } from '../store/useInvoiceStore';
import { PdfThumbnail } from './PdfThumbnail';

interface SortableInvoiceRowProps {
  item: InvoiceItem;
}

function formatBytes(size: number): string {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

const statusLabels: Record<InvoiceItem['status'], string> = {
  pending: '等待分析',
  analyzing: '正在分析',
  ready: '可以生成',
  review_required: '需要复核',
  error: '无法处理',
};

export function SortableInvoiceRow({ item }: SortableInvoiceRowProps) {
  const [amountDraft, setAmountDraft] = useState(item.amount ?? '');
  const [expanded, setExpanded] = useState(false);
  const updateCategory = useInvoiceStore((state) => state.updateCategory);
  const updateAmount = useInvoiceStore((state) => state.updateAmount);
  const updateLayoutMode = useInvoiceStore((state) => state.updateLayoutMode);
  const updateTransform = useInvoiceStore((state) => state.updateTransform);
  const resetTransform = useInvoiceStore((state) => state.resetTransform);
  const confirmItem = useInvoiceStore((state) => state.confirmItem);
  const removeItem = useInvoiceStore((state) => state.removeItem);
  const setNotice = useInvoiceStore((state) => state.setNotice);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  });

  useEffect(() => setAmountDraft(item.amount ?? ''), [item.amount]);

  const commitAmount = (): boolean => {
    if (amountDraft.trim() === '') {
      updateAmount(item.id, null);
      return false;
    }
    const normalized = normalizeMoney(amountDraft);
    if (normalized === null) {
      setAmountDraft(item.amount ?? '');
      setNotice('金额格式无效，请输入不超过两位小数的非负金额');
      return false;
    }
    setAmountDraft(normalized);
    if (normalized !== item.amount) updateAmount(item.id, normalized);
    return true;
  };

  const remove = () => {
    const releasedFileId = removeItem(item.id);
    if (releasedFileId) {
      releaseSourcePdf(releasedFileId);
      void window.invoiceApp.releaseRegisteredPdf(releasedFileId);
    }
  };

  const confirm = () => {
    const amountReady = commitAmount();
    window.setTimeout(() => {
      if ((!amountReady && amountDraft.trim() !== '') || !confirmItem(item.id)) {
        setNotice('请先选择分类并填写有效金额');
      }
    }, 0);
  };

  const editable = item.status !== 'analyzing' && item.status !== 'error';
  return (
    <article
      ref={setNodeRef}
      className={`invoice-row ${isDragging ? 'is-dragging' : ''} status-${item.status}`}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      data-testid="invoice-row"
    >
      <div className="row-main">
        <button
          type="button"
          className="drag-handle"
          aria-label={`拖动 ${item.fileName}`}
          {...attributes}
          {...listeners}
        >
          ⠿
        </button>

        {item.status === 'error' ? (
          <div className="pdf-thumbnail thumbnail-error">!</div>
        ) : (
          <PdfThumbnail fileId={item.fileId} pageIndex={item.pageIndex} />
        )}

        <div className="file-cell">
          <strong title={item.fileName}>{item.fileName}</strong>
          <span>
            {formatBytes(item.sizeBytes)}
            {item.pageCount > 1 ? ` · 第 ${item.pageIndex + 1}/${item.pageCount} 页` : ''}
          </span>
          <em className={`analysis-status ${item.status}`}>{statusLabels[item.status]}</em>
        </div>

        <label className="field-cell">
          <span>分类</span>
          <select
            aria-label={`${item.fileName} 分类`}
            value={item.category}
            disabled={!editable}
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
              disabled={!editable}
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
            disabled={item.status === 'error'}
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
          className="expand-button"
          aria-expanded={expanded}
          aria-label={`${item.fileName} 排版微调`}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? '收起' : '微调'}
        </button>
        <button
          type="button"
          className="remove-button"
          aria-label={`删除 ${item.fileName}`}
          onClick={remove}
        >
          ×
        </button>
      </div>

      {(item.issues.length > 0 || item.reviewState === 'review_required') && (
        <div className="review-bar">
          <span>{item.issues[0]?.message ?? '手工修改后需要确认'}</span>
          {item.status !== 'error' && (
            <button type="button" onClick={confirm}>
              确认分类与金额
            </button>
          )}
        </div>
      )}

      {expanded && (
        <div className="layout-adjustments">
          <label>
            <span>旋转</span>
            <select
              value={item.transform.rotation}
              onChange={(event) =>
                updateTransform(item.id, { rotation: Number(event.target.value) as Rotation })
              }
            >
              <option value={0}>0°</option>
              <option value={90}>90°</option>
              <option value={180}>180°</option>
              <option value={270}>270°</option>
            </select>
          </label>
          <label>
            <span>缩放 {item.transform.scalePercent}%</span>
            <input
              type="range"
              min="50"
              max="100"
              value={item.transform.scalePercent}
              onChange={(event) =>
                updateTransform(item.id, { scalePercent: Number(event.target.value) })
              }
            />
          </label>
          <label>
            <span>水平 {item.transform.offsetXmm} mm</span>
            <input
              type="range"
              min="-30"
              max="30"
              value={item.transform.offsetXmm}
              onChange={(event) =>
                updateTransform(item.id, { offsetXmm: Number(event.target.value) })
              }
            />
          </label>
          <label>
            <span>垂直 {item.transform.offsetYmm} mm</span>
            <input
              type="range"
              min="-30"
              max="30"
              value={item.transform.offsetYmm}
              onChange={(event) =>
                updateTransform(item.id, { offsetYmm: Number(event.target.value) })
              }
            />
          </label>
          <button type="button" onClick={() => resetTransform(item.id)}>
            恢复自动适配
          </button>
        </div>
      )}
    </article>
  );
}
