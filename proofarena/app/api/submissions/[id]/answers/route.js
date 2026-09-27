import { syncDb } from '@/lib/db';
import { liveRoundAnswers } from '@/lib/liveAnswers';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// GET → the Live Round answer key for this submission (what to paste in each mission), as a text file.
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    await syncDb();
    const { text, filename } = await liveRoundAnswers(id);
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
