import fs from 'node:fs';
import path from 'node:path';
import { ROOT, submissionDir } from './paths';
import { copyProject, listFiles, readFiles, fetchSource } from './workspace';

// On a serverless host (Vercel) every instance has its own /tmp, so a student's project folders may be missing on
// the instance that serves the next request. The database (shared through Redis) keeps a copy of the project as
// submitted (sub.files) and after each cleared mission (sub.snapshot), and any instance can rebuild the folders.

export const DEMO_PROJECT = path.resolve(ROOT, '..', 'student-project');
const MAX_SNAPSHOT_CHARS = 1_500_000;

/** A local folder the server can't see, named like the bundled demo project, means the demo project. */
export function resolveSource(source) {
  const s = String(source || '').trim();
  if (/^(https?:\/\/|git@)/.test(s) || fs.existsSync(s)) return s;
  if (/(^|[\\/])student-project[\\/]?$/i.test(s) && fs.existsSync(DEMO_PROJECT)) return DEMO_PROJECT;
  return s;
}

/** Every file of a project folder, if it is small enough to keep in the database. */
export function snapshotOf(dir) {
  const files = readFiles(dir);
  const size = Object.values(files).reduce((n, c) => n + c.length, 0);
  return size && size <= MAX_SNAPSHOT_CHARS ? files : null;
}

export function writeSnapshot(dir, files) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  for (const [rel, content] of Object.entries(files)) {
    const full = path.resolve(dir, rel);
    if (!full.startsWith(path.resolve(dir) + path.sep)) continue;
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
  }
}

/** The submission's original/ and current/ folders, rebuilt on this instance if they are missing. */
export async function ensureSubmissionFiles(sub) {
  const base = submissionDir(sub.id);
  const original = path.join(base, 'original');
  const current = path.join(base, 'current');
  if (!listFiles(original).length) {
    if (sub.files) writeSnapshot(original, sub.files);
    else if (!sub.sample) await fetchSource(resolveSource(sub.source), original);
  }
  if (!listFiles(current).length && listFiles(original).length) {
    if (sub.snapshot) writeSnapshot(current, sub.snapshot);
    else copyProject(original, current);
  }
  return { original, current };
}
