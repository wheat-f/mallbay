import { access, readdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, relative } from 'node:path';

const workspaceRoot = process.cwd();
const testRoot = join(workspaceRoot, 'src');

async function collectTestFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return collectTestFiles(path);
      return entry.isFile() && entry.name.endsWith('.test.ts') ? [path] : [];
    }),
  );

  return files.flat();
}

const testFiles = (await collectTestFiles(testRoot))
  .sort()
  .map((file) => relative(workspaceRoot, file));

if (testFiles.length === 0) {
  throw new Error('未找到 Web 测试文件');
}

const localTsxCli = join(workspaceRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const rootTsxCli = join(workspaceRoot, '..', '..', 'node_modules', 'tsx', 'dist', 'cli.mjs');
const virtualStoreTsxCli = await findVirtualStoreTsxCli();
const tsxCli = await firstExistingPath([localTsxCli, virtualStoreTsxCli, rootTsxCli]);
const child = spawn(
  process.execPath,
  [
    tsxCli,
    '--tsconfig',
    'tsconfig.json',
    '--test',
    '--test-force-exit',
    '--test-concurrency=8',
    ...testFiles,
  ],
  { stdio: 'inherit' },
);

child.once('error', (error) => {
  throw error;
});

child.once('exit', (code, signal) => {
  if (signal) process.exitCode = 1;
  else process.exitCode = code ?? 1;
});

async function firstExistingPath(paths) {
  for (const path of paths) {
    try {
      await access(path);
      return path;
    } catch {
      // Try the next workspace layout.
    }
  }
  throw new Error(`未找到 tsx CLI：${paths.join(', ')}`);
}

async function findVirtualStoreTsxCli() {
  const virtualStore = join(workspaceRoot, '..', '..', 'node_modules', '.pnpm');
  try {
    const entries = await readdir(virtualStore);
    const packageDir = entries
      .filter((entry) => entry.startsWith('tsx@'))
      .sort()
      .at(-1);
    return packageDir
      ? join(virtualStore, packageDir, 'node_modules', 'tsx', 'dist', 'cli.mjs')
      : join(virtualStore, 'tsx', 'node_modules', 'tsx', 'dist', 'cli.mjs');
  } catch {
    return join(virtualStore, 'tsx', 'node_modules', 'tsx', 'dist', 'cli.mjs');
  }
}
