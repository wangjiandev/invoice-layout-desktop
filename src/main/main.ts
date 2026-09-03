import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron';
import Store from 'electron-store';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { GeneratedArtifactRegistry } from './artifact-service';
import { PdfFileRegistry } from './file-service';
import {
  artifactKindSchema,
  fileIdSchema,
  generatedPdfInputsSchema,
  generationIdSchema,
  layoutSettingsSchema,
  pdfPathsSchema,
} from '../shared/schemas';
import {
  defaultLayoutSettings,
  type LayoutSettings,
  type PrintGeneratedResult,
  type SaveGeneratedResult,
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
const fileRegistry = new PdfFileRegistry();
let artifactRegistry: GeneratedArtifactRegistry;
let mainWindow: BrowserWindow | null = null;

function assertTrustedSender(event: IpcMainInvokeEvent): void {
  if (!mainWindow || event.sender.id !== mainWindow.webContents.id) {
    throw new Error('拒绝来自未知窗口的请求');
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('dialog:pick-pdfs', async (event) => {
    assertTrustedSender(event);
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: '选择 PDF 票据',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF 文件', extensions: ['pdf'] }],
    });
    if (result.canceled || result.filePaths.length === 0) {
      return { documents: [], duplicateCount: 0, rejectedCount: 0 };
    }
    return fileRegistry.registerPaths(result.filePaths);
  });

  ipcMain.handle('files:register-dropped-pdfs', async (event, paths: unknown) => {
    assertTrustedSender(event);
    return fileRegistry.registerPaths(pdfPathsSchema.parse(paths));
  });

  ipcMain.handle('files:read-registered-pdf', async (event, fileId: unknown) => {
    assertTrustedSender(event);
    return fileRegistry.read(fileIdSchema.parse(fileId));
  });

  ipcMain.handle('files:release-registered-pdf', (event, fileId: unknown) => {
    assertTrustedSender(event);
    fileRegistry.release(fileIdSchema.parse(fileId));
  });

  ipcMain.handle('settings:get-layout', (event) => {
    assertTrustedSender(event);
    return layoutSettingsSchema.parse(settingsStore.get('layout'));
  });

  ipcMain.handle('settings:save-layout', (event, settings: unknown) => {
    assertTrustedSender(event);
    const validatedSettings = layoutSettingsSchema.parse(settings);
    settingsStore.set('layout', validatedSettings);
    return validatedSettings;
  });

  ipcMain.handle('artifacts:prepare', async (event, inputs: unknown) => {
    assertTrustedSender(event);
    return artifactRegistry.prepare(generatedPdfInputsSchema.parse(inputs));
  });

  ipcMain.handle(
    'artifacts:save',
    async (event, generationIdValue: unknown): Promise<SaveGeneratedResult> => {
      assertTrustedSender(event);
      const generationId = generationIdSchema.parse(generationIdValue);
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: '选择 PDF 保存目录',
        properties: ['openDirectory', 'createDirectory'],
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true, fileNames: [] };
      }

      const outputDirectory = result.filePaths[0];
      if (await artifactRegistry.hasOutputCollision(generationId, outputDirectory)) {
        const confirmation = await dialog.showMessageBox(mainWindow!, {
          type: 'warning',
          title: '文件已存在',
          message: '保存目录中已有同名 PDF，是否覆盖？',
          detail: '选择覆盖后，本次生成的同名文件将替换现有文件。',
          buttons: ['取消', '覆盖'],
          defaultId: 0,
          cancelId: 0,
        });
        if (confirmation.response !== 1) return { canceled: true, fileNames: [] };
      }
      return artifactRegistry.saveAll(generationId, outputDirectory);
    },
  );

  ipcMain.handle(
    'artifacts:print',
    async (
      event,
      generationIdValue: unknown,
      kindValue: unknown,
    ): Promise<PrintGeneratedResult> => {
      assertTrustedSender(event);
      const generationId = generationIdSchema.parse(generationIdValue);
      const kind = artifactKindSchema.parse(kindValue);
      const artifact = artifactRegistry.getArtifact(generationId, kind);
      const printWindow = new BrowserWindow({
        show: false,
        webPreferences: {
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          webSecurity: true,
          plugins: true,
        },
      });

      try {
        await printWindow.loadURL(pathToFileURL(artifact.path).toString());
        return await new Promise<PrintGeneratedResult>((resolve) => {
          printWindow.webContents.print(
            {
              silent: false,
              printBackground: true,
              landscape: false,
              pageSize: 'A4',
              margins: { marginType: 'none' },
            },
            (success, failureReason) => {
              const canceled = !success && /cancel/i.test(failureReason);
              resolve({
                success,
                canceled,
                reason: success || canceled ? undefined : failureReason,
              });
            },
          );
        });
      } catch (error) {
        return {
          success: false,
          canceled: false,
          reason: error instanceof Error ? error.message : '无法启动打印',
        };
      } finally {
        if (!printWindow.isDestroyed()) printWindow.destroy();
      }
    },
  );

  ipcMain.handle(
    'artifacts:open',
    async (event, generationIdValue: unknown, kindValue: unknown) => {
      assertTrustedSender(event);
      const artifact = artifactRegistry.getArtifact(
        generationIdSchema.parse(generationIdValue),
        artifactKindSchema.parse(kindValue),
      );
      return (await shell.openPath(artifact.path)) === '';
    },
  );

  ipcMain.handle('artifacts:discard', async (event, generationIdValue: unknown) => {
    assertTrustedSender(event);
    await artifactRegistry.discard(generationIdSchema.parse(generationIdValue));
  });
}

function createWindow(): BrowserWindow {
  const window = new BrowserWindow({
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

  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.once('ready-to-show', () => window.show());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void window.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
  return window;
}

void app.whenReady().then(async () => {
  artifactRegistry = new GeneratedArtifactRegistry(
    path.join(app.getPath('temp'), 'invoice-layout-desktop', randomSessionDirectory()),
  );
  await artifactRegistry.initialize();
  mainWindow = createWindow();
  registerIpcHandlers();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) mainWindow = createWindow();
  });
});

function randomSessionDirectory(): string {
  return `session-${Date.now()}-${process.pid}`;
}

app.on('before-quit', () => {
  fileRegistry.clear();
  if (artifactRegistry) artifactRegistry.clearSync();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
