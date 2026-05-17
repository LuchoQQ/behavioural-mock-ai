# Milestone 2 — Automated evaluator

## Goal

After a candidate completes a mock, an async evaluator scores the
transcripts using Claude Sonnet 4.6 via the Vercel AI SDK, producing
structured output validated by Zod and persisted to the database.

## Prerequisites

Milestone 1 is complete and verified. You can complete a mock interview
and find transcripts in `session_responses`.

## Definition of done

1. The `conversation_ended` webhook (built in M1) still saves transcripts,
   and additionally enqueues an evaluation run.
2. The evaluator:
   - Loads the session's `session_responses` joined with the question
     text.
   - Builds a prompt with rubric + few-shot examples + the candidate's
     transcripts.
   - Calls `generateObject` with `claude-sonnet-4-6` and the `FinalEval`
     Zod schema (defined below).
   - Persists the validated output to `evaluations`.
   - Updates `interview_sessions.evaluationStatus` to `completed` (or
     `failed` with the error in `evaluationError`).
3. Errors are logged with full context. A failed eval does NOT corrupt
   the session — the transcripts and session row remain intact.
4. Verifiable: complete a mock, wait 30-60 seconds, check Neon — one
   row in `evaluations` with parseable `payload` matching the schema,
   `interview_sessions.evaluationStatus = 'completed'`.
5. `pnpm typecheck` and `pnpm build` pass.

## Schema additions

```typescript
// add to src/db/schema.ts
import { jsonb } from 'drizzle-orm/pg-core';

export const evaluations = pgTable('evaluations', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => interviewSessions.id),
  rubricVersion: text('rubric_version').notNull(),
  payload: jsonb('payload').notNull(),     // FinalEval type
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

And modify `interview_sessions`:
```typescript
// add columns:
evaluationStatus: text('evaluation_status').default('pending').notNull(),
  // pending | completed | failed
evaluationError: text('evaluation_error'),
```

Generate and run a Drizzle migration for these changes.

## Zod schemas

```typescript
// src/lib/schemas/evaluation.ts
import { z } from 'zod';

const StarComponent = z.enum(['missing', 'vague', 'clear']);

export const PerQuestionEval = z.object({
  question_id: z.string().uuid(),
  question_text: z.string(),
  star_completeness: z.object({
    situation: StarComponent,
    task: StarComponent,
    action: StarComponent,
    result: StarComponent,
  }),
  specificity: z.number().min(0).max(10),
  ownership: z.enum(['blamed_others', 'we_focused', 'i_focused']),
  quantified_impact: z.boolean(),
  red_flags: z.array(z.enum([
    'badmouthed_employer',
    'took_undue_credit',
    'no_self_reflection',
    'rambled_no_structure',
    'evasive_on_specifics',
  ])),
  strengths: z.array(z.string()).max(3),
  improvements: z.array(z.string()).max(3),
  question_score: z.enum(['no', 'weak_yes', 'yes', 'strong_yes']),
});
export type PerQuestionEvalT = z.infer<typeof PerQuestionEval>;

export const FinalEval = z.object({
  overall_score: z.enum(['no', 'weak_yes', 'yes', 'strong_yes']),
  ready_for_client_screening: z.boolean(),
  top_strengths: z.array(z.string()).max(3),
  top_improvements: z.array(z.string()).max(3),
  focus_areas: z.array(z.enum([
    'star_structure',
    'specificity',
    'quantifying_impact',
    'ownership_language',
    'concise_responses',
    'red_flag_avoidance',
  ])),
  per_question: z.array(PerQuestionEval),
  reviewer_notes: z.string(),
});
export type FinalEvalT = z.infer<typeof FinalEval>;

export const RUBRIC_VERSION = 'v1';
```

## Evaluator prompt structure

```typescript
// src/lib/prompts/evaluator.ts
type TranscriptInput = {
  question_id: string;
  question_text: string;
  candidate_transcript: string;
};

