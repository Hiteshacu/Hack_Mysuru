'use client';

import { useState } from 'react';
import { Building2, Wand2 } from 'lucide-react';
import { Logo } from '@/components/brand';
import { Button, Card, Field, inputCls, CompanyLogo } from '@/components/ui';
import { api } from '@/lib/client';
import { useShared } from '@/components/state-context';
import { toast } from '@/components/toast';

const COLORS = ['#4338CA', '#0E7C66', '#B91C1C', '#C2410C', '#7C3AED', '#0F172A'];
const SAMPLE = {
  name: 'Kaveri Softworks',
  city: 'Mysuru',
  industry: 'SaaS',
  size: '51–200',
  website: 'kaverisoftworks.example',
  about: 'We build booking and payments software for tourism in Karnataka.',
  color: '#4338CA',
  hrName: 'Priya Nair',
  hrRole: 'Talent Acquisition Lead',
  hrEmail: 'priya.nair@kaverisoftworks.example',
  hrLinkedin: '',
  team: 'Sneha Kulkarni · Engineering Manager\nVikram Joshi · Tech Lead, Payments',
};

export default function Onboarding() {
  const { refresh } = useShared();
  const [form, setForm] = useState({ name: '', city: '', industry: '', size: '1–50', website: '', about: '', color: COLORS[0], hrName: '', hrRole: '' });
  const [saving, setSaving] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function submit(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api('POST', '/api/company', form);
      toast(`Welcome to ProofArena, ${form.name}!`);
      await refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex-1 arch-bg">
      <div className="mx-auto max-w-5xl px-5 py-8 grid gap-8">
        <Logo />
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_1.2fr] items-start">
          <div className="grid gap-4 lg:pt-8">
            <div className="grid place-items-center size-12 rounded-2xl bg-ink text-white">
              <Building2 className="size-6" />
            </div>
            <h1 className="font-display text-4xl font-extrabold">Set up your company</h1>
            <p className="text-slate-600">
              Students see this profile when you invite them. It takes a minute. After this you&apos;ll post an opening and pick a challenge from the library.
            </p>
            <Card className="p-4 flex items-center gap-3">
              <CompanyLogo company={form.name ? form : { name: 'Your Co', color: form.color }} size={48} />
              <div>
                <div className="font-semibold">{form.name || 'Your company name'}</div>
                <div className="text-sm text-slate-500">{[form.city || 'City', form.industry || 'Industry'].join(' · ')}</div>
              </div>
            </Card>
          </div>

          <Card className="p-6">
            <form onSubmit={submit} className="grid gap-4">
              <div className="flex justify-between items-center">
                <div className="font-display text-lg font-bold">Company details</div>
                <button type="button" onClick={() => setForm(SAMPLE)} className="text-xs font-semibold text-brand inline-flex items-center gap-1 hover:underline">
                  <Wand2 className="size-3.5" /> Fill sample details
                </button>
              </div>
              <Field label="Company name">
                <input id="co-name" className={inputCls} value={form.name} onChange={set('name')} placeholder="Kaveri Softworks" required />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="City">
                  <input id="co-city" className={inputCls} value={form.city} onChange={set('city')} placeholder="Mysuru" required />
                </Field>
                <Field label="Industry">
                  <select id="co-industry" className={inputCls} value={form.industry} onChange={set('industry')} required>
                    <option value="">Choose…</option>
                    {['SaaS', 'Fintech', 'E-commerce', 'Cloud & DevOps', 'EdTech', 'IT Services', 'Travel & Tourism'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Field label="Team size">
                  <select id="co-size" className={inputCls} value={form.size} onChange={set('size')}>
                    {['1–50', '51–200', '201–1000', '1000+'].map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Website">
                  <input id="co-web" className={inputCls} value={form.website} onChange={set('website')} placeholder="yourcompany.com" />
                </Field>
              </div>
              <Field label="About" hint="One or two lines students will read.">
                <textarea id="co-about" rows={3} className={inputCls} value={form.about} onChange={set('about')} placeholder="What does your team build?" />
              </Field>
              <div className="grid grid-cols-2 gap-4">
                <Field label="HR contact name" hint="Top 3 students can request an intro with this person.">
                  <input id="co-hr-name" className={inputCls} value={form.hrName} onChange={set('hrName')} placeholder="Priya Nair" />
                </Field>
                <Field label="HR contact role">
                  <input id="co-hr-role" className={inputCls} value={form.hrRole} onChange={set('hrRole')} placeholder="Talent Acquisition Lead" />
                </Field>
              </div>
              <Field label="HR email" hint="Shown to students who finish your 3D Quest, in the Community Camp.">
                <input id="co-hr-email" type="email" className={inputCls} value={form.hrEmail || ''} onChange={set('hrEmail')} placeholder="hr@yourcompany.com" />
              </Field>
              <Field label="HR LinkedIn (optional)" hint="Students who defeat an outpost in the 3D Quest battle unlock this profile.">
                <input id="co-hr-linkedin" type="url" className={inputCls} value={form.hrLinkedin || ''} onChange={set('hrLinkedin')} placeholder="https://www.linkedin.com/in/your-hr" />
              </Field>
              <Field label="Hiring team (optional)" hint="One person per line: Name · Role · LinkedIn URL. Each one becomes an unlockable profile card in the 3D Quest battle.">
                <textarea id="co-team" rows={3} className={inputCls} value={form.team || ''} onChange={set('team')} placeholder={'Sneha Kulkarni · Engineering Manager · https://www.linkedin.com/in/...\nVikram Joshi · Tech Lead'} />
              </Field>
              <Field label="Brand colour">
                <div className="flex gap-2">
                  {COLORS.map((c) => (
                    <button
                      type="button"
                      key={c}
                      aria-label={`Colour ${c}`}
                      onClick={() => setForm({ ...form, color: c })}
                      className={`size-8 rounded-full ring-offset-2 ${form.color === c ? 'ring-2 ring-ink' : ''}`}
                      style={{ background: c }}
                    />
                  ))}
                </div>
              </Field>
              <Button type="submit" size="lg" loading={saving}>
                Create company
              </Button>
            </form>
          </Card>
        </div>
      </div>
    </div>
  );
}
