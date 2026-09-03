import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { isPdfPath, PdfFileRegistry } from './file-service';

describe('isPdfPath', () => {
  it('accepts PDF extensions case-insensitively', () => {
    expect(isPdfPath('/tmp/invoice.pdf')).toBe(true);
    expect(isPdfPath('/tmp/invoice.PDF')).toBe(true);
  });

  it('rejects other document types', () => {
    expect(isPdfPath('/tmp/invoice.ofd')).toBe(false);
    expect(isPdfPath('/tmp/invoice.pdf.exe')).toBe(false);
  });
});

describe('PdfFileRegistry', () => {
  it('deduplicates identical content and never returns the source path', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'invoice-registry-test-'));
    try {
      const first = path.join(directory, 'first.pdf');
      const second = path.join(directory, 'second.PDF');
      const bytes = new Uint8Array(Buffer.from('%PDF-1.4\nsynthetic\n%%EOF'));
      await writeFile(first, bytes);
      await writeFile(second, bytes);
      const registry = new PdfFileRegistry();
      const result = await registry.registerPaths([first, second]);
      expect(result.documents).toHaveLength(1);
      expect(result.duplicateCount).toBe(1);
      expect(result.documents[0]).not.toHaveProperty('path');
      expect(await registry.read(result.documents[0].fileId)).toEqual(bytes);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
