import fs from 'node:fs';
import path from 'node:path';
import { DATA_FILE, WORKSPACES } from './paths';
import { createSeed } from './seed';

// Storage.
//   Local (npm run dev): a single JSON file, data/db.json.
//   Hosted (Vercel): serverless functions can't keep files, so the same JSON document lives in Upstash Redis
//   (Vercel → Storage → Upstash Redis sets KV_REST_API_URL / KV_REST_API_TOKEN). Every request first pulls the
//   latest document (syncDb) and waits for its own writes to be saved before responding (flushDb).
// readDb / updateDb stay synchronous either way, so a read-modify-write can't interleave inside one instance.

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
const KEY = process.env.PROOFARENA_DB_KEY || 'proofarena:db';
export const remoteStore = !!(REDIS_URL && REDIS_TOKEN);

let cache = null; // the document, when stored in Redis
let version = 0;
let chain = Promise.resolve(); // pending saves, in order

async function redis(cmd, value) {
  const res = await fetch(`${REDIS_URL}/${cmd}/${encodeURIComponent(KEY)}`, {
    method: value === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    body: value,
    cache: 'no-store',
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(`Redis ${cmd} failed: ${json.error || res.status}`);
  return json.result;
}

function queueSave() {
  const snapshot = JSON.stringify({ v: version, data: cache });
  chain = chain.then(() => redis('set', snapshot)).catch((err) => console.error('[db] save failed:', err.message));
}

/** Pull the latest document from Redis (no-op for the local file). Call at the start of every request. */
export async function syncDb() {
  if (!remoteStore) return;
  await chain;
  const raw = await redis('get');
  if (raw) {
    const { v, data } = JSON.parse(raw);
    if (!cache || v >= version) {
      cache = data;
      version = v;
    }
  } else if (!cache) {
    cache = createSeed();
    version = 1;
    queueSave();
    await chain;
  }
}

/** Wait until this instance's writes are stored (call before responding / ending background work). */
export function flushDb() {
  return chain;
}

function withDefaults(db) {
  db.customChallenges ||= [];
  db.connections ||= [];
  db.quests ||= [];
  db.questRuns ||= [];
  db.notifications ||= [];
  return db;
}

export function readDb() {
  if (remoteStore) {
    if (!cache) {
      cache = createSeed();
      version = 1;
    }
    return withDefaults(structuredClone(cache));
  }
  if (!fs.existsSync(DATA_FILE)) {
    writeDb(createSeed());
  }
  return withDefaults(JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
}

export function writeDb(db) {
  if (remoteStore) {
    cache = structuredClone(db);
    version++;
    queueSave();
    return;
  }
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2));
}

export function updateDb(fn) {
  const db = readDb();
  const result = fn(db);
  writeDb(db);
  return result;
}

export function resetDb() {
  fs.rmSync(WORKSPACES, { recursive: true, force: true });
  writeDb(createSeed());
}

/** Run background work (after the response) with the latest data, and save it before the function ends. */
export async function inBackground(work) {
  await syncDb();
  try {
    await work();
  } finally {
    await flushDb();
  }
}

export function uid(prefix) {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

export function logActivity(db, text, who = 'system') {
  db.activity.unshift({ id: uid('act'), text, who, at: new Date().toISOString() });
  db.activity = db.activity.slice(0, 40);
}
