import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ANSI = /\u001b\[[0-9;]*m/g;

// Runs node:test files and returns a readable log plus parsed per-test results.
// The spec reporter feeds the terminal panel; the TAP reporter is parsed for results.
export function runNodeTests({ cwd, files, env = {}, timeoutMs = 30000 }) {
  return new Promise((resolve) => {
    if (!files.length) {
      resolve({ output: 'No test files found.', tests: [], passed: 0, failed: 0, total: 0, timedOut: false });
      return;
    }
    const tapFile = path.join(os.tmpdir(), `pa-${Date.now()}-${Math.random().toString(36).slice(2)}.tap`);
    const args = [
      '--test',
      '--test-reporter=spec',
      '--test-reporter-destination=stdout',
      '--test-reporter=tap',
      `--test-reporter-destination=${tapFile}`,
      ...files,
    ];
    const child = spawn(process.execPath, args, {
      cwd,
      env: { ...process.env, NODE_OPTIONS: '', FORCE_COLOR: '0', ...env },
      windowsHide: true,
    });
    let output = '';
    let timedOut = false;
    child.stdout.on('data', (d) => (output += d));
    child.stderr.on('data', (d) => (output += d));
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.on('close', () => {
      clearTimeout(timer);
      let tap = '';
      try {
        tap = fs.readFileSync(tapFile, 'utf8');
        fs.rmSync(tapFile, { force: true });
      } catch {}
      const tests = parseTap(tap);
      const passed = tests.filter((t) => t.ok).length;
      if (timedOut) output += '\n[ProofArena] Tests stopped after 30 seconds. Is something waiting forever?';
      resolve({
        output: output.replace(ANSI, '').trim(),
        tests,
        passed,
        failed: tests.length - passed,
        total: tests.length,
        timedOut,
      });
    });
  });
}

function parseTap(tap) {
  const lines = tap.split(/\r?\n/);
  const tests = [];
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^(not )?ok \d+ - (.+?)(?:\s+#.*)?$/);
    if (!m) continue;
    const test = { name: m[2], ok: !m[1] };
    if (!test.ok) test.error = findError(lines, i + 1);
    tests.push(test);
  }
  return tests;
}

function findError(lines, start) {
  for (let j = start; j < Math.min(lines.length, start + 60); j++) {
    if (/^(not )?ok \d+/.test(lines[j])) break;
    const m = lines[j].match(/^\s+error: (.*)$/);
    if (!m) continue;
    const first = m[1].replace(/^'|'$/g, '');
    if (first !== '|-' && first !== '>-') return first;
    const collected = [];
    for (let k = j + 1; k < lines.length && /^\s{4,}/.test(lines[k]); k++) {
      collected.push(lines[k].trim());
      if (collected.length === 4) break;
    }
    return collected.join(' ');
  }
  return 'Test failed';
}
