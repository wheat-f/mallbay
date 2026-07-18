import { readdir } from 'node:fs/promises';
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

const tsxCli = join(workspaceRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
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
