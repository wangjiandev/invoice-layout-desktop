import fontUrl from '../../assets/NotoSansSC-Regular.ttf?url';
import type { PdfGenerationRequest } from '../../shared/pdf-generation';
import type { GeneratedPdfInput } from '../../shared/types';

interface WorkerSuccess {
  ok: true;
  artifacts: GeneratedPdfInput[];
}

interface WorkerFailure {
  ok: false;
  error: string;
}

let fontBytesPromise: Promise<Uint8Array> | null = null;

async function getFontBytes(): Promise<Uint8Array> {
  fontBytesPromise ??= fetch(fontUrl).then(async (response) => {
    if (!response.ok) throw new Error('无法加载中文字体资源');
    return new Uint8Array(await response.arrayBuffer());
  });
  return fontBytesPromise;
}

export async function generatePdfsInWorker(
  request: Omit<PdfGenerationRequest, 'fontBytes'>,
): Promise<GeneratedPdfInput[]> {
  const worker = new Worker(new URL('../workers/pdf-generation.worker.ts', import.meta.url), {
    type: 'module',
  });
  const sources = request.sources.map((source) => ({ ...source, bytes: source.bytes.slice() }));
  const fontBytes = (await getFontBytes()).slice();

  return new Promise<GeneratedPdfInput[]>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<WorkerSuccess | WorkerFailure>) => {
      worker.terminate();
      if (event.data.ok) resolve(event.data.artifacts);
      else reject(new Error(event.data.error));
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'PDF 生成线程异常退出'));
    };
    worker.postMessage({ ...request, sources, fontBytes } satisfies PdfGenerationRequest, [
      ...sources.map((source) => source.bytes.buffer),
      fontBytes.buffer,
    ] as Transferable[]);
  });
}
