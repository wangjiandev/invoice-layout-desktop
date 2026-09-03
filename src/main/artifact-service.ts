import { randomUUID } from 'node:crypto';
import { promises as fs, rmSync } from 'node:fs';
import path from 'node:path';
import type {
  ArtifactKind,
  GeneratedPdfInput,
  GenerationSession,
  SaveGeneratedResult,
} from '../shared/types';

interface InternalArtifact {
  kind: ArtifactKind;
  fileName: string;
  path: string;
  pageCount: number;
  sizeBytes: number;
}

interface InternalGeneration {
  generationId: string;
  directory: string;
  artifacts: InternalArtifact[];
}

const FILE_PREFIXES: Record<ArtifactKind, string> = {
  bundle: '报销打印包',
  standard: '普通票据',
  rail: '铁路票据',
};

function timestamp(date: Date): string {
  const parts = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
    String(date.getHours()).padStart(2, '0'),
    String(date.getMinutes()).padStart(2, '0'),
  ];
  return `${parts[0]}${parts[1]}${parts[2]}_${parts[3]}${parts[4]}`;
}

function assertPdf(bytes: Uint8Array): void {
  if (bytes.byteLength < 5 || new TextDecoder('ascii').decode(bytes.slice(0, 5)) !== '%PDF-') {
    throw new Error('生成内容不是有效的 PDF');
  }
}

export class GeneratedArtifactRegistry {
  private readonly generations = new Map<string, InternalGeneration>();

  constructor(private readonly rootDirectory: string) {}

  async initialize(): Promise<void> {
    await fs.mkdir(this.rootDirectory, { recursive: true });
  }

  async prepare(inputs: GeneratedPdfInput[]): Promise<GenerationSession> {
    const generationId = randomUUID();
    const directory = path.join(this.rootDirectory, generationId);
    const createdAt = timestamp(new Date());
    await fs.mkdir(directory, { recursive: true });

    try {
      const artifacts: InternalArtifact[] = [];
      for (const input of inputs) {
        assertPdf(input.bytes);
        const fileName = `${FILE_PREFIXES[input.kind]}_${createdAt}.pdf`;
        const artifactPath = path.join(directory, fileName);
        await fs.writeFile(artifactPath, input.bytes);
        artifacts.push({
          kind: input.kind,
          fileName,
          path: artifactPath,
          pageCount: input.pageCount,
          sizeBytes: input.bytes.byteLength,
        });
      }

      const generation = { generationId, directory, artifacts };
      this.generations.set(generationId, generation);
      return {
        generationId,
        artifacts: artifacts.map(({ path: _privatePath, ...artifact }) => artifact),
      };
    } catch (error) {
      await fs.rm(directory, { recursive: true, force: true });
      throw error;
    }
  }

  getArtifact(generationId: string, kind: ArtifactKind): InternalArtifact {
    const artifact = this.generations
      .get(generationId)
      ?.artifacts.find((candidate) => candidate.kind === kind);
    if (!artifact) throw new Error('生成文件已过期或不存在');
    return artifact;
  }

  async hasOutputCollision(generationId: string, outputDirectory: string): Promise<boolean> {
    const generation = this.generations.get(generationId);
    if (!generation) throw new Error('生成文件已过期或不存在');
    const results = await Promise.all(
      generation.artifacts.map(async (artifact) => {
        try {
          await fs.access(path.join(outputDirectory, artifact.fileName));
          return true;
        } catch {
          return false;
        }
      }),
    );
    return results.some(Boolean);
  }

  async saveAll(generationId: string, outputDirectory: string): Promise<SaveGeneratedResult> {
    const generation = this.generations.get(generationId);
    if (!generation) throw new Error('生成文件已过期或不存在');

    const targets = generation.artifacts.map((artifact) => ({
      artifact,
      target: path.join(outputDirectory, artifact.fileName),
    }));
    const temporaryTargets: string[] = [];
    try {
      for (const { artifact, target } of targets) {
        const temporary = `${target}.${randomUUID()}.tmp`;
        await fs.copyFile(artifact.path, temporary);
        temporaryTargets.push(temporary);
      }
      for (let index = 0; index < targets.length; index += 1) {
        await fs.rename(temporaryTargets[index], targets[index].target);
      }
    } catch (error) {
      await Promise.all(temporaryTargets.map((target) => fs.rm(target, { force: true })));
      throw error;
    }

    return {
      canceled: false,
      outputDirectory,
      fileNames: generation.artifacts.map((artifact) => artifact.fileName),
    };
  }

  async discard(generationId: string): Promise<void> {
    const generation = this.generations.get(generationId);
    if (!generation) return;
    this.generations.delete(generationId);
    await fs.rm(generation.directory, { recursive: true, force: true });
  }

  async clear(): Promise<void> {
    this.generations.clear();
    await fs.rm(this.rootDirectory, { recursive: true, force: true });
  }

  clearSync(): void {
    this.generations.clear();
    rmSync(this.rootDirectory, { recursive: true, force: true });
  }
}
