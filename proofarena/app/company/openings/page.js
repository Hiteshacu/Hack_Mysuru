'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Plus, MapPin, Wallet, Users, X, Swords, Check } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Field, inputCls, Pill, Empty, SectionTitle, cx } from '@/components/ui';
import { api } from '@/lib/client';
import { candidates } from '@/lib/selectors';
import { toast } from '@/components/toast';

const SKILLS = ['Node.js', 'REST APIs', 'Validation', 'Testing', 'SQL', 'React', 'Design for change', 'Debugging'];

export default function OpeningsPage() {
  return (
    <Suspense>
      <Openings />
    </Suspense>
  );
}

function Openings() {
  const { state, refresh } = useShared();
  const params = useSearchParams();
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (params.get('new')) setOpen(true);
  }, [params]);

  const company = state.activeCompany;
  const mine = state.openings.filter((o) => o.companyId === company.id);
  const pool = candidates(state);

  return (
    <div className="grid gap-6 max-w-5xl">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="text-sm text-slate-500">Openings</div>
          <h1 className="font-display text-3xl font-extrabold">Your open roles</h1>
        </div>
        {!open && (
          <Button icon={Plus} onClick={() => setOpen(true)}>
            New opening
          </Button>
        )}
      </div>

      {open && (
        <NewOpening
          key={params.get('challenge') || 'default'}
          preselect={params.get('challenge')}
          library={state.library.filter((c) => c.status === 'live' || c.companyId === company.id)}
          onClose={() => setOpen(false)}
          onCreated={async () => {
            setOpen(false);
            await refresh();
          }}
        />
      )}

      {mine.length === 0 && !open && (
        <Card>
          <Empty icon={Plus} title="No openings yet">
            Post a role and attach a challenge. Students who already solved that challenge are instantly visible to you.
          </Empty>
        </Card>
      )}

      <div className="grid gap-4">
        {mine.map((o) => {
          const ch = state.library.find((c) => c.id === o.challengeId);
          const qualified = pool.filter((c) => c.sub.challengeId === o.challengeId && c.sub.score.total >= o.minScore).length;
          return (
            <Card key={o.id} className="p-5 grid gap-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="font-display text-xl font-bold">{o.title}</div>
                  <div className="flex flex-wrap gap-3 text-sm text-slate-500 mt-1">
                    <span className="inline-flex items-center gap-1"><MapPin className="size-4" />{o.location}</span>
                    {o.pay && <span className="inline-flex items-center gap-1"><Wallet className="size-4" />{o.pay}</span>}
                    <span className="inline-flex items-center gap-1"><Users className="size-4" />{o.seats} seat{o.seats > 1 ? 's' : ''}</span>
                  </div>
                </div>
                <Pill color="indigo">{o.type}</Pill>
              </div>
              {o.description && <p className="text-sm text-slate-600">{o.description}</p>}
              <div className="flex flex-wrap items-center gap-2">
                <Pill color="violet" icon={Swords}>Challenge: {ch?.title}</Pill>
                <Pill color="slate">Min score {o.minScore}</Pill>
                {o.skills.map((s) => (
                  <Pill key={s}>{s}</Pill>
                ))}
              </div>
              <div className="flex items-center justify-between rounded-xl bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
                <span>
                  <b>{qualified}</b> verified candidate{qualified === 1 ? '' : 's'} already meet this bar
                </span>
                <Button size="sm" variant="success" href="/company/candidates">View</Button>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

function NewOpening({ library, preselect, onClose, onCreated }) {
  const picked = library.find((c) => c.id === preselect);
  const [form, setForm] = useState({
    title: 'Backend Engineering Intern',
    type: 'Internship',
    location: 'Mysuru · On-site',
    pay: '₹25,000 / month',
    seats: 2,
    skills: picked?.status === 'custom' ? picked.skills.slice(0, 6) : ['Node.js', 'REST APIs', 'Testing'],
    challengeId: picked?.id || library[0]?.id,
    minScore: 70,
    description: 'Work on our booking APIs with a senior mentor. Real code, shipped to real users.',
    deadline: '2026-10-31',
    applyUrl: 'https://kaverisoftworks.example/careers/backend-intern',
  });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleSkill = (s) => setForm({ ...form, skills: form.skills.includes(s) ? form.skills.filter((x) => x !== s) : [...form.skills, s] });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('POST', '/api/openings', form);
      toast('Opening posted. Students can see it now.');
      onCreated();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="p-6">
      <form onSubmit={submit} className="grid gap-5">
        <div className="flex justify-between items-center">
          <SectionTitle eyebrow="New opening" title="What role are you hiring for?" />
          <button type="button" onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-slate-100">
            <X className="size-4" />
          </button>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Role title">
            <input id="op-title" className={inputCls} value={form.title} onChange={set('title')} required />
          </Field>
          <Field label="Type">
            <select id="op-type" className={inputCls} value={form.type} onChange={set('type')}>
              {['Internship', 'Full-time', 'Contract'].map((x) => (
                <option key={x}>{x}</option>
              ))}
            </select>
          </Field>
          <Field label="Location">
            <input id="op-loc" className={inputCls} value={form.location} onChange={set('location')} required />
          </Field>
          <Field label="Pay">
            <input id="op-pay" className={inputCls} value={form.pay} onChange={set('pay')} />
          </Field>
          <Field label="Seats">
            <input id="op-seats" type="number" min={1} className={inputCls} value={form.seats} onChange={set('seats')} />
          </Field>
          <Field label="Apply by">
            <input id="op-deadline" type="date" className={inputCls} value={form.deadline} onChange={set('deadline')} />
          </Field>
        </div>
        <Field label="Skills">
          <div className="flex flex-wrap gap-2">
            {[...new Set([...SKILLS, ...form.skills])].map((s) => (
              <button
                type="button"
                key={s}
                onClick={() => toggleSkill(s)}
                className={cx('rounded-full px-3 py-1 text-sm ring-1', form.skills.includes(s) ? 'bg-ink text-white ring-ink' : 'bg-white ring-slate-300 text-slate-600')}
              >
                {s}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Challenge" hint="Verified challenges include hidden tests and the full Live Round game. Your own challenges use the review track.">
          <div className="grid gap-3 md:grid-cols-3">
            {library.map((c) => {
              const active = form.challengeId === c.id;
              return (
                <button
                  type="button"
                  key={c.id}
                  onClick={() => setForm({ ...form, challengeId: c.id, skills: c.status === 'custom' ? c.skills.slice(0, 6) : form.skills })}
                  className={cx('text-left rounded-2xl p-4 ring-1 transition grid gap-1 content-start', active ? 'ring-2 ring-brand bg-brand-soft' : 'ring-slate-200 bg-white hover:ring-slate-300')}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold">{c.title}</span>
                    {active && <Check className="size-4 text-brand shrink-0" />}
                  </div>
                  <span className="text-xs text-slate-500">{c.tagline}</span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {c.status === 'live' ? <Pill color="green">Verified · full game</Pill> : <Pill color="sky">Your challenge · review track</Pill>}
                    <Pill>{c.difficulty} · ~{c.estimatedHours}h</Pill>
                  </div>
                </button>
              );
            })}
            <a href="/company/library/new" className="rounded-2xl p-4 ring-1 ring-dashed ring-slate-300 grid place-items-center text-center gap-1 text-sm text-slate-500 hover:bg-slate-50 hover:text-brand">
              <Plus className="size-5" />
              <span className="font-semibold">Create a new challenge</span>
              <span className="text-xs">Write your own or generate with AI</span>
            </a>
          </div>
        </Field>
        <Field label={`Minimum verified score: ${form.minScore}`}>
          <input id="op-min" type="range" min={40} max={95} step={5} value={form.minScore} onChange={set('minScore')} className="accent-indigo-700" />
        </Field>
        <Field label="Description">
          <textarea id="op-desc" rows={3} className={inputCls} value={form.description} onChange={set('description')} />
        </Field>
        <Field label="Application link (optional)" hint="Quest finishers see this in the Community Camp.">
          <input id="op-apply" className={inputCls} value={form.applyUrl || ''} onChange={set('applyUrl')} placeholder="https://yourcompany.com/careers/backend-intern" />
        </Field>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" loading={saving}>
            Post opening
          </Button>
        </div>
      </form>
    </Card>
  );
}
