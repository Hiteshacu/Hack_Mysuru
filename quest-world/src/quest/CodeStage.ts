// Debug Den and Algorithm Grove: a full-screen coding stage laid out like LeetCode / VS Code.
//   header      : title, timer, Run and Submit
//   game strip  : Bug Hunt / Boss battle (Arena.ts)
//   left        : Description · Hints · Tests tabs
//   right       : a Monaco editor (file tab, font size, copy, reset) over a resizable panel with
//                 Testcase · Test Result · Console tabs
//   status bar  : cursor position, language, sandbox state
// Code is graded on the ProofArena server in a sandboxed Node process (time, memory and file-access limits).
// Like an online judge: visible tests, hidden tests on submit, a verdict (Accepted / Wrong Answer / Runtime Error /
// Time Limit Exceeded), console output, and custom input whose expected answer comes from the server's reference
// solution (which never reaches the browser).

import { esc, play, type CodeResult, type QuestPublic, type TestCase } from './api';
import { CodeArena } from './Arena';
import { skipButtonHTML, wireSkip } from './skip';

type Kind = 'debug' | 'dsa';
type Mode = 'run' | 'submit' | 'custom';
type Row = CodeResult['results'][number];

interface MonacoEditor {
  getValue(): string;
  setValue(v: string): void;
  dispose(): void;
  focus(): void;
  addCommand(keybinding: number, handler: () => void): void;
  getTopForLineNumber(line: number): number;
  getScrollTop(): number;
  getLayoutInfo(): { contentLeft: number; contentWidth: number };
  getOption(option: number): number;
  updateOptions(o: Record<string, unknown>): void;
  deltaDecorations(old: string[], next: unknown[]): string[];
  onDidScrollChange(cb: () => void): void;
  onDidLayoutChange(cb: () => void): void;
  onDidChangeCursorPosition(cb: (e: { position: { lineNumber: number; column: number } }) => void): void;
  onDidChangeModelContent(cb: () => void): void;
}

/** Phones/tablets: Monaco (VS Code's editor) does not support mobile keyboards, so they get the plain editor. */
const TOUCH = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

const show = (v: unknown) => {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
};

/** AI-written text uses a little markdown: **bold**, `code` and line breaks. Escaped first, so it stays safe. */
const md = (text: string) =>
  esc(text)
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>');

/** Parameter names from a function signature, for "nums = [2,7,11]" style inputs. */
function paramNames(code: string, fn: string) {
  const m = new RegExp(`function\\s+${fn}\\s*\\(([^)]*)\\)`).exec(code);
  return m ? m[1].split(',').map((p) => p.trim().replace(/=.*$/, '').trim()).filter(Boolean) : [];
}

export class CodeStage {
  private root: HTMLDivElement;
  private editor: MonacoEditor | null = null;
  private fallback: HTMLTextAreaElement | null = null;
  private started = performance.now();
  private timer = 0;
  private busy = false;
  private starter: string;
  private storeKey: string;
  private arena: CodeArena;
  private cases: TestCase[];
  private params: string[];
  private fn: string;
  private fontSize = 14;

