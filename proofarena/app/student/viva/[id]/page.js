'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Mic, Send, CheckCircle2, Bot } from 'lucide-react';
import { useShared } from '@/components/state-context';
import { Card, Button, Loading, Field, inputCls, Pill } from '@/components/ui';
import { byId } from '@/lib/selectors';
import { api } from '@/lib/client';
import { toast } from '@/components/toast';

export default function VivaPage() {
  const { id } = useParams();
  const router = useRouter();
  const { state, refresh } = useShared();
  const sub = byId(state.submissions, id);
  const [answers, setAnswers] = useState({});
  const [sending, setSending] = useState(false);
  if (!sub) return <Loading />;
  if (!sub.viva) return <Loading label="Preparing your questions…" />;
  const viva = sub.viva;
  const done = Boolean(viva.submittedAt);

  async function submit(e) {
    e.preventDefault();
    setSending(true);
    try {
      await api('POST', `/api/viva/${id}`, { action: 'answer', answers });
      toast('Viva submitted. The company will score it.');
      await refresh();
      router.push(`/student/arena/${id}`);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 grid gap-6">
      <div className="grid gap-2">
        <div className="grid place-items-center size-12 rounded-2xl bg-violet-600 text-white">
          <Mic className="size-6" />
        </div>
        <div className="text-xs font-bold uppercase tracking-[0.2em] text-violet-700">Level 4 · Final</div>
        <h1 className="font-display text-4xl font-extrabold">Viva: explain your changes</h1>
        <p className="text-slate-600">
          These questions were written from the exact code you changed in the Live Round. Answer in your own words, 2 to 4 sentences each. In a live setup this is a 10-minute call with the reviewer.
        </p>
        <Pill color="slate" icon={Bot} className="w-fit">Questions by {{ claude: 'Claude', groq: 'Groq AI' }[viva.source] || 'the question engine'}, from your diffs</Pill>
      </div>

      {done ? (
        <Card className="p-6 grid gap-4">
          <div className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 className="size-5" />Submitted</div>
          {viva.questions.map((q) => (
            <div key={q.id} className="grid gap-1 text-sm">
              <div className="font-semibold">{q.q}</div>
              <div className="text-slate-600 whitespace-pre-wrap">{viva.answers[q.id]}</div>
            </div>
          ))}
        </Card>
      ) : (
        <Card className="p-6">
          <form onSubmit={submit} className="grid gap-6">
            {viva.questions.map((q, i) => (
              <Field key={q.id} label={`${i + 1}. ${q.q}`} hint={q.about ? `About: ${q.about}` : undefined}>
                <textarea
                  id={`viva-${q.id}`}
                  rows={4}
                  className={inputCls}
                  value={answers[q.id] || ''}
                  onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  placeholder="In my change I…"
                  required
                />
              </Field>
            ))}
            <Button type="submit" size="lg" icon={Send} loading={sending}>
              Submit answers
            </Button>
          </form>
        </Card>
      )}
    </div>
  );
}
