import { handle, body } from '@/lib/api';
import { aiChallenge, aiProvider } from '@/lib/ai';
import { refineWithoutAi, generateWithoutAi } from '@/lib/challengeBuilder';

// mode "refine": polish the company's own statement. mode "generate": write a new one from role + skills.
// Falls back to the built-in templates when no AI key is set or the AI call fails.
export const POST = handle(async (request) => {
  const b = await body(request);
  const draft = { ...b, skills: b.skills || [], difficulty: b.difficulty || 'Easy', hours: b.hours || 4 };
  if (b.mode === 'refine' && !draft.statement?.trim()) throw new Error('Write a few lines about the problem first');
  if (!draft.skills.length) throw new Error('Pick at least one skill so the challenge can test it');

  const ai = b.noAi ? null : await aiChallenge({ mode: b.mode, draft });
  if (ai) {
    return {
      source: aiProvider().label,
      challenge: {
        title: ai.title,
        tagline: ai.tagline,
        summary: ai.summary,
        requirements: ai.requirements,
        deliverables: ai.deliverables,
        scope: { in: ai.scopeIn, out: ai.scopeOut },
        skills: [...new Set([...draft.skills, ...ai.skills.filter((s) => draft.skills.length < 6 && s.length < 24)])].slice(0, 8),
        difficulty: draft.difficulty,
        estimatedHours: Number(draft.hours) || 4,
      },
    };
  }
  const fallback = b.mode === 'refine' ? refineWithoutAi(draft) : generateWithoutAi(draft);
  return { source: 'Built-in templates', challenge: fallback };
});
