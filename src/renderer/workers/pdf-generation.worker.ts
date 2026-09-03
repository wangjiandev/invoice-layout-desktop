/// <reference lib="webworker" />

import { generatePdfArtifacts, type PdfGenerationRequest } from '../../shared/pdf-generation';
import type { GeneratedPdfInput } from '../../shared/types';

interface WorkerSuccess {
  ok: true;
  artifacts: GeneratedPdfInput[];
}

interface WorkerFailure {
  ok: false;
  error: string;
}

self.onmessage = async (event: MessageEvent<PdfGenerationRequest>) => {
  try {
    const artifacts = await generatePdfArtifacts(event.data);
    const response: WorkerSuccess = { ok: true, artifacts };
    self.postMessage(
      response,
      artifacts.map((artifact) => artifact.bytes.buffer as ArrayBuffer),
    );
  } catch (error) {
    const response: WorkerFailure = {
      ok: false,
      error: error instanceof Error ? error.message : 'PDF 生成失败',
    };
    self.postMessage(response);
  }
};

export {};
