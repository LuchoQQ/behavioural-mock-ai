import { z } from 'zod';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import { interviewSessions, sessionQuestions, sessionResponses } from '@/db/schema';
import { env } from '@/lib/env';
import { verifyElevenLabsSignature } from '@/lib/elevenlabs-auth';
import { evaluateSession } from '@/lib/evaluator';

export const dynamic = 'force-dynamic';

const TurnSchema = z
  .object({
    role: z.string().optional(),
    message: z.string().nullable().optional(),
    time_in_call_secs: z.number().optional(),
  })
  .passthrough();

const DynamicVarsSchema = z
  .object({ session_id: z.string().uuid() })
  .passthrough();

const PayloadDataSchema = z
  .object({
    conversation_id: z.string().optional(),
    transcript: z.array(TurnSchema).optional(),
    audio_url: z.string().optional(),
  })
  .passthrough();

const EnvelopeSchema = z.union([
  PayloadDataSchema,
  z.object({ data: PayloadDataSchema }).passthrough(),
]);

type PayloadData = z.infer<typeof PayloadDataSchema> & {
  metadata?: Record<string, unknown>;
  conversation_initiation_client_data?: Record<string, unknown>;
};

function findSessionId(payload: PayloadData): string | null {
  const candidates: unknown[] = [
    (payload.metadata as { dynamic_variables?: unknown })?.dynamic_variables,
    (
      payload.metadata as {
        conversation_initiation_client_data?: { dynamic_variables?: unknown };
      }
    )?.conversation_initiation_client_data?.dynamic_variables,
    (
      payload.conversation_initiation_client_data as {
        dynamic_variables?: unknown;
      }
    )?.dynamic_variables,
  ];
  for (const c of candidates) {
    const parsed = DynamicVarsSchema.safeParse(c);
    if (parsed.success) return parsed.data.session_id;
  }
  return null;
}

function unwrap(json: unknown): PayloadData | null {
  const parsed = EnvelopeSchema.safeParse(json);
  if (!parsed.success) return null;
  const value = parsed.data as { data?: unknown };
  if (value && typeof value === 'object' && 'data' in value && value.data) {
    return value.data as PayloadData;
  }
  return parsed.data as PayloadData;
}

