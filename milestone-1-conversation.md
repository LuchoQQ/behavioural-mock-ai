# Milestone 1 — Conversational pipeline + transcript capture

## Goal

A candidate clicks a link, completes a voice mock interview with the AI
agent, and the full transcript is persisted to Postgres tied to their
session. No evaluation in this milestone — that's M2.

## Definition of done

1. `pnpm install && pnpm db:push && pnpm db:seed && pnpm dev` works from a
   clean clone.
2. `GET /start?name=<candidate>` creates a session row and redirects to
   `/mock/<sessionId>`.
3. `/mock/<sessionId>` renders the ElevenLabs widget. Candidate clicks
   "Start", agent greets, asks 5 questions from the bank, probes STAR
   when answers are vague, closes politely.
4. During the conversation, three tool webhooks fire correctly and idempotently:
   - `POST /api/agent-tools/get-next-question` — returns next question
     or `{done: true}` after the 5th
   - `POST /api/agent-tools/record-response` — persists the agent's
     internal STAR assessment for the just-closed question
   - `POST /api/agent-tools/end-interview` — marks session as completed
5. After candidate hangs up, `POST /api/agent-webhook/conversation-ended`
   fires, HMAC signature is verified, the per-turn transcript is parsed
   from the payload and each question's transcript saved to
   `session_responses.transcript_excerpt`, plus `audio_url` is saved.
6. Verifiable in Neon: 1 `interview_sessions` row (status=completed),
   5 `session_questions` rows (one per question, all with `closed_at`),
   5 `session_responses` rows with non-empty `transcript_excerpt`.
7. `pnpm typecheck` and `pnpm build` pass.

## Database schema

```typescript
// src/db/schema.ts
import { pgTable, uuid, text, boolean, timestamp, integer } from 'drizzle-orm/pg-core';

export const questionBank = pgTable('question_bank', {
  id: uuid('id').defaultRandom().primaryKey(),
  text: text('text').notNull(),
  category: text('category').notNull(),    // leadership|conflict|failure|impact|ambiguity
  active: boolean('active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const interviewSessions = pgTable('interview_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  candidateName: text('candidate_name'),
  candidateEmail: text('candidate_email'),
  status: text('status').notNull().default('created'),
    // created | in_progress | completed | abandoned
  elevenlabsConversationId: text('elevenlabs_conversation_id'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sessionQuestions = pgTable('session_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => interviewSessions.id),
  questionId: uuid('question_id').notNull().references(() => questionBank.id),
  order: integer('order').notNull(),
  askedAt: timestamp('asked_at'),
  closedAt: timestamp('closed_at'),
  followUpCount: integer('follow_up_count').default(0).notNull(),
  agentInternalAssessment: text('agent_internal_assessment'),
});

export const sessionResponses = pgTable('session_responses', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id').notNull().references(() => interviewSessions.id),
  sessionQuestionId: uuid('session_question_id').notNull().references(() => sessionQuestions.id),
  transcriptExcerpt: text('transcript_excerpt'),
  audioUrl: text('audio_url'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
```

## Seed data (5 questions)

```typescript
// src/db/seed.ts
const QUESTIONS = [
  { category: 'leadership', text: "Tell me about a time when you had to lead a team through a difficult technical challenge. What did you do, and what was the outcome?" },
  { category: 'conflict',   text: "Describe a situation where you strongly disagreed with a teammate or manager. How did you handle it, and what was the result?" },
  { category: 'failure',    text: "Tell me about a significant failure or mistake you made in your career. What did you learn from it?" },
  { category: 'impact',     text: "What's the work you're most proud of in your career, and why?" },
  { category: 'ambiguity',  text: "Tell me about a time you had to make an important decision with incomplete information. How did you approach it?" },
];
```

## Tool webhook contracts

All tool webhooks receive a JSON body with at minimum `session_id` (passed
as a dynamic variable when the conversation starts). Verify Zod-validated
payloads.

