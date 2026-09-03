import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { calculateStatistics } from '../shared/finance';
import { SettingsPanel } from './components/SettingsPanel';
import { SortableInvoiceRow } from './components/SortableInvoiceRow';
import { useInvoiceStore } from './store/useInvoiceStore';

export default function App() {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const items = useInvoiceStore((state) => state.items);
  const notice = useInvoiceStore((state) => state.notice);
  const addDescriptors = useInvoiceStore((state) => state.addDescriptors);
  const moveItem = useInvoiceStore((state) => state.moveItem);
  const hydrateSettings = useInvoiceStore((state) => state.hydrateSettings);
  const setNotice = useInvoiceStore((state) => state.setNotice);
  const statistics = useMemo(() => calculateStatistics(items), [items]);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    void hydrateSettings();
  }, [hydrateSettings]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timer);
  }, [notice, setNotice]);

  const importFromPicker = async () => {
    try {
      addDescriptors(await window.invoiceApp.pickPdfFiles());
    } catch {
      setNotice('无法打开文件选择器，请稍后重试');
    }
  };

  const importDroppedFiles = async (files: File[]) => {
    const pdfFiles = files.filter((file) => file.name.toLowerCase().endsWith('.pdf'));
    if (pdfFiles.length === 0) {
      setNotice('未发现 PDF 文件，仅支持导入 PDF');
      return;
    }

    try {
      const paths = pdfFiles
        .map((file) => window.invoiceApp.getDroppedFilePath(file))
        .filter(Boolean);
      if (paths.length === 0) throw new Error('No local paths');
      addDescriptors(await window.invoiceApp.inspectPdfPaths(paths));
      if (pdfFiles.length < files.length) setNotice('已忽略非 PDF 文件');
    } catch {
      setNotice('无法读取拖入的文件，请改用“选择 PDF”');
    }
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) moveItem(String(active.id), String(over.id));
  };

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="app-header">
          <div className="brand-mark">票</div>
          <div>
            <p>INVOICE STUDIO</p>
            <h1>票据排版助手</h1>
          </div>
          <span className="offline-badge">
            <i /> 本地离线
          </span>
        </header>

        <section
          className={`drop-zone ${isDraggingFiles ? 'drag-active' : ''}`}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDraggingFiles(true);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDragLeave={(event) => {
            if (event.currentTarget === event.target) setIsDraggingFiles(false);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setIsDraggingFiles(false);
            void importDroppedFiles(Array.from(event.dataTransfer.files));
          }}
        >
          <div className="drop-icon">↓</div>
          <div>
            <h2>将 PDF 票据拖到这里</h2>
            <p>支持一次导入多个文件，所有处理都在你的电脑上完成</p>
          </div>
          <button type="button" onClick={() => void importFromPicker()}>
            选择 PDF
          </button>
        </section>

        <div className="list-toolbar">
          <div>
            <span className="eyebrow">DOCUMENTS</span>
            <h2>
              票据列表 <small>{items.length}</small>
            </h2>
          </div>
          <p>拖动左侧手柄调整打印顺序</p>
        </div>

        <section className="invoice-list" aria-label="票据列表">
          {items.length === 0 ? (
            <div className="empty-state">
              <div className="empty-illustration">
                <span>PDF</span>
              </div>
              <h3>还没有票据</h3>
              <p>拖入 PDF 或点击上方按钮开始整理。</p>
            </div>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {items.map((item) => (
                  <SortableInvoiceRow item={item} key={item.id} />
                ))}
              </SortableContext>
            </DndContext>
          )}
        </section>

        <footer className="privacy-footer">
          <span>🔒</span>
          <p>
            <strong>隐私优先</strong> 文件不会上传；关闭应用后，票据路径和金额不会被保存。
          </p>
        </footer>
      </section>

      <SettingsPanel statistics={statistics} />

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </main>
  );
}
