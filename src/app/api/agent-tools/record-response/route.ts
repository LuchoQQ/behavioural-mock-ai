import { z } from 'zod';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '@/db/client';
import { sessionQuestions } from '@/db/schema';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
  session_id: z.string().uuid(),
  question_id: z.string().uuid().optional(),
  internal_assessment: z.string().default(''),
  follow_up_count: z.number().int().min(0).default(0),
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
    const { session_id, question_id, internal_assessment, follow_up_count } = parsed.data;
    sessionId = session_id;

    const conditions = [eq(sessionQuestions.sessionId, session_id), isNull(sessionQuestions.closedAt)];
    if (question_id) conditions.push(eq(sessionQuestions.questionId, question_id));

    const open = await db
      .select({ id: sessionQuestions.id })
      .from(sessionQuestions)
      .where(and(...conditions))
      .orderBy(desc(sessionQuestions.order))
      .limit(1);

    if (open.length === 0) {
      return Response.json({ ok: true, note: 'no_open_question' });
    }

    await db
      .update(sessionQuestions)
      .set({
        agentInternalAssessment: internal_assessment,
        followUpCount: follow_up_count,
        closedAt: new Date(),
      })
      .where(eq(sessionQuestions.id, open[0]!.id));

    return Response.json({ ok: true });
  } catch (err) {
    console.error('[api/agent-tools/record-response] failed', { sessionId, err });
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
