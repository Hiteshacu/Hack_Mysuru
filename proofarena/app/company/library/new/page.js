'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, Sparkles, PenLine, Wand2, Plus, X, RefreshCw, Send, Info, Bot, ShieldCheck } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Field, inputCls, Pill, SectionTitle, cx } from '@/components/ui';
import { api } from '@/lib/client';
import { toast } from '@/components/toast';

const SKILLS = ['Node.js', 'REST APIs', 'Validation', 'Testing', 'SQL', 'React', 'Python', 'Design for change', 'Debugging', 'Security', 'Accessibility', 'System design'];
const EXAMPLE =
  'We run a homestay booking site in Coorg. Guests book rooms for dates. Build the backend so two guests can never book the same room on the same night, guests can cancel up to 2 days before, and owners can see bookings for a month.';

export default function ChallengeBuilder() {
  const router = useRouter();
  const { refresh } = useShared();
  const [mode, setMode] = useState('write');
  const [skills, setSkills] = useState(['Node.js', 'REST APIs', 'Testing']);
  const [customSkill, setCustomSkill] = useState('');
  const [difficulty, setDifficulty] = useState('Easy');
  const [hours, setHours] = useState(4);
  const [title, setTitle] = useState('');
  const [statement, setStatement] = useState('');
  const [role, setRole] = useState('Backend Engineering Intern');
  const [theme, setTheme] = useState('');
  const [draft, setDraft] = useState(null);
  const [draftSource, setDraftSource] = useState('');
  const [aiAssist, setAiAssist] = useState('manual');
  const [busy, setBusy] = useState(null);

  const toggle = (s) => setSkills((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));
  function addSkill(e) {
    e.preventDefault();
    const s = customSkill.trim();
    if (s && !skills.includes(s)) setSkills([...skills, s]);
    setCustomSkill('');
  }

  async function build(kind) {
    setBusy(kind);
    try {
      const payload = kind === 'generate' ? { mode: 'generate', role, theme, skills, difficulty, hours } : { mode: 'refine', title, statement, skills, difficulty, hours };
      if (kind === 'manual') {
        if (!statement.trim()) {
          toast('Write a few lines about the problem first', 'error');
          return;
        }
        const r = await api('POST', '/api/ai/challenge', { ...payload, noAi: true });
        setDraft(r.challenge);
        setDraftSource('Your text, arranged into sections');
        setAiAssist('manual');
      } else {
        const r = await api('POST', '/api/ai/challenge', payload);
        setDraft(r.challenge);
        setDraftSource(r.source === 'Built-in templates' ? 'Built-in templates (no AI key)' : `Written by ${r.source}`);
        setAiAssist(kind === 'generate' ? 'generated' : 'refined');
      }
      setTimeout(() => document.getElementById('preview')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    setBusy('publish');
    try {
      const saved = await api('POST', '/api/challenges', { ...draft, aiAssist });
      toast(`"${saved.title}" is in your library`);
      await refresh();
      router.push(`/company/openings?new=1&challenge=${saved.id}`);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6 max-w-5xl">
      <Link href="/company/library" className="text-sm text-slate-500 inline-flex items-center gap-1 hover:text-ink">
        <ArrowLeft className="size-4" /> Challenge library
      </Link>
      <div>
        <div className="text-sm text-slate-500">Challenge builder</div>
        <h1 className="font-display text-3xl font-extrabold">Create a challenge</h1>
        <p className="text-slate-600 mt-1 max-w-2xl">Write your own problem and let AI tidy it up, or let AI write one from the skills you need. You can edit everything before publishing.</p>
      </div>

      <Card className="p-6 grid gap-5">
        <div className="grid grid-cols-2 gap-1 rounded-2xl bg-slate-100 p-1 max-w-lg">
          {[
            ['write', PenLine, 'Write my own'],
            ['generate', Wand2, 'Generate with AI'],
          ].map(([k, Icon, label]) => (
            <button key={k} onClick={() => setMode(k)} className={cx('rounded-xl py-2 text-sm font-semibold inline-flex items-center justify-center gap-2', mode === k ? 'bg-white shadow-sm text-ink' : 'text-slate-500')}>
              <Icon className="size-4" /> {label}
            </button>
          ))}
        </div>

        <Field label="Skills this challenge must test" hint="The AI makes sure every chosen skill appears in at least one requirement.">
          <div className="flex flex-wrap gap-2">
            {[...new Set([...SKILLS, ...skills])].map((s) => (
              <button type="button" key={s} onClick={() => toggle(s)} className={cx('rounded-full px-3 py-1 text-sm ring-1', skills.includes(s) ? 'bg-ink text-white ring-ink' : 'bg-white ring-slate-300 text-slate-600')}>
                {s}
              </button>
            ))}
            <form onSubmit={addSkill} className="inline-flex">
              <input id="custom-skill" value={customSkill} onChange={(e) => setCustomSkill(e.target.value)} placeholder="+ Add a skill" className="rounded-full px-3 py-1 text-sm ring-1 ring-dashed ring-slate-300 w-36 focus:outline-none focus:ring-brand" />
            </form>
          </div>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Difficulty">
            <div className="grid grid-cols-3 gap-1 rounded-xl bg-slate-100 p-1">
              {['Easy', 'Medium', 'Hard'].map((d) => (
                <button key={d} type="button" onClick={() => setDifficulty(d)} className={cx('rounded-lg py-1.5 text-sm font-semibold', difficulty === d ? 'bg-white shadow-sm' : 'text-slate-500')}>
                  {d}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Time budget for students">
            <select id="ch-hours" className={inputCls} value={hours} onChange={(e) => setHours(Number(e.target.value))}>
              {[2, 3, 4, 6, 8].map((h) => (
                <option key={h} value={h}>About {h} hours</option>
              ))}
            </select>
          </Field>
        </div>

        {mode === 'write' ? (
          <div className="grid gap-4">
            <Field label="Title">
              <input id="ch-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Coorg Homestay Booking" />
            </Field>
            <Field label="Problem statement" hint="Rough notes are fine. Describe the product, the users and the rules that matter.">
              <textarea id="ch-statement" rows={6} className={inputCls} value={statement} onChange={(e) => setStatement(e.target.value)} placeholder={EXAMPLE} />
              <button type="button" onClick={() => { setTitle(title || 'Coorg Homestay Booking'); setStatement(EXAMPLE); }} className="text-left text-xs font-semibold text-brand">
                Use the example text
              </button>
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button icon={Sparkles} loading={busy === 'refine'} onClick={() => build('refine')} disabled={!statement.trim()}>
                Refine with AI
              </Button>
              <Button variant="outline" loading={busy === 'manual'} onClick={() => build('manual')} disabled={!statement.trim()}>
                Use my text as is
              </Button>
            </div>
            <p className="text-xs text-slate-500 -mt-2">Refine keeps your idea but fixes wording, adds edge cases and aligns every requirement to the skills you picked.</p>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Role you're hiring for">
                <input id="ch-role" className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} />
              </Field>
              <Field label="Theme or domain (optional)">
                <input id="ch-theme" className={inputCls} value={theme} onChange={(e) => setTheme(e.target.value)} placeholder="Mysuru tourism, city buses, silk weavers…" />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button icon={Wand2} loading={busy === 'generate'} onClick={() => build('generate')}>
                {draft && aiAssist === 'generated' ? 'Generate another' : 'Generate problem statement'}
              </Button>
            </div>
          </div>
        )}
      </Card>

      {draft && <Preview draft={draft} setDraft={setDraft} source={draftSource} onPublish={publish} publishing={busy === 'publish'} onRegenerate={() => build(mode === 'generate' ? 'generate' : 'refine')} regenerating={busy === 'generate' || busy === 'refine'} />}

      <Card className="p-5 flex gap-3 text-sm bg-slate-50">
        <Info className="size-5 text-indigo-600 shrink-0" />
        <div className="grid gap-1">
          <b>How your challenge is checked</b>
          <span className="text-slate-600">
            Your challenge runs on the <b>review track</b>: the student&apos;s own tests, a mutation probe (a planted bug to test their tests), a README-vs-code check, an AI review that your engineer confirms, and a viva generated from their code.
            Challenges marked <Pill color="green" icon={ShieldCheck}>Verified</Pill> like Palace Pass also have hidden tests and the full Live Round game; ProofArena adds those after checking a challenge.
          </span>
        </div>
      </Card>
    </div>
  );
}

function ListEditor({ label, items, onChange, placeholder }) {
  return (
    <Field label={label}>
      <div className="grid gap-2">
        {items.map((item, i) => (
          <div key={i} className="flex gap-2">
            <span className="mt-2 text-xs font-bold text-slate-400 tabular w-5 text-right">{i + 1}.</span>
            <textarea
              rows={1}
              className={cx(inputCls, 'resize-y min-h-10')}
              value={item}
              onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
              aria-label={`${label} ${i + 1}`}
            />
            <button type="button" onClick={() => onChange(items.filter((_, j) => j !== i))} className="p-2 rounded-lg hover:bg-rose-50 text-slate-400 hover:text-rose-600" aria-label="Remove">
              <X className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => onChange([...items, ''])} className="text-left text-xs font-semibold text-brand inline-flex items-center gap-1 ml-7">
          <Plus className="size-3.5" /> {placeholder}
        </button>
      </div>
    </Field>
  );
}

function Preview({ draft, setDraft, source, onPublish, publishing, onRegenerate, regenerating }) {
  const set = (k) => (v) => setDraft({ ...draft, [k]: v });
  return (
    <Card id="preview" className="p-6 grid gap-5 ring-2 ring-indigo-200 scroll-mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle eyebrow="Preview & edit" title="This is what students will see" />
        <div className="flex items-center gap-2">
          <Pill color="violet" icon={Bot}>{source}</Pill>
          <Button size="sm" variant="ghost" icon={RefreshCw} loading={regenerating} onClick={onRegenerate}>Try again</Button>
        </div>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Title">
          <input id="pv-title" className={inputCls} value={draft.title} onChange={(e) => set('title')(e.target.value)} />
        </Field>
        <Field label="One-line tagline">
          <input id="pv-tagline" className={inputCls} value={draft.tagline} onChange={(e) => set('tagline')(e.target.value)} />
        </Field>
      </div>
      <Field label="Problem statement">
        <textarea id="pv-summary" rows={4} className={inputCls} value={draft.summary} onChange={(e) => set('summary')(e.target.value)} />
      </Field>
      <ListEditor label="Requirements (what to build)" items={draft.requirements} onChange={set('requirements')} placeholder="Add a requirement" />
      <div className="grid gap-4 md:grid-cols-2">
        <ListEditor label="In scope" items={draft.scope?.in || []} onChange={(v) => setDraft({ ...draft, scope: { ...draft.scope, in: v } })} placeholder="Add in-scope item" />
        <ListEditor label="Out of scope" items={draft.scope?.out || []} onChange={(v) => setDraft({ ...draft, scope: { ...draft.scope, out: v } })} placeholder="Add out-of-scope item" />
      </div>
      <ListEditor label="Deliverables" items={draft.deliverables || []} onChange={set('deliverables')} placeholder="Add a deliverable" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-semibold">Skills:</span>
        {draft.skills.map((s) => (
          <Pill key={s} color="indigo">{s}</Pill>
        ))}
        <span className="text-slate-400">·</span>
        <Pill color="amber">{draft.difficulty}</Pill>
        <Pill>About {draft.estimatedHours} h</Pill>
      </div>
      <div className="flex justify-end">
        <Button size="lg" icon={Send} loading={publishing} onClick={onPublish}>
          Publish to my library
        </Button>
      </div>
    </Card>
  );
}
