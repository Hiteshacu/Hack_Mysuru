import os from 'node:os';
import path from 'node:path';

export const ROOT = process.cwd();
// On Vercel the app folder is read-only: scratch files go to the temp folder (data itself lives in Redis, see db.js).
const HOSTED = !!process.env.VERCEL;
export const DATA_FILE = HOSTED ? path.join(os.tmpdir(), 'proofarena-db.json') : path.join(ROOT, 'data', 'db.json');
export const WORKSPACES = HOSTED ? path.join(os.tmpdir(), 'proofarena-workspaces') : path.join(ROOT, '.workspaces');
export const CHALLENGES = path.join(ROOT, 'challenges');

export function challengeDir(challengeId) {
  return path.join(CHALLENGES, challengeId);
}

export function submissionDir(submissionId) {
  return path.join(WORKSPACES, submissionId);
}

export function sessionDir(submissionId, sessionId) {
  return path.join(WORKSPACES, submissionId, 'sessions', sessionId);
}
