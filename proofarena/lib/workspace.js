import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { diffLines, createTwoFilesPatch } from 'diff';

const IGNORED = new Set(['node_modules', '.git', '.next', '.DS_Store']);
const MAX_FILE_BYTES = 200 * 1024;

export function isPlatformFile(rel) {
  return rel.startsWith('tests/proofarena-');
}

export function copyProject(src, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(src, dest, { recursive: true, filter: (p) => !IGNORED.has(path.basename(p)) });
}

export function listFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (IGNORED.has(entry.name)) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (fs.statSync(full).size <= MAX_FILE_BYTES) out.push(path.relative(dir, full).split(path.sep).join('/'));
    }
  };
  if (fs.existsSync(dir)) walk(dir);
  return out.sort();
}

export function readFiles(dir) {
  const files = {};
  for (const rel of listFiles(dir)) files[rel] = fs.readFileSync(path.join(dir, rel), 'utf8');
  return files;
}

// Resolves a relative path inside root and refuses anything that escapes it.
export function safeJoin(root, rel) {
  const full = path.resolve(root, rel);
  if (!full.startsWith(path.resolve(root) + path.sep)) throw new Error('Path is outside the workspace');
  return full;
}

export function contentHash(dir) {
  const hash = crypto.createHash('sha1');
  for (const rel of listFiles(dir)) {
    hash.update(rel);
    hash.update(fs.readFileSync(path.join(dir, rel)));
  }
  return hash.digest('hex').slice(0, 7);
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true });
    let out = '';
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', reject);
    child.on('close', (code) => (code === 0 ? resolve(out.trim()) : reject(new Error(out.trim() || `${cmd} failed`))));
  });
}

// Copies a student's project from a GitHub URL or a local folder into dest.
export async function fetchSource(source, dest) {
  fs.rmSync(dest, { recursive: true, force: true });
  if (/^(https?:\/\/|git@)/.test(source)) {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    await run('git', ['clone', '--depth', '1', source, dest]);
    const commit = (await run('git', ['rev-parse', '--short', 'HEAD'], dest)).slice(0, 7);
    fs.rmSync(path.join(dest, '.git'), { recursive: true, force: true });
    return { kind: 'github', commit };
  }
  if (!fs.existsSync(source)) throw new Error(`Folder not found: ${source}`);
  copyProject(source, dest);
  return { kind: 'local', commit: contentHash(dest) };
}

// Compares two project folders file by file.
export function diffDirs(beforeDir, afterDir, { skip = isPlatformFile } = {}) {
  const before = readFiles(beforeDir);
  const after = readFiles(afterDir);
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter((p) => !skip(p)).sort();
  const changes = [];
  for (const p of paths) {
    const a = before[p];
    const b = after[p];
    if (a === b) continue;
    let added = 0;
    let removed = 0;
    for (const part of diffLines(a || '', b || '')) {
      if (part.added) added += part.count;
      if (part.removed) removed += part.count;
    }
    changes.push({
      path: p,
      status: a === undefined ? 'added' : b === undefined ? 'deleted' : 'modified',
      added,
      removed,
      patch: createTwoFilesPatch(`a/${p}`, `b/${p}`, a || '', b || '', '', '', { context: 2 }),
    });
  }
  return changes;
}

export function countLines(dir, prefix = 'src/') {
  return listFiles(dir)
    .filter((p) => p.startsWith(prefix))
    .reduce((n, p) => n + fs.readFileSync(path.join(dir, p), 'utf8').split('\n').length, 0);
}
