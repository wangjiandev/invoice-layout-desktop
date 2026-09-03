import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { DesktopApi, LayoutSettings, LocalPdfDescriptor } from '../shared/types';

const desktopApi: DesktopApi = {
  pickPdfFiles: () => ipcRenderer.invoke('dialog:pick-pdfs') as Promise<LocalPdfDescriptor[]>,
  getDroppedFilePath: (file) => webUtils.getPathForFile(file),
  inspectPdfPaths: (paths) =>
    ipcRenderer.invoke('files:inspect-pdf-paths', paths) as Promise<LocalPdfDescriptor[]>,
  getLayoutSettings: () => ipcRenderer.invoke('settings:get-layout') as Promise<LayoutSettings>,
  saveLayoutSettings: (settings) =>
    ipcRenderer.invoke('settings:save-layout', settings) as Promise<LayoutSettings>,
};

contextBridge.exposeInMainWorld('invoiceApp', desktopApi);
