import { _electron as electron, expect, test } from '@playwright/test';

test('launches the sandboxed desktop shell', async () => {
  const application = await electron.launch({ args: ['.'] });

  try {
    const page = await application.firstWindow();
    await expect(page.getByRole('heading', { name: '票据排版助手' })).toBeVisible();
    await page.screenshot({ path: 'test-results/app-shell.png', fullPage: true });
    const securitySurface = await page.evaluate(() => ({
      nodeProcess: typeof (globalThis as typeof globalThis & { process?: unknown }).process,
      apiKeys: Object.keys(
        (globalThis as typeof globalThis & { invoiceApp: Record<string, unknown> }).invoiceApp,
      ).sort(),
    }));

    expect(securitySurface.nodeProcess).toBe('undefined');
    expect(securitySurface.apiKeys).toEqual([
      'getDroppedFilePath',
      'getLayoutSettings',
      'inspectPdfPaths',
      'pickPdfFiles',
      'saveLayoutSettings',
    ]);
  } finally {
    await application.close();
  }
});
