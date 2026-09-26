// Stage 1: the Gate Quiz. All five MCQs in one window on the loading screen, graded by the server.

import gsap from 'gsap';
import { esc, play, quest, refreshQuest } from './api';

interface McqResult {
  correct: number;
  total: number;
  passed: boolean;
  passMark: number;
  attempt: number;
  /** Only sent once the gate is passed: a failed attempt learns just its score, so retries can't copy answers. */
  review: { correct: boolean; answer: number; explain: string }[] | null;
}

export class McqGate {
  constructor(private host: HTMLElement, private onPass: () => void) {
    this.render();
  }

  private render() {
    const q = quest.view!.quest;
    const done = quest.view!.run && quest.view!.run.stage !== 'mcq';
    if (done) {
      this.host.innerHTML = `<div class="mcq-done"><span>✔</span><div><strong>Gate Quiz passed</strong><p>${quest.view!.run!.mcqScore ?? q.passMark}/5 correct. The gate is open.</p></div></div>`;
      this.onPass();
      return;
    }
    this.host.innerHTML = `
      <header class="mcq-head">
        <div><small>Stage 1 · Gate Quiz</small><strong>Answer ${q.mcq.length} questions</strong></div>
        <span class="mcq-need">${q.passMark}/${q.mcq.length} to enter</span>
      </header>
      <form class="mcq-form">
        ${q.mcq
          .map(
            (m, i) => `<fieldset class="mcq-q" data-q="${i}">
              <legend><b>${i + 1}</b>${esc(m.q)}</legend>
              <div class="mcq-opts">${m.options
                .map((o, j) => `<label class="mcq-opt"><input type="radio" name="q${i}" value="${j}" /><span class="mcq-letter">${'ABCD'[j]}</span><span>${esc(o)}</span></label>`)
                .join('')}</div>
              <p class="mcq-explain" hidden></p>
            </fieldset>`,
          )
          .join('')}
        <div class="mcq-actions">
          <span class="mcq-count">0/${q.mcq.length} answered</span>
          <button type="submit" class="btn btn-primary">Submit answers</button>
        </div>
      </form>`;
    const form = this.host.querySelector<HTMLFormElement>('.mcq-form')!;
    form.addEventListener('change', () => {
      const n = q.mcq.filter((_, i) => form.querySelector(`input[name="q${i}"]:checked`)).length;
      this.host.querySelector('.mcq-count')!.textContent = `${n}/${q.mcq.length} answered`;
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submit(form);
    });
    gsap.from(this.host.querySelectorAll('.mcq-q'), { y: 18, opacity: 0, stagger: 0.07, duration: 0.5, ease: 'power3.out', delay: 0.2 });
  }

  private async submit(form: HTMLFormElement) {
    const q = quest.view!.quest;
    const answers = q.mcq.map((_, i) => {
      const el = form.querySelector<HTMLInputElement>(`input[name="q${i}"]:checked`);
      return el ? Number(el.value) : -1;
    });
    if (answers.includes(-1)) {
      const first = answers.indexOf(-1);
      const fs = form.querySelector<HTMLElement>(`[data-q="${first}"]`)!;
      fs.scrollIntoView({ behavior: 'smooth', block: 'center' });
      gsap.fromTo(fs, { x: -8 }, { x: 0, duration: 0.4, ease: 'elastic.out(1, 0.3)' });
      return;
    }
    const btn = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
    btn.disabled = true;
    btn.textContent = 'Checking…';
    try {
      const r = await play<McqResult>('mcq', { answers });
      (r.review || []).forEach((rv, i) => {
        const fs = form.querySelector<HTMLElement>(`[data-q="${i}"]`)!;
        fs.classList.add(rv.correct ? 'right' : 'wrong');
        fs.querySelectorAll<HTMLLabelElement>('.mcq-opt').forEach((l, j) => l.classList.toggle('answer', j === rv.answer));
        const ex = fs.querySelector<HTMLElement>('.mcq-explain')!;
        ex.hidden = false;
        ex.textContent = `${rv.correct ? '✔ Correct.' : '✖ Not quite.'} ${rv.explain}`;
        fs.querySelectorAll('input').forEach((inp) => (inp.disabled = true));
      });
      const actions = form.querySelector<HTMLElement>('.mcq-actions')!;
      if (r.passed) {
        actions.innerHTML = `<div class="mcq-verdict pass"><strong>${r.correct}/${r.total} · The gate opens!</strong><span>Enter the 3D world to continue.</span></div>`;
        await refreshQuest();
        this.onPass();
      } else {
        actions.innerHTML = `<div class="mcq-verdict fail"><strong>${r.correct}/${r.total} · You need ${r.passMark}</strong><span>Attempt ${r.attempt}. The answers stay hidden until you pass, so think it through and try again.</span></div><button type="button" class="btn btn-primary mcq-retry">Try again</button>`;
        form.querySelectorAll('input').forEach((inp) => (inp.disabled = true));
        actions.querySelector('.mcq-retry')!.addEventListener('click', () => this.render());
      }
      gsap.fromTo(actions, { scale: 0.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.5, ease: 'back.out(2)' });
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Submit answers';
      alert((err as Error).message);
    }
  }
}
