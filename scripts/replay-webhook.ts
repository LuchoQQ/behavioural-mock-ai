import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { createHmac } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import {
  evaluations,
  interviewSessions,
  questionBank,
  sessionQuestions,
  sessionResponses,
} from '../src/db/schema';

type ToolCall = {
  tool_name?: string;
  params_as_json?: string;
};
type ToolResult = {
  tool_name?: string;
  result_value?: string;
};
type Turn = {
  role?: string;
  message?: string | null;
  time_in_call_secs?: number;
  tool_calls?: ToolCall[];
  tool_results?: ToolResult[];
};

type QuestionEvent = {
  questionId: string;
  order: number;
  askedAtSecs: number;
  closedAtSecs: number | null;
};

function extractQuestionEvents(transcript: Turn[]): QuestionEvent[] {
  const events: QuestionEvent[] = [];
  let order = 0;
  let current: QuestionEvent | null = null;

  for (const turn of transcript) {
    const secs = turn.time_in_call_secs ?? 0;

    for (const r of turn.tool_results ?? []) {
      if (r.tool_name !== 'get_next_question' || !r.result_value) continue;
      try {
        const parsed = JSON.parse(r.result_value);
        if (parsed?.done === true || !parsed?.question_id) continue;
        if (current && current.closedAtSecs === null) {
          current.closedAtSecs = secs;
        }
        order += 1;
        current = {
          questionId: String(parsed.question_id),
          order,
          askedAtSecs: secs,
          closedAtSecs: null,
        };
        events.push(current);
      } catch {
        // ignore
      }
    }

    for (const c of turn.tool_calls ?? []) {
      if (c.tool_name !== 'record_response' || !c.params_as_json) continue;
      try {
        const parsed = JSON.parse(c.params_as_json);
        const qid = parsed?.question_id ? String(parsed.question_id) : null;
        const target = qid
          ? events.find((e) => e.questionId === qid && e.closedAtSecs === null)
          : current;
        if (target) target.closedAtSecs = secs;
      } catch {
        // ignore
      }
    }
  }

  return events;
}

async function ensureSessionAndQuestions(opts: {
  sessionId: string;
  startedAt: Date;
  endedAt: Date;
  events: QuestionEvent[];
}): Promise<{ created: boolean; questionsInserted: number; missingIds: string[] }> {
  const { sessionId, startedAt, endedAt, events } = opts;

  const existing = await db
    .select({ id: interviewSessions.id })
    .from(interviewSessions)
    .where(eq(interviewSessions.id, sessionId))
    .limit(1);

  let created = false;
  if (existing.length === 0) {
    await db.insert(interviewSessions).values({
      id: sessionId,
      candidateName: 'Replayed candidate',
      candidateEmail: null,
      status: 'completed',
      startedAt,
      endedAt,
      evaluationStatus: 'pending',
    });
    created = true;
  } else {
    await db
      .update(interviewSessions)
      .set({ status: 'completed', startedAt, endedAt })
      .where(eq(interviewSessions.id, sessionId));
  }

  const bankIds = new Set(
    (await db.select({ id: questionBank.id }).from(questionBank)).map((r) => r.id),
  );
  const missingIds = events.map((e) => e.questionId).filter((id) => !bankIds.has(id));
  if (missingIds.length > 0) {
    return { created, questionsInserted: 0, missingIds };
  }

  await db.delete(sessionResponses).where(eq(sessionResponses.sessionId, sessionId));
  await db.delete(sessionQuestions).where(eq(sessionQuestions.sessionId, sessionId));
  await db.delete(evaluations).where(eq(evaluations.sessionId, sessionId));

  const startMs = startedAt.getTime();
  await db.insert(sessionQuestions).values(
    events.map((e) => ({
      sessionId,
      questionId: e.questionId,
      order: e.order,
      askedAt: new Date(startMs + e.askedAtSecs * 1000),
      closedAt:
        e.closedAtSecs !== null ? new Date(startMs + e.closedAtSecs * 1000) : null,
    })),
  );

  return { created, questionsInserted: events.length, missingIds: [] };
}

async function main() {
  const conversationId = process.argv[2];
  if (!conversationId) {
    console.error('Usage: pnpm tsx scripts/replay-webhook.ts <conversation_id> [webhookUrl]');
    process.exit(2);
  }
  const webhookUrl =
    process.argv[3] ??
    process.env.WEBHOOK_URL ??
    'http://localhost:3000/api/agent-webhook/conversation-ended';
  const apiKey = process.env.ELEVENLABS_API_KEY;
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY missing');
  if (!secret) throw new Error('ELEVENLABS_WEBHOOK_SECRET missing');

  const apiUrl = `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`;
  console.log(`[replay] fetching ${apiUrl}`);
  const apiRes = await fetch(apiUrl, { headers: { 'xi-api-key': apiKey } });
  if (!apiRes.ok) {
    throw new Error(
      `elevenlabs fetch failed ${apiRes.status}: ${(await apiRes.text()).slice(0, 400)}`,
    );
  }
  const conversation = await apiRes.json();

  const transcript: Turn[] = conversation?.transcript ?? [];
  const dynVars =
    conversation?.metadata?.dynamic_variables ??
    conversation?.conversation_initiation_client_data?.dynamic_variables ??
    null;
  const sessionId: string | undefined = dynVars?.session_id;
  if (!sessionId) throw new Error('session_id missing from dynamic_variables');

  const startUnix: number | undefined = conversation?.metadata?.start_time_unix_secs;
  const duration: number = conversation?.metadata?.call_duration_secs ?? 0;
  const startedAt = startUnix ? new Date(startUnix * 1000) : new Date();
  const endedAt = new Date(startedAt.getTime() + duration * 1000);

  console.log('[replay] conversation', {
    conversation_id: conversation?.conversation_id,
    session_id: sessionId,
    started_at: startedAt.toISOString(),
    duration_secs: duration,
    transcript_turns: transcript.length,
  });

  const events = extractQuestionEvents(transcript);
  console.log('[replay] question events', events);

  const ensured = await ensureSessionAndQuestions({
    sessionId,
    startedAt,
    endedAt,
    events,
  });
  console.log('[replay] db prepared', ensured);
  if (ensured.missingIds.length > 0) {
    console.error(
      '[replay] aborting — question_bank missing ids:',
      ensured.missingIds.join(', '),
    );
    process.exit(1);
  }

  // Inject dynamic_variables.session_id at the spot the webhook looks for it.
  const webhookPayload = {
    ...conversation,
    metadata: {
      ...(conversation.metadata ?? {}),
      dynamic_variables: { session_id: sessionId },
    },
  };
  const body = JSON.stringify(webhookPayload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');
  const header = `t=${timestamp},v0=${signature}`;

  console.log(`[replay] POST ${webhookUrl}`);
  const res = await fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'elevenlabs-signature': header,
    },
    body,
  });
  const text = await res.text();
  console.log(`[replay] ${res.status} ${res.statusText}`);
  console.log(text);
  if (!res.ok) process.exit(1);
}

main().catch((err) => {
  console.error('[replay] failed', err);
  process.exit(1);
});
