import { describe, expect, it } from 'vitest';
import { isPdfPath } from './file-service';

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
