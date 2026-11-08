import { handleInterpret } from '@/lib/ai/handlers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 180;

export function POST(req: Request): Promise<Response> {
  return handleInterpret(req);
}