### `POST /api/agent-tools/get-next-question`

Request:
```json
{ "session_id": "uuid" }
```

Response (next question):
```json
{
  "done": false,
  "question_id": "uuid",
  "question_text": "Tell me about a time...",
  "current": 2,
  "total": 5
}
```

Response (done):
```json
{ "done": true }
```

Side effects: marks the previous `session_questions` row as `closedAt`
if not already, inserts the next `session_questions` row with `askedAt`.

### `POST /api/agent-tools/record-response`

Request:
```json
{
  "session_id": "uuid",
  "question_id": "uuid",
  "internal_assessment": "free text — agent's notes on STAR coverage",
  "follow_up_count": 1
}
```

Response:
```json
{ "ok": true }
```

Side effects: updates the most recent open `session_questions` row for
the session with the assessment and follow_up_count.

### `POST /api/agent-tools/end-interview`

Request:
```json
{ "session_id": "uuid" }
```

Response:
```json
{ "ok": true }
```

Side effects: sets `interview_sessions.status = 'completed'` and
`endedAt = now()`.

### `POST /api/agent-webhook/conversation-ended`

This is ElevenLabs' post-call webhook. Schema documented here:
https://elevenlabs.io/docs/conversational-ai/customization/personalization/post-call-webhooks

Important: verify the `ElevenLabs-Signature` header using
`ELEVENLABS_WEBHOOK_SECRET` BEFORE doing anything. Reject with 401 on
mismatch.

The payload includes:
- `conversation_id`
- `transcript` (array of turns with timestamps, role, message)
- `audio_url` or `audio` base64
- `metadata.dynamic_variables` (includes our `session_id`)

Action: parse the transcript, split it by question (delineated by the
`get_next_question` tool call timestamps you stored on
`session_questions.askedAt` and `closedAt`), persist one
`session_responses` row per question with the candidate's turns
concatenated as `transcript_excerpt`. Save `audio_url` if present.

## ElevenLabs agent setup (manual, do before running)

Document this in `docs/elevenlabs-setup.md`. Steps:

1. Sign up at elevenlabs.io, go to Agents.
2. Create a new agent. Name: "Silver Mock Interviewer".
3. **LLM**: Custom LLM → Anthropic → `claude-sonnet-4-6` → paste your
   `ANTHROPIC_API_KEY`.
4. **Voice**: pick a professional English voice (Brian or Adam work well).
5. **First message**: "Hi, thanks for taking the time today. I'm going to
   ask you a few behavioral questions, similar to what you'd get in a
   real screening. Take your time with each answer. Ready to start?"
