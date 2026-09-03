import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type {
  ArtifactKind,
  DesktopApi,
  GeneratedPdfInput,
  GenerationSession,
  ImportPdfResult,
  LayoutSettings,
  PrintGeneratedResult,
  SaveGeneratedResult,
} from '../shared/types';

const desktopApi: DesktopApi = {
  pickPdfFiles: () => ipcRenderer.invoke('dialog:pick-pdfs') as Promise<ImportPdfResult>,
  importDroppedPdfFiles: (files) => {
    const paths = files.map((file) => webUtils.getPathForFile(file)).filter(Boolean);
    if (paths.length === 0) {
      return Promise.resolve({ documents: [], duplicateCount: 0, rejectedCount: files.length });
    }
    return ipcRenderer.invoke('files:register-dropped-pdfs', paths) as Promise<ImportPdfResult>;
  },
  readRegisteredPdf: (fileId) =>
    ipcRenderer.invoke('files:read-registered-pdf', fileId) as Promise<Uint8Array>,
  releaseRegisteredPdf: (fileId) =>
    ipcRenderer.invoke('files:release-registered-pdf', fileId) as Promise<void>,
  getLayoutSettings: () => ipcRenderer.invoke('settings:get-layout') as Promise<LayoutSettings>,
  saveLayoutSettings: (settings) =>
    ipcRenderer.invoke('settings:save-layout', settings) as Promise<LayoutSettings>,
  prepareGeneratedPdfs: (artifacts: GeneratedPdfInput[]) =>
    ipcRenderer.invoke('artifacts:prepare', artifacts) as Promise<GenerationSession>,
  saveGeneratedPdfs: (generationId) =>
    ipcRenderer.invoke('artifacts:save', generationId) as Promise<SaveGeneratedResult>,
  printGeneratedPdf: (generationId, kind: ArtifactKind) =>
    ipcRenderer.invoke('artifacts:print', generationId, kind) as Promise<PrintGeneratedResult>,
  openGeneratedPdf: (generationId, kind) =>
    ipcRenderer.invoke('artifacts:open', generationId, kind) as Promise<boolean>,
  discardGeneration: (generationId) =>
    ipcRenderer.invoke('artifacts:discard', generationId) as Promise<void>,
};

contextBridge.exposeInMainWorld('invoiceApp', desktopApi);
