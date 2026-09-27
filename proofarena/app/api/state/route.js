import { handle } from '@/lib/api';
import { buildState } from '@/lib/state';

export const dynamic = 'force-dynamic';

export const GET = handle(() => buildState());
