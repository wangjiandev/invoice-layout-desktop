import { useEffect, useRef, useState } from 'react';
import { getSourcePdfDocument } from '../services/pdf-source-cache';

interface PdfThumbnailProps {
  fileId: string;
  pageIndex: number;
}

export function PdfThumbnail({ fileId, pageIndex }: PdfThumbnailProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let canceled = false;
    let renderTask: { cancel: () => void; promise: Promise<unknown> } | null = null;
    void getSourcePdfDocument(fileId)
      .then(async (document) => {
        const page = await document.getPage(pageIndex + 1);
        if (canceled || !canvasRef.current) return;
        const base = page.getViewport({ scale: 1 });
        const scale = 92 / base.width;
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;
        const ratio = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const context = canvas.getContext('2d');
        if (!context) return;
        const currentTask = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
        }) as unknown as { cancel: () => void; promise: Promise<unknown> };
        renderTask = currentTask;
        await currentTask.promise;
      })
      .catch(() => {
        if (!canceled) setFailed(true);
      });
    return () => {
      canceled = true;
      renderTask?.cancel();
    };
  }, [fileId, pageIndex]);

  return (
    <div className="pdf-thumbnail" aria-label="PDF 缩略图">
      {failed ? <span>PDF</span> : <canvas ref={canvasRef} />}
    </div>
  );
}
