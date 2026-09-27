'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Wand2, RefreshCw, Send, ListChecks, Crosshair, Bug, Code2, Bot, CheckCircle2 } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Field, inputCls, Pill, SectionTitle, cx } from '@/components/ui';
import { api } from '@/lib/client';
import { toast } from '@/components/toast';

const SKILLS = ['Node.js', 'REST APIs', 'JavaScript', 'Testing', 'Data Structures', 'SQL', 'React', 'Python', 'Git', 'Security', 'Validation'];
const JD = 'We are hiring a Backend Engineering Intern to build booking and payment APIs for tourism in Karnataka. You will write Node.js services, design REST endpoints, write tests and fix production bugs with a senior mentor.';

export default function NewQuest() {
  const router = useRouter();
  const { refresh } = useShared();
  const [title, setTitle] = useState('Backend Engineering Intern');
  const [jd, setJd] = useState(JD);
  const [skills, setSkills] = useState(['Node.js', 'REST APIs', 'Testing', 'Data Structures']);
  const [custom, setCustom] = useState('');
  const [passMark, setPassMark] = useState(3);
  const [applyUrl, setApplyUrl] = useState('');
  const [content, setContent] = useState(null);
  const [busy, setBusy] = useState(null);

  const toggle = (s) => setSkills((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));

  async function generate() {
    setBusy('gen');
    try {
      const c = await api('POST', '/api/ai/quest', { title, jobDescription: jd, skills });
      setContent(c);
      toast('Quest generated. Review it, then publish.');
      setTimeout(() => document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth' }), 60);
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy('pub');
    try {
      const q = await api('POST', '/api/quests', { title, jobDescription: jd, skills, passMark, applyUrl, content });
      toast('Quest published! Now notify your top students.');
      await refresh();
      router.push(`/company/notify?quest=${q.id}`);
    } finally {
      setBusy(null);
    }
  }

  const setMcq = (i, patch) => setContent({ ...content, mcq: content.mcq.map((m, j) => (j === i ? { ...m, ...patch } : m)) });
  const setArrow = (i, patch) => setContent({ ...content, arrows: content.arrows.map((a, j) => (j === i ? { ...a, ...patch } : a)) });

  return (
    <div className="grid gap-6 max-w-5xl">
      <Link href="/company/quests" className="text-sm text-slate-500 inline-flex items-center gap-1 hover:text-ink">
        <ArrowLeft className="size-4" /> 3D Quests
      </Link>
      <div>
        <div className="text-sm text-slate-500">Quest builder</div>
        <h1 className="font-display text-3xl font-extrabold">Create a 3D Quest</h1>
      </div>

      <Card className="p-6 grid gap-5">
        <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
          <Field label="Role">
            <input id="q-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
          <Field label="Students need to pass the gate quiz with">
            <select id="q-pass" className={inputCls} value={passMark} onChange={(e) => setPassMark(Number(e.target.value))}>
              {[3, 4, 5].map((n) => (
                <option key={n} value={n}>{n} of 5 correct</option>
              ))}
            </select>
          </Field>
        </div>
        <Field label="Apply link (optional)" hint="Students who finish the quest see this in the Community Camp, next to your HR email.">
          <input id="q-apply" type="url" className={inputCls} placeholder="https://yourcompany.com/careers/backend-intern" value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} />
        </Field>
        <Field label="Job description" hint="The AI reads this to keep the questions relevant to the job.">
          <textarea id="q-jd" rows={4} className={inputCls} value={jd} onChange={(e) => setJd(e.target.value)} />
        </Field>
        <Field label="Skills to test">
          <div className="flex flex-wrap gap-2">
            {[...new Set([...SKILLS, ...skills])].map((s) => (
              <button key={s} type="button" onClick={() => toggle(s)} className={cx('rounded-full px-3 py-1 text-sm ring-1', skills.includes(s) ? 'bg-ink text-white ring-ink' : 'bg-white ring-slate-300 text-slate-600')}>
                {s}
              </button>
            ))}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (custom.trim() && !skills.includes(custom.trim())) setSkills([...skills, custom.trim()]);
                setCustom('');
              }}
            >
              <input id="q-skill" value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="+ Add a skill" className="rounded-full px-3 py-1 text-sm ring-1 ring-slate-300 w-36 focus:outline-none focus:ring-brand" />
            </form>
          </div>
        </Field>
        <div className="flex gap-2">
          <Button icon={content ? RefreshCw : Wand2} loading={busy === 'gen'} onClick={generate} disabled={!skills.length}>
            {content ? 'Generate again' : 'Generate quest with AI'}
          </Button>
        </div>
      </Card>

      {content && (
        <div id="preview" className="grid gap-5 scroll-mt-6">
          <Card className="p-6 grid gap-4">
            <StageHead icon={ListChecks} n={1} title="Gate Quiz · 5 MCQs (shown together in one window)" source={content.source.mcq} />
            <p className="text-sm text-slate-500 -mt-2">Click an option to mark it as the correct answer. Edit any text.</p>
            {content.mcq.map((m, i) => (
              <div key={i} className="rounded-xl bg-slate-50 p-4 grid gap-2">
                <input className={cx(inputCls, 'font-semibold')} value={m.q} onChange={(e) => setMcq(i, { q: e.target.value })} aria-label={`Question ${i + 1}`} />
                <div className="grid gap-2 sm:grid-cols-2">
                  {m.options.map((o, j) => (
                    <div key={j} className={cx('flex items-center gap-2 rounded-lg px-2 py-1 ring-1', m.answer === j ? 'ring-emerald-400 bg-emerald-50' : 'ring-slate-200 bg-white')}>
                      <button type="button" onClick={() => setMcq(i, { answer: j })} aria-label="Mark correct" className={cx('size-5 rounded-full grid place-items-center shrink-0', m.answer === j ? 'bg-emerald-500 text-white' : 'ring-1 ring-slate-300')}>
                        {m.answer === j && <CheckCircle2 className="size-4" />}
                      </button>
                      <input className="flex-1 bg-transparent text-sm focus:outline-none" value={o} onChange={(e) => setMcq(i, { options: m.options.map((x, k) => (k === j ? e.target.value : x)) })} />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </Card>

          <Card className="p-6 grid gap-4">
            <StageHead icon={Crosshair} n={2} title="Arrow Range · 5 rounds (answers painted on targets)" source={content.source.arrows} />
            <div className="grid gap-2">
              {content.arrows.map((a, i) => (
                <div key={i} className="grid gap-2 md:grid-cols-[1.3fr_2fr] items-center rounded-xl bg-slate-50 p-3">
                  <input className={inputCls} value={a.prompt} onChange={(e) => setArrow(i, { prompt: e.target.value })} aria-label={`Round ${i + 1} prompt`} />
                  <div className="flex gap-2">
                    {a.choices.map((c, j) => (
                      <button key={j} type="button" onClick={() => setArrow(i, { answer: j })} className={cx('flex-1 rounded-full px-3 py-1.5 text-sm font-semibold ring-1', a.answer === j ? 'bg-emerald-500 text-white ring-emerald-500' : 'bg-white ring-slate-300')}>
                        🎯 {c}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card className="p-6 grid gap-3 content-start">
              <StageHead icon={Bug} n={3} title={`Debug Den · ${content.debug.title}`} source={content.source.debug} />
              <p className="text-sm text-slate-600">{content.debug.story}</p>
              <pre className="rounded-xl bg-[#0f1117] text-slate-200 text-xs p-3 overflow-x-auto font-mono">{content.debug.buggyCode}</pre>
              <div className="text-xs text-slate-500">{content.debug.tests.length} tests · the reference fix passes them all, the buggy code fails at least one</div>
            </Card>
            <Card className="p-6 grid gap-3 content-start">
              <StageHead icon={Code2} n={4} title={`Algorithm Grove · ${content.dsa.title}`} source={content.source.dsa} />
              <p className="text-sm text-slate-600">{content.dsa.statement}</p>
              <pre className="rounded-xl bg-[#0f1117] text-slate-200 text-xs p-3 overflow-x-auto font-mono">{content.dsa.starterCode}</pre>
              <div className="text-xs text-slate-500">{content.dsa.examples.length} examples shown · {content.dsa.hidden.length} hidden tests</div>
            </Card>
          </div>

          <Card className="p-5 flex flex-wrap items-center justify-between gap-4 ring-2 ring-indigo-200">
            <div className="text-sm text-slate-600">After the DSA stage, finishers enter the <b>Community Camp</b>: every opening&apos;s apply link and HR email.</div>
            <Button size="lg" icon={Send} loading={busy === 'pub'} onClick={publish}>Publish quest</Button>
          </Card>
        </div>
      )}
    </div>
  );
}

function StageHead({ icon: Icon, n, title, source }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="grid place-items-center size-9 rounded-xl bg-violet-600 text-white"><Icon className="size-4" /></div>
      <SectionTitle eyebrow={`Stage ${n}`} title={title} className="flex-1" />
      <Pill color={source?.startsWith('Verified') ? 'slate' : 'violet'} icon={Bot}>{source}</Pill>
    </div>
  );
}