export async function POST(req: Request) {
  let sessionId: string | undefined;
  try {
    const { ELEVENLABS_WEBHOOK_SECRET } = env();

    const rawBody = await req.text();
    const signature = req.headers.get('elevenlabs-signature') ?? req.headers.get('ElevenLabs-Signature');
    if (!verifyElevenLabsSignature(signature, rawBody, ELEVENLABS_WEBHOOK_SECRET)) {
      console.error('[api/agent-webhook/conversation-ended] invalid signature');
      return Response.json({ error: 'invalid_signature' }, { status: 401 });
    }

    let json: unknown;
    try {
      json = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: 'invalid_json' }, { status: 400 });
    }

    const payload = unwrap(json);
    if (!payload) {
      const topLevelKeys =
        json && typeof json === 'object' ? Object.keys(json as object) : [];
      const innerKeys =
        json && typeof json === 'object' && 'data' in (json as object)
          ? Object.keys((json as { data: object }).data ?? {})
          : [];
      const debugParse = EnvelopeSchema.safeParse(json);
      console.error('[api/agent-webhook/conversation-ended] could not parse payload', {
        topLevelKeys,
        innerKeys,
        zodIssues: debugParse.success ? null : debugParse.error.issues,
        rawSnippet: rawBody.slice(0, 800),
      });
      return Response.json({ error: 'invalid_payload' }, { status: 400 });
    }

    const sid = findSessionId(payload);
    if (!sid) {
      console.error('[api/agent-webhook/conversation-ended] session_id_missing', {
        metadataKeys:
          payload.metadata && typeof payload.metadata === 'object'
            ? Object.keys(payload.metadata)
            : [],
        hasCicd: !!payload.conversation_initiation_client_data,
        rawSnippet: rawBody.slice(0, 800),
      });
      return Response.json({ error: 'session_id_missing' }, { status: 400 });
    }
    sessionId = sid;
    const turns = payload.transcript ?? [];
    const audioUrl = payload.audio_url ?? null;
    const conversationId = payload.conversation_id ?? null;

    const session = await db
      .select({
        id: interviewSessions.id,
        startedAt: interviewSessions.startedAt,
      })
      .from(interviewSessions)
      .where(eq(interviewSessions.id, sid))
      .limit(1);

    if (session.length === 0) {
      console.error('[api/agent-webhook/conversation-ended] session_not_found', { sessionId: sid });
      return Response.json({ error: 'session_not_found' }, { status: 404 });
    }

    if (conversationId) {
      await db
        .update(interviewSessions)
        .set({ elevenlabsConversationId: conversationId })
        .where(eq(interviewSessions.id, sid));
    }

    const questions = await db
      .select({
        id: sessionQuestions.id,
        order: sessionQuestions.order,
        askedAt: sessionQuestions.askedAt,
        closedAt: sessionQuestions.closedAt,
      })
      .from(sessionQuestions)
      .where(eq(sessionQuestions.sessionId, sid))
      .orderBy(asc(sessionQuestions.order));

    if (questions.length === 0) {
      return Response.json({ ok: true, note: 'no_session_questions' });
    }

    const startedAt = session[0]!.startedAt ?? questions[0]!.askedAt ?? null;
    const startMs = startedAt ? new Date(startedAt).getTime() : null;

    const userTurns = turns.filter((t) => (t.role ?? '').toLowerCase() === 'user' && t.message);

    type Bucket = { messages: string[]; firstSecs: number | null; lastSecs: number | null };
    const buckets = new Map<string, Bucket>();
    for (const q of questions) buckets.set(q.id, { messages: [], firstSecs: null, lastSecs: null });

    for (const turn of userTurns) {
      const msg = (turn.message ?? '').trim();
      if (!msg) continue;

      const secs = typeof turn.time_in_call_secs === 'number' ? turn.time_in_call_secs : null;

      let assignedQuestionId: string | null = null;
      if (startMs !== null && secs !== null) {
        const absMs = startMs + secs * 1000;
        for (const q of questions) {
          if (!q.askedAt) continue;
          const askedMs = new Date(q.askedAt).getTime();
          const closedMs = q.closedAt ? new Date(q.closedAt).getTime() : Number.POSITIVE_INFINITY;
          if (absMs >= askedMs && absMs < closedMs) {
            assignedQuestionId = q.id;
            break;
          }
        }
      }
      if (!assignedQuestionId) {
        const openQ = questions.find((q) => q.askedAt && !q.closedAt) ?? questions[questions.length - 1]!;
        assignedQuestionId = openQ.id;
      }
      const b = buckets.get(assignedQuestionId)!;
      b.messages.push(msg);
      if (secs !== null) {
        if (b.firstSecs === null || secs < b.firstSecs) b.firstSecs = secs;
        if (b.lastSecs === null || secs > b.lastSecs) b.lastSecs = secs;
      }
    }

    const existing = await db
      .select({ sessionQuestionId: sessionResponses.sessionQuestionId })
      .from(sessionResponses)
      .where(eq(sessionResponses.sessionId, sid));
    const alreadyHave = new Set(existing.map((r) => r.sessionQuestionId));

    const rowsToInsert = questions
      .filter((q) => !alreadyHave.has(q.id))
      .map((q) => {
        const b = buckets.get(q.id)!;
        const startedAtTs =
          startMs !== null && b.firstSecs !== null ? new Date(startMs + b.firstSecs * 1000) : null;
        const endedAtTs =
          startMs !== null && b.lastSecs !== null ? new Date(startMs + b.lastSecs * 1000) : null;
        return {
          sessionId: sid,
          sessionQuestionId: q.id,
          transcriptExcerpt: b.messages.join('\n').trim() || null,
          audioUrl,
          startedAt: startedAtTs,
          endedAt: endedAtTs,
        };
      });

    if (rowsToInsert.length > 0) {
      await db.insert(sessionResponses).values(rowsToInsert);
    }

    try {
      await evaluateSession(sid);
    } catch (err) {
      console.error('[api/agent-webhook/conversation-ended] eval_failed', { sessionId: sid, err });
      await db
        .update(interviewSessions)
        .set({
          evaluationStatus: 'failed',
          evaluationError: err instanceof Error ? err.message : String(err),
        })
        .where(eq(interviewSessions.id, sid));
    }

    return Response.json({ ok: true, inserted: rowsToInsert.length });
  } catch (err) {
    console.error('[api/agent-webhook/conversation-ended] failed', { sessionId, err });
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
