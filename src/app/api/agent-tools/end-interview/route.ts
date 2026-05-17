import { z } from 'zod';
import { eq, ne } from 'drizzle-orm';
import { and } from 'drizzle-orm';
import { db } from '@/db/client';
import { interviewSessions } from '@/db/schema';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  session_id: z.string().uuid(),
});

export async function POST(req: Request) {
  let sessionId: string | undefined;
  try {
    env();

    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
    }
    sessionId = parsed.data.session_id;

    await db
      .update(interviewSessions)
      .set({ status: 'completed', endedAt: new Date() })
      .where(and(eq(interviewSessions.id, sessionId), ne(interviewSessions.status, 'completed')));

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/agent-tools/end-interview] failed', { sessionId, err });
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