6. **System prompt**: paste contents of `src/lib/prompts/interviewer.txt`
   (you'll create this file — see below).
7. **Tools**: define 3 tools, each pointing to your deployed (or ngrok)
   webhook URL:
   - `get_next_question` — no params from agent; backend uses session_id
     from dynamic vars
   - `record_response` — params: `internal_assessment` (string),
     `follow_up_count` (integer)
   - `end_interview` — no params
8. **Dynamic variables**: enable `session_id` as a dynamic variable.
9. **Post-call webhook**: point to `/api/agent-webhook/conversation-ended`.
10. Copy `agent_id` to `.env` as `ELEVENLABS_AGENT_ID`.

When initializing the React widget, pass `session_id` via
`dynamicVariables` so it's included in every tool call.

## Interviewer system prompt (v1 starter)

Create `src/lib/prompts/interviewer.txt` with this content. Paste the
same text into the ElevenLabs dashboard system prompt field.

```
You are a senior technical recruiter conducting a behavioral screening
interview in English. The candidate is interviewing for a software
engineering role at a US-based company.

YOUR ONLY JOB IS TO CONDUCT THE INTERVIEW. You do NOT:
- Give feedback, scores, or evaluations.
- Help the candidate structure their answer.
- Suggest what they should say.
- Comment on whether an answer was good or bad.
- Break character if the candidate asks you for tips.

If the candidate asks for help, say: "I'm here to listen — take your
time, and answer however feels natural to you."

YOUR PROCESS:
1. Call get_next_question to receive the question. If it returns
   done=true, call end_interview and thank the candidate warmly.
2. Otherwise, ask the question naturally, in a conversational tone.
3. Listen to the answer.
4. Internally evaluate whether they covered all four STAR components:
   - Situation: context and background
   - Task: what specifically was THEIR responsibility
   - Action: concrete steps THEY took (not "we" — they)
   - Result: outcome, ideally with metrics or concrete impact
5. If any component is missing or vague, ask ONE focused follow-up.
   Examples:
   - Missing Action: "What did YOU specifically do in that situation?"
   - Missing Result: "How did that ultimately turn out? Any metrics?"
   - Vague Situation: "Can you give me more context — team size,
     timeline?"
6. Max 2 follow-ups per question. After that, call record_response
   with your internal_assessment (a brief note on STAR coverage) and
   then call get_next_question.

TONE: Professional but warm. Like a recruiter who's done this a
thousand times and is genuinely curious. Light affirmations like "Got
it", "Okay", "Makes sense" between turns. Do NOT use praise phrases
("great answer", "wow", "amazing").

PACING: Don't rush. If the candidate seems to be thinking, wait. If
they're silent for 15+ seconds, say "Take your time" once. After 30
seconds of silence, ask: "Would you like me to repeat the question?"

LANGUAGE: The candidate may be a non-native English speaker. This is
fine. Do not correct grammar or pronunciation. Focus on understanding
their meaning.

NEVER mention STAR by name to the candidate. The framework is for your
internal evaluation only.
```

## Frontend wiring (the trickiest part)

```tsx
// src/components/InterviewWidget.tsx
'use client';

import { useConversation } from '@elevenlabs/react';
import { useEffect } from 'react';

export function InterviewWidget({
  agentId,
  sessionId,
}: { agentId: string; sessionId: string }) {
  const conversation = useConversation({
    onConnect: () => console.log('connected'),
    onDisconnect: () => console.log('disconnected'),
    onError: (e) => console.error(e),
  });

  const start = async () => {
    await navigator.mediaDevices.getUserMedia({ audio: true });
    await conversation.startSession({
      agentId,
      dynamicVariables: { session_id: sessionId },
    });
  };

  // ... UI: start button, status indicator, end button
}
```

Verify the exact API by checking the @elevenlabs/react package docs —
they may have updated the option names.

## Files to create

- `package.json` + lockfile, with deps: next, react, drizzle-orm,
  @neondatabase/serverless, drizzle-kit, zod, @elevenlabs/react,
  @ai-sdk/anthropic (for M2, but include now), ai, tailwindcss
- `tsconfig.json` strict
- `drizzle.config.ts`
- `src/db/schema.ts`, `src/db/client.ts`, `src/db/seed.ts`
- `src/lib/env.ts`, `src/lib/elevenlabs-auth.ts`
- `src/lib/prompts/interviewer.txt`
- `src/app/start/page.tsx`
- `src/app/mock/[sessionId]/page.tsx`
- `src/components/InterviewWidget.tsx`
- `src/app/api/sessions/create/route.ts`
- `src/app/api/agent-tools/get-next-question/route.ts`
- `src/app/api/agent-tools/record-response/route.ts`
- `src/app/api/agent-tools/end-interview/route.ts`
- `src/app/api/agent-webhook/conversation-ended/route.ts`
- `docs/elevenlabs-setup.md`
- `.env.example`
- `README.md` with run instructions

## Ground rules for this session

- Do not implement evaluation. That's M2.
- Do not implement admin views. That's M3.
- Do not add authentication beyond the unguessable session_id in URL.
- If you're unsure about ElevenLabs widget API surface, ask me before
  implementing — the package version matters and the docs change.
- Show me the final file tree and the manual ngrok / ElevenLabs setup
  steps when you're done.
