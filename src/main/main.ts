import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import Store from 'electron-store';
import path from 'node:path';
import { inspectPdfPaths } from './file-service';
import { layoutSettingsSchema, pdfPathsSchema } from '../shared/schemas';
import {
  defaultLayoutSettings,
  type LayoutSettings,
  type LocalPdfDescriptor,
} from '../shared/types';

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

interface SettingsStore {
  layout: LayoutSettings;
}

const settingsStore = new Store<SettingsStore>({
  name: 'preferences',
  defaults: { layout: defaultLayoutSettings },
});

function registerIpcHandlers(): void {
  ipcMain.handle('dialog:pick-pdfs', async (): Promise<LocalPdfDescriptor[]> => {
    const result = await dialog.showOpenDialog({
      title: '选择 PDF 票据',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
    });

    if (result.canceled || result.filePaths.length === 0) return [];
    return inspectPdfPaths(result.filePaths);
  });

  ipcMain.handle('files:inspect-pdf-paths', async (_event, paths: unknown) => {
    const validatedPaths = pdfPathsSchema.parse(paths);
    return inspectPdfPaths(validatedPaths);
  });

  ipcMain.handle('settings:get-layout', () => {
    return layoutSettingsSchema.parse(settingsStore.get('layout'));
  });

  ipcMain.handle('settings:save-layout', (_event, settings: unknown) => {
    const validatedSettings = layoutSettingsSchema.parse(settings);
    settingsStore.set('layout', validatedSettings);
    return validatedSettings;
  });
}

function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1180,
    minHeight: 720,
    title: '票据排版助手',
    backgroundColor: '#f3f4ef',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });

  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  mainWindow.once('ready-to-show', () => mainWindow.show());

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  return mainWindow;
}

void app.whenReady().then(() => {
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
