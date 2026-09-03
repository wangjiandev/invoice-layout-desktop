import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GeneratedArtifactRegistry } from './artifact-service';

describe('GeneratedArtifactRegistry', () => {
  it('stores generated PDFs behind an opaque generation id and saves all artifacts', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'invoice-artifacts-test-'));
    const output = await mkdtemp(path.join(os.tmpdir(), 'invoice-output-test-'));
    const registry = new GeneratedArtifactRegistry(root);
    const bytes = new Uint8Array(Buffer.from('%PDF-1.4\nsynthetic\n%%EOF'));
    try {
      await registry.initialize();
      const session = await registry.prepare([
        { kind: 'bundle', bytes, pageCount: 1 },
        { kind: 'standard', bytes, pageCount: 1 },
      ]);
      expect(session.generationId).toMatch(/^[0-9a-f-]{36}$/);
      expect(session.artifacts).toHaveLength(2);
      expect(session.artifacts[0]).not.toHaveProperty('path');

      const saved = await registry.saveAll(session.generationId, output);
      expect(saved.fileNames).toHaveLength(2);
      expect(await readFile(path.join(output, saved.fileNames[0]))).toEqual(Buffer.from(bytes));
      await registry.discard(session.generationId);
      expect(() => registry.getArtifact(session.generationId, 'bundle')).toThrow();
    } finally {
      await registry.clear();
      await rm(root, { recursive: true, force: true });
      await rm(output, { recursive: true, force: true });
    }
  });
});
