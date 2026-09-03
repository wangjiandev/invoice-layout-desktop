import { useEffect, useMemo, useRef, useState } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { openPdf } from '../services/pdf-engine';
import type { ArtifactKind, GeneratedPdfArtifact } from '../../shared/types';

interface PdfPreviewModalProps {
  artifacts: GeneratedPdfArtifact[];
  generationId: string;
  onClose: () => void;
  onNotice: (message: string) => void;
}

const artifactLabels: Record<ArtifactKind, string> = {
  bundle: '总打印包',
  standard: '普通票据',
  rail: '铁路票据',
};

function PageCanvas({
  document,
  pageNumber,
  width,
  className,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  width: number;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let canceled = false;
    let task: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void document.getPage(pageNumber).then(async (page) => {
      if (canceled || !canvasRef.current) return;
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: width / base.width });
      const canvas = canvasRef.current;
      const pixelRatio = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * pixelRatio);
      canvas.height = Math.floor(viewport.height * pixelRatio);
      canvas.style.width = `${viewport.width}px`;
      canvas.style.height = `${viewport.height}px`;
      const context = canvas.getContext('2d');
      if (!context) return;
      task = page.render({
        canvas,
        canvasContext: context,
        viewport,
        transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
      });
      await task.promise;
    });
    return () => {
      canceled = true;
      task?.cancel();
    };
  }, [document, pageNumber, width]);

  return <canvas className={className} ref={canvasRef} />;
}

export function PdfPreviewModal({
  artifacts,
  generationId,
  onClose,
  onNotice,
}: PdfPreviewModalProps) {
  const [activeKind, setActiveKind] = useState<ArtifactKind>('bundle');
  const [document, setDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [zoom, setZoom] = useState(90);
  const [busyAction, setBusyAction] = useState<'save' | 'print' | null>(null);
  const [printFailure, setPrintFailure] = useState(false);
  const artifact = useMemo(
    () => artifacts.find((candidate) => candidate.kind === activeKind) ?? artifacts[0],
    [activeKind, artifacts],
  );

  useEffect(() => {
    if (!artifacts.some((candidate) => candidate.kind === activeKind)) {
      setActiveKind(artifacts[0].kind);
    }
  }, [activeKind, artifacts]);

  useEffect(() => {
    let canceled = false;
    let loaded: PDFDocumentProxy | null = null;
    setDocument(null);
    setPageNumber(1);
    setPrintFailure(false);
    void openPdf(artifact.bytes).then((pdf) => {
      loaded = pdf;
      if (!canceled) setDocument(pdf);
    });
    return () => {
      canceled = true;
      if (loaded) void loaded.loadingTask.destroy();
    };
  }, [artifact]);

  const save = async () => {
    setBusyAction('save');
    try {
      const result = await window.invoiceApp.saveGeneratedPdfs(generationId);
      if (!result.canceled)
        onNotice(`已保存 ${result.fileNames.length} 个 PDF 到 ${result.outputDirectory}`);
    } catch {
      onNotice('保存失败，请检查目录权限后重试');
    } finally {
      setBusyAction(null);
    }
  };

  const print = async () => {
    setBusyAction('print');
    setPrintFailure(false);
    try {
      const result = await window.invoiceApp.printGeneratedPdf(generationId, artifact.kind);
      if (!result.success && !result.canceled) {
        setPrintFailure(true);
        onNotice(result.reason ? `打印失败：${result.reason}` : '打印失败');
      }
    } catch {
      setPrintFailure(true);
      onNotice('无法打开系统打印对话框');
    } finally {
      setBusyAction(null);
    }
  };

  return (
    <div className="preview-backdrop" role="dialog" aria-modal="true" aria-label="A4 PDF 预览">
      <div className="preview-window">
        <header className="preview-header">
          <div>
            <span className="eyebrow">PRINT PREVIEW</span>
            <h2>A4 PDF 预览</h2>
          </div>
          <nav className="preview-tabs" aria-label="生成文件">
            {artifacts.map((candidate) => (
              <button
                type="button"
                className={candidate.kind === artifact.kind ? 'active' : ''}
                key={candidate.kind}
                onClick={() => setActiveKind(candidate.kind)}
              >
                {artifactLabels[candidate.kind]} · {candidate.pageCount} 页
              </button>
            ))}
          </nav>
          <div className="preview-actions">
            <button type="button" onClick={() => void save()} disabled={busyAction !== null}>
              {busyAction === 'save' ? '保存中…' : '保存全部'}
            </button>
            <button
              type="button"
              className="primary-action"
              onClick={() => void print()}
              disabled={busyAction !== null}
            >
              {busyAction === 'print' ? '启动打印…' : '打印当前文档'}
            </button>
            <button type="button" className="close-preview" aria-label="关闭预览" onClick={onClose}>
              ×
            </button>
          </div>
        </header>

        {printFailure && (
          <div className="print-fallback">
            系统打印未能启动。
            <button
              type="button"
              onClick={() => void window.invoiceApp.openGeneratedPdf(generationId, artifact.kind)}
            >
              使用 macOS 预览打开
            </button>
          </div>
        )}

        <div className="preview-body">
          <aside className="preview-thumbnails">
            {document ? (
              Array.from({ length: document.numPages }, (_, index) => (
                <button
                  type="button"
                  className={pageNumber === index + 1 ? 'active' : ''}
                  key={index}
                  onClick={() => setPageNumber(index + 1)}
                >
                  <PageCanvas document={document} pageNumber={index + 1} width={108} />
                  <span>{index + 1}</span>
                </button>
              ))
            ) : (
              <p>正在加载预览…</p>
            )}
          </aside>
          <main className="preview-stage">
            <div className="zoom-control">
              <span>{artifact.fileName}</span>
              <label>
                缩放 {zoom}%
                <input
                  type="range"
                  min="50"
                  max="140"
                  value={zoom}
                  onChange={(event) => setZoom(Number(event.target.value))}
                />
              </label>
            </div>
            {document ? (
              <PageCanvas
                className="preview-page"
                document={document}
                pageNumber={pageNumber}
                width={(595 * zoom) / 100}
              />
            ) : (
              <div className="preview-loading">正在渲染 A4 页面…</div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
