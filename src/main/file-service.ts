import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, promises as fs } from 'node:fs';
import path from 'node:path';
import type { ImportPdfResult, InvoiceCategory, RegisteredPdfDescriptor } from '../shared/types';

interface RegisteredPdf extends RegisteredPdfDescriptor {
  path: string;
}

export function isPdfPath(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === '.pdf';
}

function inferCategoryHint(filePath: string): InvoiceCategory | null {
  const normalized = filePath.normalize('NFKC').toLowerCase();
  if (normalized.includes('火车票') || normalized.includes('铁路')) return 'rail';
  if (normalized.includes('机票') || normalized.includes('行程单')) return 'flight';
  if (normalized.includes('住宿') || normalized.includes('酒店')) return 'lodging';
  if (normalized.includes('打车') || normalized.includes('滴滴')) return 'taxi';
  if (normalized.includes('ai 订阅') || normalized.includes('ai订阅')) return 'ai_subscription';
  return null;
}

async function hashFile(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('error', reject);
    stream.on('end', resolve);
  });
  return hash.digest('hex');
}

async function hasPdfHeader(filePath: string): Promise<boolean> {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(5);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    return bytesRead === 5 && header.toString('ascii') === '%PDF-';
  } finally {
    await handle.close();
  }
}

export class PdfFileRegistry {
  private readonly files = new Map<string, RegisteredPdf>();
  private readonly idsByHash = new Map<string, string>();

  async registerPaths(paths: string[]): Promise<ImportPdfResult> {
    const documents: RegisteredPdfDescriptor[] = [];
    let duplicateCount = 0;
    let rejectedCount = 0;

    for (const candidate of paths) {
      if (!path.isAbsolute(candidate) || !isPdfPath(candidate)) {
        rejectedCount += 1;
        continue;
      }

      try {
        const resolvedPath = await fs.realpath(candidate);
        const stat = await fs.stat(resolvedPath);
        if (!stat.isFile() || !(await hasPdfHeader(resolvedPath))) {
          rejectedCount += 1;
          continue;
        }

        const contentHash = await hashFile(resolvedPath);
        if (this.idsByHash.has(contentHash)) {
          duplicateCount += 1;
          continue;
        }

        const fileId = randomUUID();
        const registered: RegisteredPdf = {
          fileId,
          contentHash,
          fileName: path.basename(resolvedPath),
          sizeBytes: stat.size,
          categoryHint: inferCategoryHint(resolvedPath),
          path: resolvedPath,
        };
        this.files.set(fileId, registered);
        this.idsByHash.set(contentHash, fileId);
        documents.push({
          fileId: registered.fileId,
          contentHash: registered.contentHash,
          fileName: registered.fileName,
          sizeBytes: registered.sizeBytes,
          categoryHint: registered.categoryHint,
        });
      } catch {
        rejectedCount += 1;
      }
    }

    return { documents, duplicateCount, rejectedCount };
  }

  async read(fileId: string): Promise<Uint8Array> {
    const registered = this.files.get(fileId);
    if (!registered) throw new Error('PDF 文件未在本次会话中注册');
    return new Uint8Array(await fs.readFile(registered.path));
  }

  release(fileId: string): void {
    const registered = this.files.get(fileId);
    if (!registered) return;
    this.files.delete(fileId);
    this.idsByHash.delete(registered.contentHash);
  }

  clear(): void {
    this.files.clear();
    this.idsByHash.clear();
  }
}

export async function inspectPdfPaths(paths: string[]): Promise<RegisteredPdfDescriptor[]> {
  const registry = new PdfFileRegistry();
  return (await registry.registerPaths(paths)).documents;
}