export function buildEvaluatorPrompt(transcripts: TranscriptInput[]): string {
  return `You are an experienced technical recruiter evaluating a candidate's
performance on a behavioral interview. Score their responses against the STAR
framework and additional criteria below.

CRITICAL: Do NOT penalize the candidate for any of the following:
- Non-native English: grammar errors, accent, word choice, or hesitation
  patterns. Many candidates are ESL.
- Speech-to-text artifacts: minor transcription errors are expected.
  Read for meaning, not literal text.
- Length: a concise, complete answer scores the same as a long one with
  the same content.

DO penalize:
- Missing STAR components (situation, task, action, result).
- Vague answers that don't have concrete details.
- "We did" framing when the question is about THEIR contribution.
- Lack of quantified impact when the situation calls for it.
- Red flag behaviors: badmouthing employers, taking undue credit,
  evading specifics when probed, no self-reflection on failures.

STAR completeness scale per component:
- "missing": the candidate did not address this component at all.
- "vague": the candidate referenced it but without concrete detail.
- "clear": the candidate provided specific, concrete information.

Specificity (0-10):
- 0-3: highly generic, could apply to any project
- 4-6: some specific details
- 7-10: rich with concrete particulars (names, numbers, dates, tools)

Question score:
- "strong_yes": exceptional answer, clear STAR, strong specificity,
  no red flags.
- "yes": solid answer, all STAR present, would pass a screening.
- "weak_yes": passable but with notable gaps.
- "no": missing critical STAR components or contains a red flag.

Overall readiness: ready_for_client_screening = true only if at least
4 of 5 questions are "yes" or better and there are no red flags.

[FEW-SHOT EXAMPLES — fill these in with real anonymized examples from
your data before running. Each example shows a question, a candidate
answer, and the expected scored output. ASK the user for these.]

NOW EVALUATE THIS CANDIDATE'S RESPONSES:

${transcripts.map(t => `
QUESTION (id: ${t.question_id}):
${t.question_text}

CANDIDATE ANSWER (full transcript):
${t.candidate_transcript}
---
`).join('\n')}

Produce a complete evaluation following the schema. Be honest and specific
in strengths/improvements/reviewer_notes — these will be shown to the
candidate and to the Silver.dev team.`;
}
```

## Evaluator implementation

```typescript
// src/lib/evaluator.ts
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { db } from '@/db/client';
import { eq } from 'drizzle-orm';
import { interviewSessions, sessionResponses, sessionQuestions, questionBank, evaluations } from '@/db/schema';
import { FinalEval, RUBRIC_VERSION } from '@/lib/schemas/evaluation';
import { buildEvaluatorPrompt } from '@/lib/prompts/evaluator';

export async function evaluateSession(sessionId: string) {
  // 1. Load transcripts joined with question text
  const rows = await db
    .select({
      question_id: questionBank.id,
      question_text: questionBank.text,
      candidate_transcript: sessionResponses.transcriptExcerpt,
    })
    .from(sessionResponses)
    .innerJoin(sessionQuestions, eq(sessionQuestions.id, sessionResponses.sessionQuestionId))
    .innerJoin(questionBank, eq(questionBank.id, sessionQuestions.questionId))
    .where(eq(sessionResponses.sessionId, sessionId));

  if (rows.length === 0) {
    throw new Error(`No responses for session ${sessionId}`);
  }

  // 2. Build prompt
  const prompt = buildEvaluatorPrompt(rows.map(r => ({
    question_id: r.question_id,
    question_text: r.question_text,
    candidate_transcript: r.candidate_transcript ?? '',
  })));

  // 3. Call Claude with structured output
  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-6'),
    schema: FinalEval,
    prompt,
    temperature: 0.3,
  });

  // 4. Persist
  await db.insert(evaluations).values({
    sessionId,
    rubricVersion: RUBRIC_VERSION,
    payload: object,
  });

  await db
    .update(interviewSessions)
    .set({ evaluationStatus: 'completed' })
    .where(eq(interviewSessions.id, sessionId));

  return object;
}
```

## Trigger from the webhook

Modify `src/app/api/agent-webhook/conversation-ended/route.ts`:

```typescript
// after saving transcripts...
try {
  await evaluateSession(sessionId);
} catch (err) {
  console.error('Evaluation failed', { sessionId, err });
  await db
    .update(interviewSessions)
    .set({
      evaluationStatus: 'failed',
      evaluationError: err instanceof Error ? err.message : String(err),
    })
    .where(eq(interviewSessions.id, sessionId));
}
return Response.json({ ok: true });
```

Inline await is fine for the MVP. If evals exceed Vercel's serverless
timeout (typically 60s on Pro), switch to fire-and-forget via a separate
internal route call.

## Few-shot examples — ASK before generating

The quality of the evaluator hinges on real few-shots. Before creating
`src/lib/prompts/evaluator.ts`, ask me to provide 2-3 anonymized
question/answer pairs with target scores. Do NOT invent example
candidates. If I don't have them ready, leave a clearly labeled `// TODO:
add few-shot examples` block and document it in the README so I add them
before the first real eval.

## Files to create / modify

- `src/lib/schemas/evaluation.ts` (new)
- `src/lib/prompts/evaluator.ts` (new — ASK FIRST for few-shots)
- `src/lib/evaluator.ts` (new)
- `src/db/schema.ts` (modify)
- migration for the schema changes
- `src/app/api/agent-webhook/conversation-ended/route.ts` (modify)
- update `README.md` and CLAUDE.md if any new env vars

## Ground rules

- Do not change anything in M1's working flow except the webhook
  handler.
- `rubricVersion` is required on every evaluation. Use `v1`.
- Do not auto-retry failed evals in this milestone. Just record the
  failure.
- Do not build any UI. M3 handles that.
- The temperature on the evaluator should be low (0.3) for consistency
  across sessions.
