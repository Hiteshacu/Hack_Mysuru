import { handle } from '@/lib/api';
import { resetDb } from '@/lib/db';

export const POST = handle(() => {
  resetDb();
  return { ok: true };
});