  constructor(
    host: HTMLElement,
    private kind: Kind,
    q: QuestPublic,
    private onPassed: (points: string) => void,
    private onExit: () => void,
    /** Debug Den: the lines the snake circles (earned in Snake Debug). */
    private bugLines: number[] = [],
    /** Skip button: unlocks the next stage with 0 points for this one. */
    onSkip?: () => Promise<void>,
  ) {
    const d = q.debug;
    const s = q.dsa;
    const debug = kind === 'debug';
    this.cases = debug ? d.tests : s.examples;
    this.fn = debug ? d.functionName : s.functionName;
    const hiddenCount = debug ? d.hiddenCount ?? 0 : s.hiddenCount;
    this.starter = debug ? d.buggyCode : s.starterCode;
    this.params = paramNames(this.starter, this.fn);
    this.storeKey = `pa-code-${q.id}-${kind}`;
    try {
      this.fontSize = Number(localStorage.getItem('pa-font')) || 14;
    } catch {
      /* storage unavailable */
    }
    const difficulty = debug ? 'Bug fix' : hiddenCount >= 5 ? 'Medium' : 'Easy';
    const tags = (q.skills || []).slice(0, 3);
    this.root = document.createElement('div');
    this.root.className = `code-stage ide ${kind}`;
    this.root.innerHTML = `
      <header class="ide-head">
        <div class="cs-badge">${debug ? '🐞' : '🧠'}</div>
        <div class="cs-title">
          <small>${debug ? 'Stage 3 · Debug Den' : 'Stage 4 · Algorithm Grove'}</small>
          <strong>${esc(debug ? d.title : s.title)}</strong>
        </div>
        <div class="ide-actions">
          <span class="cs-timer" title="Time on this stage">⏱ 00:00</span>
          ${debug ? '' : '<button class="ide-btn run" data-cs="run" title="Run the examples (Ctrl+Enter)">▶ Run</button>'}
          <button class="ide-btn submit" data-cs="submit" title="${debug ? 'Run every test (Ctrl+Enter)' : 'Submit against all tests (Ctrl+Shift+Enter)'}">${debug ? '▶ Run tests & submit fix' : '☁ Submit'}</button>
          ${onSkip ? skipButtonHTML() : ''}
          <button class="cs-exit" aria-label="Back to the world" title="Back to the world (your code is kept)">✕</button>
        </div>
      </header>
      <div class="cs-arena"></div>
      <div class="ide-main">
        <section class="ide-left">
          <nav class="ide-tabs" data-group="left">
            <button class="on" data-tab="desc">📄 Description</button>
            <button data-tab="hints">💡 Hints</button>
          </nav>
          <div class="ide-pane" data-pane="desc">
            <h2 class="ide-h">${esc(debug ? d.title : s.title)}</h2>
            <div class="ide-meta"><span class="ide-diff ${difficulty.toLowerCase().replace(' ', '-')}">${difficulty}</span>${tags.map((t) => `<span class="ide-tag">${esc(t)}</span>`).join('')}<span class="ide-tag">🔒 ${hiddenCount} hidden tests</span></div>
            ${
              debug
                ? `<p class="cs-kicker">🚨 Bug report</p><p>${md(d.story)}</p>
                   <p class="cs-kicker">Your mission</p><p>Find and fix the bug in <code>${esc(this.fn)}</code>. Keep the function name and parameters. The ${d.tests.length} tests must pass${hiddenCount ? `, plus <b>${hiddenCount} hidden tests</b> (so fix the real bug, don't hard-code answers)` : ''}.</p>
                   ${bugLines.length ? `<p class="cs-snakehint">🐍 The snake found the bug in ${bugLines.length === 1 ? 'line ' + bugLines[0] : 'lines ' + bugLines.join(', ')}. It's circling it in the editor.</p>` : ''}`
                : `<p>${md(s.statement)}</p>`
            }
            ${this.cases
              .map(
                (c, i) => `<div class="ide-example"><b>${debug ? 'Test' : 'Example'} ${i + 1}</b>
                  <pre><span>Input:</span> ${esc(this.argText(c.args))}\n<span>Output:</span> ${esc(show(c.expected))}</pre></div>`,
              )
              .join('')}
            <p class="cs-kicker">Rules</p>
            <ul class="ide-rules"><li>JavaScript, runs on Node.js in a sandbox (no <code>require</code>, files or network)</li><li>1.5 s per test · <code>console.log</code> shows in the Console tab</li>${debug ? '' : '<li><b>Run</b> checks the examples; <b>Submit</b> also runs the hidden tests</li>'}</ul>
          </div>
          <div class="ide-pane" data-pane="hints" hidden>
            ${debug ? `<details class="cs-hint" open><summary>Hint 1</summary><p>${esc(d.hint)}</p></details>` : ''}
            <details class="cs-hint"><summary>${debug ? 'Hint 2' : 'Hint 1'}</summary><p>${debug ? 'Read the failing test in Test Result: compare the expected and actual output, then trace the code by hand with that input.' : 'Start with the brute force, check it with Run, then look for a hash map, two pointers or a single pass to make it faster.'}</p></details>
            <details class="cs-hint"><summary>${debug ? 'Hint 3' : 'Hint 2'}</summary><p>Hidden tests love edge cases: empty input, one element, duplicates, negatives, very large values.</p></details>
          </div>
        </section>
        <div class="ide-split" title="Drag to resize"></div>
        <section class="ide-right">
          <div class="ide-filebar">
            <span class="ide-file">🟨 solution.js<i class="ide-dirty" hidden>●</i></span>
            <span class="ide-lang">JavaScript</span>
            <div class="ide-tools">
              <button data-tool="smaller" title="Smaller font">A−</button>
              <button data-tool="bigger" title="Bigger font">A+</button>
              <button data-tool="copy" title="Copy code">⧉ Copy</button>
              <button data-tool="reset" title="Start over from the original code">↺ Reset</button>
            </div>
          </div>
          <div class="cs-monaco"><div class="cs-loading"><span class="cs-spin"></span> Loading VS Code editor…</div></div>
          <div class="ide-hsplit" title="Drag to resize"></div>
          <div class="ide-bottom">
            <nav class="ide-tabs" data-group="bottom">
              <button class="on" data-tab="cases">✅ Testcase</button>
              <button data-tab="result">▶ Test Result</button>
              <button data-tab="console">⌨ Console</button>
            </nav>
            <div class="ide-pane" data-pane="cases">
              <div class="ide-chips case-chips">${this.cases.map((_, i) => `<button class="chip-case${i === 0 ? ' on' : ''}" data-case="${i}">Case ${i + 1}</button>`).join('')}${debug ? '' : '<button class="chip-case custom" data-case="custom">＋ Custom</button>'}</div>
              <div class="ide-case"></div>
            </div>
            <div class="ide-pane" data-pane="result" hidden><div class="ide-empty">You must run your code first.</div></div>
            <div class="ide-pane" data-pane="console" hidden><pre class="ide-console">// console.log output appears here</pre></div>
          </div>
        </section>
      </div>
      <footer class="ide-status">
        <span>⎇ quest/${kind}</span>
        <span class="ide-state">● Sandbox ready</span>
        <span class="ide-grow"></span>
        <span class="ide-pos">Ln 1, Col 1</span>
        <span>Spaces: 2</span>
        <span>UTF-8</span>
        <span>JavaScript</span>
        <span>Node 20 · 1.5 s/test</span>
      </footer>`;
    host.appendChild(this.root);
    this.arena = new CodeArena(this.root.querySelector<HTMLElement>('.cs-arena')!, kind, this.cases.length, hiddenCount);
    this.bindUi();
    if (onSkip) wireSkip(this.root, onSkip);
    this.showCase(0);
    this.timer = window.setInterval(() => {
      const t = Math.floor((performance.now() - this.started) / 1000);
      this.root.querySelector('.cs-timer')!.textContent = `⏱ ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
    }, 1000);
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(this.storeKey);
    } catch {
      /* storage unavailable */
    }
    this.mountEditor(saved || this.starter);
  }

  private argText(args: unknown[]) {
    return args.map((a, i) => (this.params[i] ? `${this.params[i]} = ${show(a)}` : show(a))).join(', ');
  }

  // ---------------------------------------------------------------- UI wiring

  private bindUi() {
    const $ = (sel: string) => this.root.querySelector<HTMLElement>(sel);
    $('.cs-exit')!.addEventListener('click', () => this.close(true));
    $('[data-cs="submit"]')!.addEventListener('click', () => this.grade('submit'));
    $('[data-cs="run"]')?.addEventListener('click', () => this.grade('run'));
    // Tabs
    this.root.querySelectorAll<HTMLElement>('.ide-tabs').forEach((nav) =>
      nav.addEventListener('click', (e) => {
        const b = (e.target as HTMLElement).closest<HTMLElement>('[data-tab]');
        if (b) this.tab(nav.dataset.group!, b.dataset.tab!);
      }),
    );
    // Test case chips
    $('.case-chips')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-case]');
      if (!b) return;
      this.showCase(b.dataset.case === 'custom' ? -1 : Number(b.dataset.case));
    });
    // Editor tools
    $('.ide-tools')!.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-tool]')?.dataset.tool;
      if (t === 'smaller' || t === 'bigger') {
        this.fontSize = Math.max(11, Math.min(22, this.fontSize + (t === 'bigger' ? 1 : -1)));
        this.editor?.updateOptions({ fontSize: this.fontSize });
        if (this.fallback) this.fallback.style.fontSize = `${this.fontSize}px`;
        try {
          localStorage.setItem('pa-font', String(this.fontSize));
        } catch {
          /* storage unavailable */
        }
      } else if (t === 'copy') {
        navigator.clipboard?.writeText(this.code()).then(() => this.flashState('✓ Copied to clipboard'));
      } else if (t === 'reset') {
        if (confirm('Reset to the original code? Your changes will be lost.')) this.setCode(this.starter);
      }
    });
    // Keyboard: Esc leaves, Ctrl+Enter runs, Ctrl+Shift+Enter submits
    this.root.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Escape') this.close(true);
    });
    // Resizable panes
    this.dragSplit($('.ide-split')!, (dx) => {
      const left = $('.ide-left')!;
      const w = Math.max(260, Math.min(window.innerWidth * 0.55, left.getBoundingClientRect().width + dx));
      this.root.style.setProperty('--left-w', `${w}px`);
    });
    this.dragSplit($('.ide-hsplit')!, (_dx, dy) => {
      const b = $('.ide-bottom')!;
      const h = Math.max(120, Math.min(window.innerHeight * 0.6, b.getBoundingClientRect().height - dy));
      this.root.style.setProperty('--bottom-h', `${h}px`);
    });
  }

  private dragSplit(handle: HTMLElement, onMove: (dx: number, dy: number) => void) {
    handle.addEventListener('pointerdown', (e) => {
      try {
        handle.setPointerCapture(e.pointerId);
      } catch {
        /* capture unsupported: dragging still works while over the handle */
      }
      let x = e.clientX, y = e.clientY;
      const move = (ev: PointerEvent) => {
        onMove(ev.clientX - x, ev.clientY - y);
        x = ev.clientX;
        y = ev.clientY;
      };
      const up = () => {
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
      };
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  private tab(group: string, id: string) {
    const nav = this.root.querySelector<HTMLElement>(`.ide-tabs[data-group="${group}"]`)!;
    nav.querySelectorAll<HTMLElement>('[data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === id));
    const panes = nav.parentElement!.querySelectorAll<HTMLElement>(':scope > .ide-pane');
    panes.forEach((p) => (p.hidden = p.dataset.pane !== id));
  }

  /** Testcase tab: show one example's inputs (read-only), or the custom-input editor (-1). */
  private showCase(i: number) {
    this.root.querySelectorAll<HTMLElement>('.case-chips [data-case]').forEach((b) => b.classList.toggle('on', b.dataset.case === (i < 0 ? 'custom' : String(i))));
    const box = this.root.querySelector<HTMLElement>('.ide-case')!;
    if (i < 0) {
      const first = this.cases[0]?.args ?? [];
      box.innerHTML = `
        <label class="ide-field"><span>Arguments as a JSON array${this.params.length ? ` <em>[${esc(this.params.join(', '))}]</em>` : ''}</span>
          <textarea class="cs-args" rows="3" spellcheck="false">${esc(show(first))}</textarea></label>
        <button class="ide-btn run" data-cs="custom">▶ Run my input</button>
        <p class="ide-note">The expected answer comes from the company's reference solution, run on the server.</p>`;
      box.querySelector('[data-cs="custom"]')!.addEventListener('click', () => this.grade('custom'));
      return;
    }
    const c = this.cases[i];
    box.innerHTML = c.args
      .map((a, k) => `<div class="ide-field"><span>${esc(this.params[k] || `arg ${k + 1}`)} =</span><pre>${esc(show(a))}</pre></div>`)
      .join('') + `<div class="ide-field"><span>Expected</span><pre>${esc(show(c.expected))}</pre></div>`;
  }

  private flashState(text: string, cls = '') {
    const s = this.root.querySelector<HTMLElement>('.ide-state')!;
    s.textContent = text;
    s.className = `ide-state ${cls}`;
  }

  // ---------------------------------------------------------------- editor

  private async mountEditor(code: string) {
    const holder = this.root.querySelector<HTMLElement>('.cs-monaco')!;
    const useTextarea = () => {
      if (this.editor || this.fallback) return;
      holder.innerHTML = '';
      this.fallback = document.createElement('textarea');
      this.fallback.className = 'cs-textarea';
      this.fallback.spellcheck = false;
      this.fallback.value = code;
      this.fallback.style.fontSize = `${this.fontSize}px`;
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
          this.grade(e.shiftKey || this.kind === 'debug' ? 'submit' : 'run');
        }
      });
      this.fallback.addEventListener('input', () => this.dirty(true));
      holder.appendChild(this.fallback);
      if (this.kind === 'debug' && this.bugLines.length) {
        const ta = this.fallback;
        const first = Math.min(...this.bugLines), last = Math.max(...this.bugLines);
        this.coilSnake(
          holder,
          first,
          last,
          () => {
            const cs = getComputedStyle(ta);
            const lh = parseFloat(cs.lineHeight) || 21;
            const pad = parseFloat(cs.paddingTop) || 16;
            return { top: pad + (first - 1) * lh - ta.scrollTop - 6, h: (last - first + 1) * lh + 12, left: 6, w: Math.min(ta.clientWidth - 20, 560) };
          },
          (place) => {
            ta.addEventListener('scroll', place);
            window.addEventListener('resize', place);
          },
        );
      }
    };
    if (TOUCH) {
      useTextarea();
      return;
    }
    // Offline or blocked CDN: fall back to a plain editor after 10 seconds.
    const t = window.setTimeout(useTextarea, 10000);
    try {
      const { default: loader } = await import('@monaco-editor/loader');
      const monaco = await loader.init();
      window.clearTimeout(t);
      if (this.fallback) return;
      holder.innerHTML = '';
      monaco.editor.defineTheme('proofarena', {
        base: 'vs-dark',
        inherit: true,
        rules: [
          { token: 'comment', foreground: '7f8c9a', fontStyle: 'italic' },
          { token: 'keyword', foreground: 'c792ea' },
          { token: 'number', foreground: 'f78c6c' },
          { token: 'string', foreground: 'c3e88d' },
          { token: 'identifier', foreground: 'e6edf3' },
          { token: 'delimiter', foreground: '89ddff' },
        ],
        colors: {
          'editor.background': '#12141c',
          'editor.lineHighlightBackground': '#1c2030',
          'editorLineNumber.foreground': '#4b5263',
          'editorLineNumber.activeForeground': '#ffd27a',
          'editorCursor.foreground': '#ffd27a',
          'editor.selectionBackground': '#3a3f5a',
          'editorIndentGuide.background1': '#262a38',
          'editorGutter.background': '#12141c',
        },
      });
      this.editor = monaco.editor.create(holder, {
        value: code,
        language: 'javascript',
        theme: 'proofarena',
        fontSize: this.fontSize,
        fontFamily: "'JetBrains Mono', 'Cascadia Code', 'Fira Code', Consolas, monospace",
        fontLigatures: false,
        minimap: { enabled: false },
        automaticLayout: true,
        scrollBeyondLastLine: false,
        tabSize: 2,
        padding: { top: 14, bottom: 14 },
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        smoothScrolling: true,
        bracketPairColorization: { enabled: true },
        guides: { bracketPairs: true, indentation: true },
        renderLineHighlight: 'all',
        roundedSelection: true,
        glyphMargin: this.kind === 'debug' && this.bugLines.length > 0,
        stickyScroll: { enabled: true },
        suggest: { showWords: false },
      }) as unknown as MonacoEditor;
      this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => this.grade(this.kind === 'debug' ? 'submit' : 'run'));
      this.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Enter, () => this.grade('submit'));
      this.editor.onDidChangeCursorPosition((e) => {
        this.root.querySelector('.ide-pos')!.textContent = `Ln ${e.position.lineNumber}, Col ${e.position.column}`;
      });
      this.editor.onDidChangeModelContent(() => this.dirty(true));
      if (this.kind === 'debug' && this.bugLines.length) {
        const first = Math.min(...this.bugLines), last = Math.max(...this.bugLines);
        this.editor.deltaDecorations([], [
          { range: new monaco.Range(first, 1, last, 1), options: { isWholeLine: true, className: 'cs-bugline', glyphMarginClassName: 'cs-bugglyph' } },
        ]);
        const ed = this.editor;
        const lineHeight = monaco.editor.EditorOption.lineHeight;
        this.coilSnake(
          holder,
          first,
          last,
          () => {
            const lh = ed.getOption(lineHeight);
            const info = ed.getLayoutInfo();
            return { top: ed.getTopForLineNumber(first) - ed.getScrollTop() - 7, h: (last - first + 1) * lh + 14, left: info.contentLeft - 10, w: Math.min(info.contentWidth - 20, 560) };
          },
          (place) => {
            ed.onDidScrollChange(place);
            ed.onDidLayoutChange(place);
          },
        );
      }
      this.editor.focus();
    } catch {
      window.clearTimeout(t);
      useTextarea();
    }
  }

  /**
   * The snake from Snake Debug slithers into the console and circles the lines that hold the bug:
   * an SVG body running around a rounded box over those lines, with the 🐍 head following the same path.
   */
  private coilSnake(
    holder: HTMLElement,
    first: number,
    last: number,
    measure: () => { top: number; h: number; left: number; w: number },
    subscribe: (place: () => void) => void,
  ) {
    const layer = document.createElement('div');
    layer.className = 'cs-snake';
    holder.appendChild(layer);
    const place = () => {
      const { top, h, left, w } = measure();
      const r = 14;
      const d = `M ${r} 0 H ${w - r} Q ${w} 0 ${w} ${r} V ${h - r} Q ${w} ${h} ${w - r} ${h} H ${r} Q 0 ${h} 0 ${h - r} V ${r} Q 0 0 ${r} 0 Z`;
      layer.style.cssText = `left:${left}px;top:${top}px;width:${w}px;height:${h}px`;
      layer.innerHTML = `
        <svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" overflow="visible">
          <path d="${d}" class="cs-snake-track"/>
          <path d="${d}" class="cs-snake-body" pathLength="100"/>
        </svg>
        <span class="cs-snake-head" style="offset-path:path('${d}')">🐍</span>
        <span class="cs-snake-tag">🐍 The bug is hiding in ${first === last ? `line ${first}` : `lines ${first}–${last}`}</span>`;
    };
    place();
    subscribe(place);
  }

  private dirty(on: boolean) {
    const d = this.root.querySelector<HTMLElement>('.ide-dirty');
    if (d) d.hidden = !on;
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
    this.dirty(false);
  }

  // ---------------------------------------------------------------- judging

  private async grade(mode: Mode) {
    if (this.busy) return;
    this.busy = true;
    this.save();
    this.flashState(mode === 'submit' ? '⟳ Judging all tests…' : mode === 'custom' ? '⟳ Running your input…' : '⟳ Running examples…', 'busy');
    this.tab('bottom', 'result');
    const pane = this.root.querySelector<HTMLElement>('[data-pane="result"]')!;
    pane.innerHTML = `<div class="ide-empty"><span class="cs-spin"></span> ${mode === 'submit' ? 'Judging' : 'Running'} on the ProofArena sandbox…</div>`;
    this.root.querySelectorAll<HTMLButtonElement>('.ide-btn').forEach((b) => (b.disabled = true));
    const t0 = performance.now();
    try {
      const payload: Record<string, unknown> = { code: this.code(), mode };
      if (mode === 'custom') payload.args = this.root.querySelector<HTMLTextAreaElement>('.cs-args')!.value;
      const r = await play<CodeResult & { passed: boolean }>(this.kind, payload);
      await this.render(r, mode, Math.round(performance.now() - t0));
    } catch (err) {
      pane.innerHTML = `<div class="ide-verdict bad"><strong>Request failed</strong><span>${esc((err as Error).message)}</span></div>`;
      this.flashState('✖ ' + (err as Error).message, 'bad');
    } finally {
      this.busy = false;
      this.root.querySelectorAll<HTMLButtonElement>('.ide-btn').forEach((b) => (b.disabled = false));
    }
  }

  private renderConsole(logs: string[] | undefined) {
    const pre = this.root.querySelector<HTMLElement>('.ide-console')!;
    pre.textContent = logs?.length ? logs.join('\n') : '// no console output';
    this.root.querySelector('[data-tab="console"]')!.classList.toggle('has', !!logs?.length);
  }

  private verdict(r: CodeResult & { passed: boolean }, rows: Row[]) {
    if (r.error) {
      if (/did not load|Could not find the function/.test(r.error)) return { text: 'Compile Error', cls: 'bad' };
      if (/longer than|Time limit/i.test(r.error)) return { text: 'Time Limit Exceeded', cls: 'bad' };
      if (/memory/i.test(r.error)) return { text: 'Memory Limit Exceeded', cls: 'bad' };
      return { text: 'Runtime Error', cls: 'bad' };
    }
    if (rows.length && rows.every((x) => x.ok)) return { text: 'Accepted', cls: 'good' };
    if (rows.some((x) => /Time limit/i.test(x.error || ''))) return { text: 'Time Limit Exceeded', cls: 'bad' };
    if (rows.some((x) => /Threw an error/.test(x.error || ''))) return { text: 'Runtime Error', cls: 'bad' };
    return { text: 'Wrong Answer', cls: 'bad' };
  }

  private async render(r: CodeResult & { passed: boolean }, mode: Mode, ms: number) {
    const pane = this.root.querySelector<HTMLElement>('[data-pane="result"]')!;
    this.renderConsole(r.logs);
    const rows = r.results || [];
    if (mode === 'custom') {
      const x = rows[0];
      const ok = !!x?.ok;
      pane.innerHTML = r.error
        ? `<div class="ide-verdict bad"><strong>${this.verdict(r, rows).text}</strong><span>${esc(r.error)}</span></div>`
        : `<div class="ide-verdict ${ok ? 'good' : 'bad'}"><strong>${ok ? 'Matches expected' : x?.error ? esc(x.error) : 'Different from expected'}</strong><span>Custom input · ${ms} ms</span></div>
           ${x ? this.detail(x) : ''}`;
      this.flashState(ok ? '✓ Custom run matches' : '✖ Custom run differs', ok ? 'good' : 'bad');
      return;
    }
    const v = this.verdict(r, rows);
    const passCount = rows.filter((x) => x.ok).length;
    if (r.error) {
      pane.innerHTML = `<div class="ide-verdict bad"><strong>${v.text}</strong><span>${ms} ms</span></div><pre class="ide-err">${esc(r.error)}</pre>`;
      this.flashState(`✖ ${v.text}`, 'bad');
      return;
    }
    // Mark the visible test chips and show the first failing case (or the first one).
    const firstBad = rows.findIndex((x) => !x.ok && !x.hidden);
    let hiddenNo = 0;
    const chips = rows
      .map((x, i) => {
        if (x.hidden) {
          hiddenNo++;
          return `<button class="chip-case ${x.ok ? 'ok' : 'bad'} locked" data-row="${i}" title="Hidden test: its input stays secret">🔒 ${x.ok ? '✓' : '✗'} Hidden ${hiddenNo}</button>`;
        }
        return `<button class="chip-case ${x.ok ? 'ok' : 'bad'}" data-row="${i}">${x.ok ? '✓' : '✗'} Case ${i + 1}</button>`;
      })
      .join('');
    pane.innerHTML = `
      <div class="ide-verdict ${v.cls}"><strong>${v.text}</strong><span>${passCount} / ${r.total} testcases passed · Runtime ${ms} ms</span></div>
      ${r.passed ? '' : rows.some((x) => x.hidden && !x.ok) && rows.filter((x) => !x.hidden).every((x) => x.ok) ? '<p class="cs-tip">The examples pass but a hidden test fails: think about edge cases (empty input, duplicates, negatives, capital letters…).</p>' : ''}
      <div class="ide-chips">${chips}</div>
      <div class="ide-detail"></div>`;
    const showRow = (i: number) => {
      pane.querySelectorAll<HTMLElement>('[data-row]').forEach((b) => b.classList.toggle('on', Number(b.dataset.row) === i));
      pane.querySelector<HTMLElement>('.ide-detail')!.innerHTML = rows[i] ? this.detail(rows[i]) : '';
    };
    pane.querySelector('.ide-chips')!.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-row]');
      if (b) showRow(Number(b.dataset.row));
    });
    showRow(firstBad >= 0 ? firstBad : 0);
    // Also colour the Testcase tab chips
    this.root.querySelectorAll<HTMLElement>('.case-chips [data-case]').forEach((b) => {
      const i = Number(b.dataset.case);
      if (Number.isNaN(i)) return;
      b.classList.toggle('ok', !!rows[i]?.ok);
      b.classList.toggle('bad', !!rows[i] && !rows[i].ok);
    });
    this.flashState(r.passed ? '✓ Accepted' : `✖ ${v.text} · ${passCount}/${r.total}`, r.passed ? 'good' : 'bad');

    // The game layer: squash bugs / hit the Guardian, one test at a time.
    await this.arena.play(rows, mode === 'submit' ? 'submit' : 'run');
    if (r.passed && (mode === 'submit' || this.kind === 'debug')) {
      await this.arena.victory();
      try {
        localStorage.removeItem(this.storeKey);
      } catch {
        /* storage unavailable */
      }
      this.close(false);
      this.onPassed(this.kind === 'debug' ? 'Bug fixed' : 'Problem solved');
    }
  }

  /** Input / Output / Expected for one test, LeetCode style. Hidden tests only show their status. */
  private detail(x: Row) {
    if (x.hidden) return `<div class="ide-field"><span>Hidden test</span><pre>${x.ok ? '✓ Passed' : '✗ ' + esc(x.error || 'Wrong answer')} · the input stays secret</pre></div>`;
    let args: unknown[] = [];
    try {
      args = JSON.parse(x.input || '[]');
    } catch {
      /* keep raw */
    }
    const inputs = Array.isArray(args) && args.length ? args.map((a, k) => `<div class="ide-field"><span>${esc(this.params[k] || `arg ${k + 1}`)} =</span><pre>${esc(show(a))}</pre></div>`).join('') : `<div class="ide-field"><span>Input</span><pre>${esc(x.input)}</pre></div>`;
    return `${inputs}
      <div class="ide-field ${x.ok ? 'ok' : 'bad'}"><span>Output</span><pre>${esc(x.got)}</pre></div>
      <div class="ide-field"><span>Expected</span><pre>${esc(x.expected)}</pre></div>
      ${x.error && x.error !== 'Wrong answer' ? `<div class="ide-field bad"><span>Error</span><pre>${esc(x.error)}</pre></div>` : ''}`;
  }

  close(exit: boolean) {
    this.save();
    window.clearInterval(this.timer);
    this.arena.dispose();
    this.editor?.dispose();
    this.root.classList.add('closing');
    window.setTimeout(() => this.root.remove(), 300);
    if (exit) this.onExit();
  }
}
