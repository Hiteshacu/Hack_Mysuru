// Debug Den and Algorithm Grove: a full-screen coding stage with a VS Code (Monaco) editor.
// Code is graded on the ProofArena server in a sandboxed Node process (time, memory and file-access limits).
// Like an online judge: visible tests, hidden tests on submit, console output, and custom input whose
// expected answer comes from the server's reference solution (which never reaches the browser).

import { esc, play, type CodeResult, type QuestPublic, type TestCase } from './api';

type Kind = 'debug' | 'dsa';
type Mode = 'run' | 'submit' | 'custom';

interface MonacoEditor {
  getValue(): string;
  setValue(v: string): void;
  dispose(): void;
  addCommand(keybinding: number, handler: () => void): void;
}

const show = (v: unknown) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

export class CodeStage {
  private root: HTMLDivElement;
  private editor: MonacoEditor | null = null;
  private fallback: HTMLTextAreaElement | null = null;
  private started = performance.now();
  private timer = 0;
  private busy = false;
  private starter: string;
  private storeKey: string;

  constructor(
    host: HTMLElement,
    private kind: Kind,
    q: QuestPublic,
    private onPassed: (points: string) => void,
    private onExit: () => void,
  ) {
    const d = q.debug;
    const s = q.dsa;
    const debug = kind === 'debug';
    const cases: TestCase[] = debug ? d.tests : s.examples;
    const fn = debug ? d.functionName : s.functionName;
    const hiddenCount = debug ? d.hiddenCount ?? 0 : s.hiddenCount;
    this.starter = debug ? d.buggyCode : s.starterCode;
    this.storeKey = `pa-code-${q.id}-${kind}`;
    this.root = document.createElement('div');
    this.root.className = `code-stage ${kind}`;
    this.root.innerHTML = `
      <header class="cs-head">
        <div class="cs-badge">${debug ? '🐞' : '🧠'}</div>
        <div class="cs-title">
          <small>${debug ? 'Stage 3 · Debug Den' : 'Stage 4 · Algorithm Grove'}</small>
          <strong>${esc(debug ? d.title : s.title)}</strong>
        </div>
        <span class="cs-timer" title="Time on this stage">00:00</span>
        <button class="cs-exit" aria-label="Back to the world" title="Back to the world (your code is kept)">✕</button>
      </header>
      <div class="cs-body">
        <aside class="cs-brief">
          ${
            debug
              ? `<p class="cs-kicker">🚨 Bug report</p><p>${esc(d.story)}</p>
                 <p class="cs-kicker">Your mission</p><p>Find and fix the bug in <code>${esc(fn)}</code>. Keep the function name and parameters. The ${d.tests.length} tests below must pass${hiddenCount ? `, plus <b>${hiddenCount} hidden tests</b> (so fix the real bug, don't hard-code answers)` : ''}.</p>`
              : `<p class="cs-kicker">Problem</p><p>${esc(s.statement)}</p>
                 <p class="cs-kicker">Rules</p><p>Write <code>${esc(fn)}</code> in JavaScript. <b>Run examples</b> checks the examples, <b>Submit</b> also runs <b>${hiddenCount} hidden tests</b>. Try your own input in <b>Custom input</b>.</p>`
          }
          <p class="cs-kicker">${debug ? 'Tests' : 'Examples'}</p>
          <ul class="cs-cases">${cases
            .map((c, i) => `<li data-case="${i}"><span class="cs-dot"></span><code>${esc(fn)}(${esc(c.args.map(show).join(', '))})</code><em>→ ${esc(show(c.expected))}</em></li>`)
            .join('')}</ul>
          ${debug ? `<details class="cs-hint"><summary>Need a hint?</summary><p>${esc(d.hint)}</p></details>` : ''}
          ${
            debug
              ? ''
              : `<details class="cs-custom"><summary>Custom input</summary>
                  <label>Arguments as a JSON array<textarea rows="2" spellcheck="false" class="cs-args">${esc(show(s.examples[0]?.args ?? []))}</textarea></label>
                  <button class="btn btn-ghost btn-sm" data-cs="custom">▶ Run my input</button>
                </details>`
          }
          <div class="cs-result" aria-live="polite"></div>
          <div class="cs-console" hidden><p class="cs-kicker">Console</p><pre></pre></div>
        </aside>
        <section class="cs-editor"><div class="cs-monaco"><div class="cs-loading"><span class="cs-spin"></span> Loading VS Code editor…</div></div></section>
      </div>
      <footer class="cs-foot">
        <span class="cs-lang">JavaScript · Node.js sandbox · <kbd>Ctrl</kbd>+<kbd>Enter</kbd> ${debug ? 'runs the tests' : 'runs the examples'}</span>
        <button class="btn btn-ghost" data-cs="reset" title="Start over from the original code">↺ Reset code</button>
        ${debug ? '' : '<button class="btn btn-ghost" data-cs="run">▶ Run examples</button>'}
        <button class="btn btn-primary" data-cs="submit">${debug ? '▶ Run tests & submit fix' : '🚀 Submit solution'}</button>
      </footer>`;
    host.appendChild(this.root);
    this.root.querySelector('.cs-exit')!.addEventListener('click', () => this.close(true));
    this.root.querySelector('[data-cs="submit"]')!.addEventListener('click', () => this.grade('submit'));
    this.root.querySelector('[data-cs="run"]')?.addEventListener('click', () => this.grade('run'));
    this.root.querySelector('[data-cs="custom"]')?.addEventListener('click', () => this.grade('custom'));
    this.root.querySelector('[data-cs="reset"]')!.addEventListener('click', () => {
      if (!confirm('Reset to the original code? Your changes will be lost.')) return;
      this.setCode(this.starter);
    });
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close(true);
    });
    this.timer = window.setInterval(() => {
      const t = Math.floor((performance.now() - this.started) / 1000);
      this.root.querySelector('.cs-timer')!.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    }, 1000);
    // Leaving the stage and coming back keeps the student's work.
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(this.storeKey);
    } catch {
      /* storage unavailable */
    }
    this.mountEditor(saved || this.starter);
  }

  private async mountEditor(code: string) {
    const holder = this.root.querySelector<HTMLElement>('.cs-monaco')!;
    const useTextarea = () => {
      if (this.editor || this.fallback) return;
      holder.innerHTML = '';
      this.fallback = document.createElement('textarea');
      this.fallback.className = 'cs-textarea';
      this.fallback.spellcheck = false;
      this.fallback.value = code;
      this.fallback.addEventListener('keydown', (e) => {
        if (e.key === 'Tab') {
          e.preventDefault();
          const ta = this.fallback!;
          const at = ta.selectionStart;
          ta.value = ta.value.slice(0, at) + '  ' + ta.value.slice(ta.selectionEnd);
          ta.selectionStart = ta.selectionEnd = at + 2;
        }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          this.grade(this.kind === 'debug' ? 'submit' : 'run');
        }
      });
      holder.appendChild(this.fallback);
    };
    // Offline or blocked CDN: fall back to a plain editor after 8 seconds.
    const t = window.setTimeout(useTextarea, 8000);
    try {
      const { default: loader } = await import('@monaco-editor/loader');
      const monaco = await loader.init();
      window.clearTimeout(t);
      if (this.fallback) return;
      holder.innerHTML = '';
      this.editor = monaco.editor.create(holder, {
        value: code,
        language: 'javascript',
        theme: 'vs-dark',
        fontSize: 14,
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 2,
        padding: { top: 12 },
        fontLigatures: false,
      }) as unknown as MonacoEditor;
      this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => this.grade(this.kind === 'debug' ? 'submit' : 'run'));
    } catch {
      window.clearTimeout(t);
      useTextarea();
    }
  }

  private code() {
    return this.editor?.getValue() ?? this.fallback?.value ?? '';
  }

  private setCode(v: string) {
    if (this.editor) this.editor.setValue(v);
    else if (this.fallback) this.fallback.value = v;
    this.save();
  }

  private save() {
    try {
      localStorage.setItem(this.storeKey, this.code());
    } catch {
      /* storage unavailable */
    }
  }

  private async grade(mode: Mode) {
    if (this.busy) return;
    this.busy = true;
    this.save();
    const box = this.root.querySelector<HTMLElement>('.cs-result')!;
    box.className = 'cs-result running';
    box.innerHTML = `<span class="cs-spin"></span> ${mode === 'submit' ? 'Running all tests' : mode === 'custom' ? 'Running your input' : 'Running the examples'} on the server…`;
    this.root.querySelectorAll<HTMLButtonElement>('.cs-foot button, [data-cs="custom"]').forEach((b) => (b.disabled = true));
    try {
      const payload: Record<string, unknown> = { code: this.code(), mode };
      if (mode === 'custom') payload.args = this.root.querySelector<HTMLTextAreaElement>('.cs-args')!.value;
      const r = await play<CodeResult & { passed: boolean }>(this.kind, payload);
      this.render(r, mode);
    } catch (err) {
      box.className = 'cs-result bad';
      box.textContent = (err as Error).message;
    } finally {
      this.busy = false;
      this.root.querySelectorAll<HTMLButtonElement>('.cs-foot button, [data-cs="custom"]').forEach((b) => (b.disabled = false));
    }
  }

  private renderConsole(logs: string[] | undefined) {
    const panel = this.root.querySelector<HTMLElement>('.cs-console')!;
    panel.hidden = !logs?.length;
    panel.querySelector('pre')!.textContent = (logs || []).join('\n');
  }

  private render(r: CodeResult & { passed: boolean }, mode: Mode) {
    const box = this.root.querySelector<HTMLElement>('.cs-result')!;
    this.renderConsole(r.logs);
    if (r.error) {
      box.className = 'cs-result bad shake';
      box.innerHTML = `<b>⚠ ${esc(r.error)}</b>`;
      return;
    }
    if (mode === 'custom') {
      const x = r.results[0];
      box.className = `cs-result ${x?.ok ? 'good' : 'bad'}`;
      box.innerHTML = x
        ? `<b>${x.ok ? '✔ Matches the expected answer' : x.error ? '✖ ' + esc(x.error) : '✖ Different from the expected answer'}</b>
           <ul><li>Input <code>${esc(x.input)}</code></li><li>Your output <code>${esc(x.got)}</code></li><li>Expected <code>${esc(x.expected)}</code></li></ul>`
        : '<b>No result</b>';
      return;
    }
    const visible = r.results.filter((x) => !x.hidden);
    this.root.querySelectorAll<HTMLElement>('.cs-cases li').forEach((li, i) => {
      const res = visible[i];
      li.classList.toggle('ok', !!res?.ok);
      li.classList.toggle('bad', !!res && !res.ok);
    });
    const passCount = r.results.filter((x) => x.ok).length;
    let hiddenNo = 0;
    const rows = r.results
      .map((x) => {
        if (x.hidden) {
          hiddenNo++;
          return `<li class="${x.ok ? 'ok' : 'bad'}">${x.ok ? '✔' : '✖'} Hidden test ${hiddenNo}${x.ok ? '' : ` · ${esc(x.error || 'Wrong answer')}`}</li>`;
        }
        return `<li class="${x.ok ? 'ok' : 'bad'}">${x.ok ? '✔' : '✖'} <code>${esc(x.input)}</code> → expected <code>${esc(x.expected)}</code>${x.ok ? '' : `, got <code>${esc(x.got)}</code>${x.error && x.error !== 'Wrong answer' ? ` <em>${esc(x.error)}</em>` : ''}`}</li>`;
      })
      .join('');
    if (r.passed && (mode === 'submit' || this.kind === 'debug')) {
      box.className = 'cs-result good pop';
      box.innerHTML = `<b>✔ All ${r.total} tests pass!</b><ul>${rows}</ul>`;
      try {
        localStorage.removeItem(this.storeKey);
      } catch {
        /* storage unavailable */
      }
      window.setTimeout(() => {
        this.close(false);
        this.onPassed(this.kind === 'debug' ? 'Bug fixed' : 'Problem solved');
      }, 1500);
      return;
    }
    const allVisiblePass = mode === 'run' && passCount === r.total;
    const hiddenFail = r.results.some((x) => x.hidden && !x.ok) && visible.every((x) => x.ok);
    box.className = `cs-result ${allVisiblePass ? 'good' : 'bad shake'}`;
    box.innerHTML = `<b>${passCount}/${r.total} ${mode === 'run' ? 'examples' : 'tests'} pass${allVisiblePass ? ' · now press Submit' : ''}</b>${
      hiddenFail ? '<p class="cs-tip">The visible tests pass but a hidden one fails: think about edge cases (empty input, duplicates, negatives, capital letters…).</p>' : ''
    }<ul>${rows}</ul>`;
  }

  close(exit: boolean) {
    this.save();
    window.clearInterval(this.timer);
    this.editor?.dispose();
    this.root.classList.add('closing');
    window.setTimeout(() => this.root.remove(), 300);
    if (exit) this.onExit();
  }
}
