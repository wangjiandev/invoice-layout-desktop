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
import type {
  GeneratedPdfArtifact,
  ImportPdfResult,
  RegisteredPdfDescriptor,
} from '../shared/types';
import { PdfPreviewModal } from './components/PdfPreviewModal';
import { SettingsPanel } from './components/SettingsPanel';
import { SortableInvoiceRow } from './components/SortableInvoiceRow';
import { analyzePdfDocument } from './services/pdf-engine';
import { generatePdfsInWorker } from './services/pdf-generation-client';
import { getSourcePdfBytes } from './services/pdf-source-cache';
import { getGenerationBlockers, summarizeStatuses, useInvoiceStore } from './store/useInvoiceStore';

interface PreviewState {
  generationId: string;
  revision: number;
  artifacts: GeneratedPdfArtifact[];
}

async function runWithConcurrency<T>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<void>,
): Promise<void> {
  let nextIndex = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, async () => {
      while (nextIndex < values.length) {
        const value = values[nextIndex];
        nextIndex += 1;
        await task(value);
      }
    }),
  );
}

export default function App() {
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const items = useInvoiceStore((state) => state.items);
  const notice = useInvoiceStore((state) => state.notice);
  const revision = useInvoiceStore((state) => state.revision);
  const isGenerating = useInvoiceStore((state) => state.isGenerating);
  const addDocuments = useInvoiceStore((state) => state.addDocuments);
  const applyAnalysis = useInvoiceStore((state) => state.applyAnalysis);
  const moveItem = useInvoiceStore((state) => state.moveItem);
  const hydrateSettings = useInvoiceStore((state) => state.hydrateSettings);
  const setGenerating = useInvoiceStore((state) => state.setGenerating);
  const setNotice = useInvoiceStore((state) => state.setNotice);
  const statistics = useMemo(() => calculateStatistics(items), [items]);
  const blockers = useMemo(() => getGenerationBlockers(items), [items]);
  const statusCounts = useMemo(() => summarizeStatuses(items), [items]);
  const hasFreshPreview = preview?.revision === revision;
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    void hydrateSettings();
  }, [hydrateSettings]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 4800);
    return () => window.clearTimeout(timer);
  }, [notice, setNotice]);

  const analyzeDescriptors = async (descriptors: RegisteredPdfDescriptor[]) => {
    await runWithConcurrency(descriptors, 3, async (descriptor) => {
      try {
        const bytes = await getSourcePdfBytes(descriptor.fileId);
        applyAnalysis(await analyzePdfDocument(descriptor, bytes));
      } catch {
        applyAnalysis({
          fileId: descriptor.fileId,
          pageCount: 1,
          pages: [
            {
              pageIndex: 0,
              pageCount: 1,
              widthPt: 0,
              heightPt: 0,
              category: descriptor.categoryHint ?? 'unclassified',
              amount: null,
              layoutMode: descriptor.categoryHint === 'rail' ? 'rail_8up' : 'standard_2up',
              status: 'error',
              reviewState: 'review_required',
              confidence: 0,
              issues: [{ code: 'ANALYSIS_FAILED', message: '读取或分析 PDF 失败' }],
              categorySource: descriptor.categoryHint ? 'path_hint' : 'missing',
              amountSource: 'missing',
            },
          ],
        });
      }
    });
  };

  const acceptImport = (result: ImportPdfResult, extraRejected = 0) => {
    const rejectedCount = result.rejectedCount + extraRejected;
    addDocuments(result.documents, result.duplicateCount, rejectedCount);
    if (result.documents.length > 0) void analyzeDescriptors(result.documents);
  };

  const importFromPicker = async () => {
    try {
      acceptImport(await window.invoiceApp.pickPdfFiles());
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
      acceptImport(
        await window.invoiceApp.importDroppedPdfFiles(pdfFiles),
        files.length - pdfFiles.length,
      );
    } catch {
      setNotice('无法读取拖入的文件，请改用“选择 PDF”');
    }
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    if (over && active.id !== over.id) moveItem(String(active.id), String(over.id));
  };

  const generatePreview = async () => {
    if (hasFreshPreview && preview) {
      setPreviewOpen(true);
      return;
    }
    const currentBlockers = getGenerationBlockers(useInvoiceStore.getState().items);
    if (currentBlockers.length > 0) {
      setNotice(currentBlockers[0]);
      return;
    }

    setGenerating(true);
    const snapshot = useInvoiceStore.getState();
    try {
      if (preview) await window.invoiceApp.discardGeneration(preview.generationId);
      const fileIds = [...new Set(snapshot.items.map((item) => item.fileId))];
      const sources = await Promise.all(
        fileIds.map(async (fileId) => ({ fileId, bytes: await getSourcePdfBytes(fileId) })),
      );
      const generated = await generatePdfsInWorker({
        items: snapshot.items,
        settings: snapshot.settings,
        sources,
        generatedAt: new Date().toISOString(),
      });
      const prepared = await window.invoiceApp.prepareGeneratedPdfs(generated);
      if (useInvoiceStore.getState().revision !== snapshot.revision) {
        await window.invoiceApp.discardGeneration(prepared.generationId);
        setNotice('生成期间排版发生变化，请重新生成');
        setPreview(null);
        return;
      }
      const artifacts: GeneratedPdfArtifact[] = generated.map((artifact) => ({
        ...artifact,
        fileName:
          prepared.artifacts.find((candidate) => candidate.kind === artifact.kind)?.fileName ??
          `${artifact.kind}.pdf`,
      }));
      setPreview({ generationId: prepared.generationId, revision: snapshot.revision, artifacts });
      setPreviewOpen(true);
      setNotice(`已生成 ${artifacts.length} 个 A4 PDF`);
    } catch (error) {
      setNotice(error instanceof Error ? `生成失败：${error.message}` : 'PDF 生成失败');
    } finally {
      setGenerating(false);
    }
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
            <p>自动识别金额和分类，多页 PDF 会按页拆分</p>
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
          <p>拖动排序 · 自动结果不确定时需要人工确认</p>
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
            <strong>隐私优先</strong> 文件、路径和识别文本不会上传或持久化。
          </p>
        </footer>
      </section>

      <SettingsPanel
        statistics={statistics}
        blockers={blockers}
        statusCounts={statusCounts}
        isGenerating={isGenerating}
        hasFreshPreview={Boolean(hasFreshPreview)}
        onGenerate={() => void generatePreview()}
      />

      {previewOpen && preview && (
        <PdfPreviewModal
          artifacts={preview.artifacts}
          generationId={preview.generationId}
          onClose={() => setPreviewOpen(false)}
          onNotice={(message) => setNotice(message)}
        />
      )}

      {notice && (
        <div className="toast" role="status">
          {notice}
        </div>
      )}
    </main>
  );
}
