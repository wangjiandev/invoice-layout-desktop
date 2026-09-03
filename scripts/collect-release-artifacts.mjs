import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const [arch, tag] = process.argv.slice(2);
if (!['arm64', 'x64'].includes(arch) || !/^v\d+\.\d+\.\d+$/.test(tag ?? '')) {
  throw new Error('Usage: npm run collect:release -- <arm64|x64> <vMAJOR.MINOR.PATCH>');
}

const outputDirectory = path.resolve('out', 'make');
const releaseDirectory = path.resolve('release-assets');
const version = tag.slice(1);

async function findArtifacts(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);
      return entry.isDirectory() ? findArtifacts(entryPath) : [entryPath];
    }),
  );
  return files.flat();
}

await fs.rm(releaseDirectory, { recursive: true, force: true });
await fs.mkdir(releaseDirectory, { recursive: true });

const sourceArtifacts = (await findArtifacts(outputDirectory)).filter((file) =>
  ['.dmg', '.zip'].includes(path.extname(file).toLowerCase()),
);

if (sourceArtifacts.length !== 2) {
  throw new Error(`Expected one DMG and one ZIP, found ${sourceArtifacts.length}`);
}

const checksumLines = [];
for (const source of sourceArtifacts) {
  const extension = path.extname(source).toLowerCase();
  const fileName = `invoice-layout-desktop-${version}-mac-${arch}${extension}`;
  const destination = path.join(releaseDirectory, fileName);
  await fs.copyFile(source, destination);
  const digest = createHash('sha256')
    .update(await fs.readFile(destination))
    .digest('hex');
  checksumLines.push(`${digest}  ${fileName}`);
}

await fs.writeFile(
  path.join(releaseDirectory, `SHA256SUMS-${arch}.txt`),
  `${checksumLines.sort().join('\n')}\n`,
  'utf8',
);
