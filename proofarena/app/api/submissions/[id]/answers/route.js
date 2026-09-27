import { syncDb } from '@/lib/db';
import { liveRoundAnswers } from '@/lib/liveAnswers';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// GET → the Live Round answer key for this submission (what to paste in each mission), as a text file.
// POST { submission } does the same, with the page's copy of the submission as a fallback (see liveAnswers.js).
export const GET = (request, ctx) => answers(ctx, null);
export async function POST(request, ctx) {
  const b = await request.json().catch(() => ({}));
  return answers(ctx, b.submission || null);
}

async function answers({ params }, posted) {
  try {
    const { id } = await params;
    await syncDb();
    const { text, filename } = await liveRoundAnswers(id, posted);
    return new Response(text, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    console.error('[live answers]', err);
    return Response.json({ error: err.message }, { status: 400 });
  }
}
