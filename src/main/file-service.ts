import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { LocalPdfDescriptor } from '../shared/types';

export function isPdfPath(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

export async function inspectPdfPaths(paths: string[]): Promise<LocalPdfDescriptor[]> {
  const inspected = await Promise.all(
    paths.map(async (candidate): Promise<LocalPdfDescriptor | null> => {
      if (!path.isAbsolute(candidate) || !isPdfPath(candidate)) return null;

      try {
        const resolvedPath = await fs.realpath(candidate);
        const stat = await fs.stat(resolvedPath);
        if (!stat.isFile()) return null;

        return {
          path: resolvedPath,
          fileName: path.basename(resolvedPath),
          sizeBytes: stat.size,
        };
      } catch {
        return null;
      }
    }),
  );

  return inspected.filter((item): item is LocalPdfDescriptor => item !== null);
}
