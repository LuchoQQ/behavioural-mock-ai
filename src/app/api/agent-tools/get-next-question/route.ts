import { z } from 'zod';
import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { questionBank, sessionQuestions, interviewSessions } from '@/db/schema';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

const TOTAL_QUESTIONS = 3

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

    const session = await db
      .select({ id: interviewSessions.id, status: interviewSessions.status })
      .from(interviewSessions)
      .where(eq(interviewSessions.id, sessionId))
      .limit(1);
    if (session.length === 0) {
      return Response.json({ error: 'session_not_found' }, { status: 404 });
    }

    const existing = await db
      .select({
        id: sessionQuestions.id,
        questionId: sessionQuestions.questionId,
        order: sessionQuestions.order,
        askedAt: sessionQuestions.askedAt,
        closedAt: sessionQuestions.closedAt,
      })
      .from(sessionQuestions)
      .where(eq(sessionQuestions.sessionId, sessionId))
      .orderBy(desc(sessionQuestions.order));

    const latest = existing[0];
    if (latest && latest.askedAt && !latest.closedAt) {
      const q = await db
        .select({ id: questionBank.id, text: questionBank.text })
        .from(questionBank)
        .where(eq(questionBank.id, latest.questionId))
        .limit(1);
      const text = q[0]?.text ?? '';
      return Response.json({
        done: false,
        question_id: latest.questionId,
        question_text: text,
        current: latest.order,
        total: TOTAL_QUESTIONS,
      });
    }

    const closedCount = existing.filter((r) => r.closedAt !== null).length;
    if (closedCount >= TOTAL_QUESTIONS) {
      return Response.json({ done: true });
    }

    const nextOrder = closedCount + 1;
    const bank = await db
      .select({ id: questionBank.id, text: questionBank.text })
      .from(questionBank)
      .where(eq(questionBank.active, true))
      .orderBy(asc(questionBank.createdAt), asc(questionBank.id))
      .limit(TOTAL_QUESTIONS);
    if (bank.length < nextOrder) {
      return Response.json({ done: true });
    }
    const next = bank[nextOrder - 1]!;

    // Mark session in_progress on first question, and stamp startedAt.
    if (nextOrder === 1) {
      await db
        .update(interviewSessions)
        .set({ status: 'in_progress', startedAt: new Date() })
        .where(eq(interviewSessions.id, sessionId));
    }

    await db.insert(sessionQuestions).values({
      sessionId,
      questionId: next.id,
      order: nextOrder,
      askedAt: new Date(),
    });

    return Response.json({
      done: false,
      question_id: next.id,
      question_text: next.text,
      current: nextOrder,
      total: TOTAL_QUESTIONS,
    });
  } catch (err) {
    console.error('[api/agent-tools/get-next-question] failed', { sessionId, err });
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
