import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Layered sandbox for student code (the same layers online judges use, minus Docker):
//   1. a separate Node process with a hard wall-clock limit and a small heap,
//   2. Node's permission model: it may only READ its own temp folder (no writes, no child processes),
//   3. a vm context with no require/process/fs, and a per-test time limit (catches infinite loops per test),
//   4. capped console output. For production, run this inside a throwaway container as well.
const HARNESS = `
const vm = require('node:vm');
const fs = require('node:fs');
const { isDeepStrictEqual } = require('node:util');
const { code, functionName, tests, perTestMs, visibleCount } = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const MARK = '@@PA_RESULT@@';
const logs = [];
let current = -1;
let hiddenLogged = false;
let logChars = 0;
const show = (v) => { try { const s = JSON.stringify(v); return s === undefined ? String(v) : s; } catch { return String(v); } };
const log = (...a) => {
  // Output while a hidden test runs would reveal its input, so it is dropped.
  if (current >= visibleCount) { hiddenLogged = true; return; }
  if (logChars > 4000) return;
  const line = a.map((x) => (typeof x === 'string' ? x : show(x))).join(' ');
  logChars += line.length;
  logs.push(line.slice(0, 500));
};
const sandbox = { console: { log, info: log, warn: log, error: log, debug: log } };
vm.createContext(sandbox, { codeGeneration: { strings: false, wasm: false } });
const done = (o) => { process.stdout.write('\\n' + MARK + JSON.stringify({ ...o, logs: hiddenLogged ? logs.concat('(console output during hidden tests is not shown)') : logs })); process.exit(0); };
try {
  vm.runInContext(code + '\\n;globalThis.__fn = typeof ' + functionName + " === 'function' ? " + functionName + ' : null;', sandbox, { timeout: 2000, filename: 'solution.js' });
} catch (e) {
  done({ error: 'Your code did not load: ' + (e && e.message ? e.message : String(e)) });
}
if (!sandbox.__fn) done({ error: 'Could not find the function ' + functionName + '. Keep the same function name.' });
// Values created inside the vm belong to another realm; compare plain copies.
const plain = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
let timedOut = false;
const results = tests.map((t, i) => {
  current = i;
  if (timedOut) return { ok: false, input: show(t.args), expected: show(t.expected), got: 'skipped', error: 'Skipped: an earlier test hit the time limit' };
  sandbox.__args = JSON.stringify(t.args);
  let got;
  try {
    got = vm.runInContext('__fn(...JSON.parse(__args))', sandbox, { timeout: perTestMs });
  } catch (e) {
    if (e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT') timedOut = true;
    const msg = e && e.code === 'ERR_SCRIPT_EXECUTION_TIMEOUT' ? 'Time limit exceeded (' + perTestMs + ' ms). Infinite loop or too slow?' : 'Threw an error: ' + (e && e.message ? e.message : String(e));
    return { ok: false, input: show(t.args), expected: show(t.expected), got: 'error', error: msg };
  }
  let copy;
  try { copy = plain(got); } catch { copy = got; }
  const hasExpected = Object.prototype.hasOwnProperty.call(t, 'expected');
  return { ok: hasExpected ? isDeepStrictEqual(copy, t.expected) : true, input: show(t.args), expected: hasExpected ? show(t.expected) : undefined, got: show(copy), error: hasExpected && !isDeepStrictEqual(copy, t.expected) ? 'Wrong answer' : undefined };
});
done({ results });
`;

const nodeMajor = Number(process.versions.node.split('.')[0]);
const PERMISSION_FLAG = nodeMajor >= 23 ? '--permission' : '--experimental-permission';

// Runs a student's JavaScript function against test cases in a sandboxed Node process.
export function runFunctionTests({ code, functionName, tests, visibleCount = tests.length, timeoutMs = 6000, perTestMs = 1500 }) {
  if (!/^[A-Za-z_$][\w$]*$/.test(functionName)) throw new Error('Bad function name');
  if (String(code).length > 20000) return Promise.resolve({ passed: 0, total: tests.length, results: [], logs: [], error: 'Your code is too long (20,000 characters max).' });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-code-'));
  fs.writeFileSync(path.join(dir, 'harness.js'), HARNESS);
  fs.writeFileSync(path.join(dir, 'job.json'), JSON.stringify({ code: String(code), functionName, tests, perTestMs, visibleCount }));
  const args = ['--max-old-space-size=96', PERMISSION_FLAG, `--allow-fs-read=${dir}`, '--no-warnings', 'harness.js', 'job.json'];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: dir, windowsHide: true, env: { PATH: process.env.PATH, NODE_OPTIONS: '' } });
    let stdout = '';
    let stderr = '';
    let killed = false;
    child.stdout.on('data', (d) => {
      if (stdout.length < 200000) stdout += d;
    });
    child.stderr.on('data', (d) => {
      if (stderr.length < 4000) stderr += d;
    });
    const timer = setTimeout(() => {
      killed = true;
      child.kill('SIGKILL');
    }, timeoutMs);
    child.on('close', () => {
      clearTimeout(timer);
      fs.rmSync(dir, { recursive: true, force: true });
      if (killed) return resolve({ passed: 0, total: tests.length, results: [], logs: [], error: `Your code ran longer than ${timeoutMs / 1000} seconds in total. Is there an infinite loop?` });
      const at = stdout.lastIndexOf('@@PA_RESULT@@');
      try {
        if (at < 0) throw new Error('no result');
        const parsed = JSON.parse(stdout.slice(at + '@@PA_RESULT@@'.length));
        const logs = parsed.logs || [];
        if (parsed.error) return resolve({ passed: 0, total: tests.length, results: [], logs, error: parsed.error });
        const passed = parsed.results.filter((r) => r.ok).length;
        resolve({ passed, total: tests.length, results: parsed.results, logs });
      } catch {
        const msg = /heap out of memory|Allocation failed/i.test(stderr) ? 'Your code used too much memory.' : (stderr || 'The code crashed').split('\n').filter(Boolean).slice(0, 4).join('\n');
        resolve({ passed: 0, total: tests.length, results: [], logs: [], error: msg.slice(0, 400) });
      }
    });
  });
}

// An AI-generated task is only usable if its reference passes and the buggy/starter code does not.
export async function verifyTask({ reference, broken, functionName, tests }) {
  const good = await runFunctionTests({ code: reference, functionName, tests });
  if (good.error || good.passed !== good.total) return false;
  if (broken) {
    const bad = await runFunctionTests({ code: broken, functionName, tests });
    if (!bad.error && bad.passed === bad.total) return false;
  }
  return true;
}
