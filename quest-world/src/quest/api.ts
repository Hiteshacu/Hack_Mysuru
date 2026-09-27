// Talks to the ProofArena API (same origin in production, proxied in `npm run dev`).

export type Stage = 'mcq' | 'arrow' | 'debug' | 'dsa' | 'done';
export const STAGE_ORDER: Stage[] = ['mcq', 'arrow', 'debug', 'dsa', 'done'];

export interface TestCase {
  args: unknown[];
  expected: unknown;
}

export interface QuestPublic {
  id: string;
  title: string;
  jobDescription: string;
  skills: string[];
  passMark: number;
  company: { name: string; color: string } | null;
  mcq: { q: string; options: string[] }[];
  arrows: { prompt: string; choices: string[] }[];
  debug: { title: string; story: string; functionName: string; buggyCode: string; hint: string; tests: TestCase[]; hiddenCount?: number };
  dsa: { title: string; statement: string; functionName: string; starterCode: string; examples: TestCase[]; hiddenCount: number };
}

export interface QuestRun {
  stage: Stage;
  points: number;
  rifle: boolean;
  mcqScore?: number;
  /** Games the player skipped (0 points each). */
  skipped?: string[];
  arrowScore?: { correct: number; accuracy: number };
  finishedAt?: string | null;
}

export interface CommunityJob {
  company: string;
  color: string;
  title: string;
  location: string;
  pay: string;
  applyUrl: string;
  hrName: string;
  hrEmail: string;
}

export interface QuestView {
  quest: QuestPublic;
  student: { id: string; name: string; initials: string; color: string; xp: number } | null;
  run: QuestRun | null;
  hall: { name: string; college: string; points: number; color: string }[];
  recruiters: { name: string; color: string; openings: string[] }[];
  community: CommunityJob[] | null;
  /** One per enemy outpost: which company and role it guards (names stay hidden until unlocked). */
  guards: { slot: number; company: string; color: string; role: string }[];
  unlocked: Profile[];
  /** Snake Debug: the 9 apple labels; once solved, the lines of the buggy code that hold the bug. */
  snake: { options: string[]; done: boolean; bugLines: number[] };
}

/** A hiring-team member unlocked by defeating an outpost in battle. */
export interface Profile {
  id: string;
  name: string;
  role: string;
  company: string;
  color: string;
  city?: string;
  email: string;
  linkedin: string;
  hiringFor: string[];
}

export interface CodeResult {
  passed: boolean | number;
  total: number;
  mode?: 'run' | 'submit' | 'custom';
  logs?: string[];
  results: { ok: boolean; input?: string; expected?: string; got?: string; error?: string; hidden?: boolean }[];
  error?: string;
}

const params = new URLSearchParams(location.search);
export const studentId = params.get('student') || 'hitesh';
let questId = params.get('quest') || '';

/** Shared quest state, filled before the world is built (Landmarks paint skills and names from it). */
export const quest = { view: null as QuestView | null };

async function json<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body as T;
}

export async function loadQuest(): Promise<QuestView> {
  if (!questId) {
    // No quest in the link: open the newest one on the platform.
    const state = await json<{ quests: { id: string }[] }>(await fetch('/api/state'));
    questId = state.quests[0]?.id || '';
    if (!questId) throw new Error('No 3D Quest has been published yet. Create one in the company dashboard.');
  }
  quest.view = await json<QuestView>(await fetch(`/api/quests/${questId}?student=${encodeURIComponent(studentId)}`));
  return quest.view;
}

export async function refreshQuest() {
  quest.view = await json<QuestView>(await fetch(`/api/quests/${questId}?student=${encodeURIComponent(studentId)}`));
  return quest.view;
}

export async function play<T = Record<string, unknown>>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/api/quests/${questId}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ studentId, action, ...payload }),
  });
  return json<T>(res);
}

export function stage(): Stage {
  return quest.view?.run?.stage ?? 'mcq';
}

export function stageDone(s: Stage) {
  return STAGE_ORDER.indexOf(stage()) > STAGE_ORDER.indexOf(s);
}

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
