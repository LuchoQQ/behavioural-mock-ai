# Silver Mock Interview

AI-powered behavioral interview practice for Silver.dev candidates. A
candidate clicks a link, completes a ~20–25 minute voice mock interview
with an AI interviewer, and (in later milestones) an automated evaluator
scores their performance against a STAR-based rubric.

This repository implements **Milestone 1** (conversational pipeline +
transcript capture) and **Milestone 2** (automated evaluator). See
`milestone-1-conversation.md`, `milestone-2-evaluation.md`, and
`CLAUDE.md` for project conventions.

## Stack

- **Framework**: Next.js 15 (App Router, TypeScript strict)
- **Database**: Neon (serverless Postgres) + Drizzle ORM
- **Voice agent**: ElevenLabs Agents (`@elevenlabs/react` widget)
- **AI** (M2+): Vercel AI SDK with `@ai-sdk/anthropic`
- **Validation**: Zod
- **Styling**: Tailwind v4

## Quickstart

```bash
pnpm install
cp .env.example .env             # fill in values — see "Environment" below
pnpm db:push                     # create tables in Neon
pnpm db:seed                     # insert the 5 seed questions
pnpm dev                         # http://localhost:3000
```

Open <http://localhost:3000> and click **Start a mock interview**.

To wire up the actual voice flow, follow
[`docs/elevenlabs-setup.md`](./docs/elevenlabs-setup.md) — you have to
configure the ElevenLabs agent in their dashboard and point the tool /
post-call webhooks at this app's URL (use `ngrok http 3000` for local
testing).

## Scripts

| Script                | What it does                                       |
|-----------------------|----------------------------------------------------|
| `pnpm dev`            | Run Next.js dev server on port 3000                |
| `pnpm build`          | Production build                                   |
| `pnpm start`          | Run the production build                           |
| `pnpm typecheck`      | `tsc --noEmit`                                     |
| `pnpm lint`           | `next lint`                                        |
| `pnpm db:generate`    | Generate a new Drizzle migration                   |
| `pnpm db:push`        | Push the current schema to Neon                    |
| `pnpm db:seed`        | Insert the 5 question-bank rows (idempotent)       |

## Environment

All values are validated at first request via `src/lib/env.ts` (Zod).
Build does not require them; runtime does.

| Variable                    | Required | Purpose                                                |
|-----------------------------|----------|--------------------------------------------------------|
| `DATABASE_URL`              | ✅       | Neon Postgres connection string                        |
| `ANTHROPIC_API_KEY`         | ✅       | Used by the evaluator (M2) and the ElevenLabs agent    |
| `ELEVENLABS_AGENT_ID`       | ✅       | Agent ID from the ElevenLabs dashboard                 |
| `ELEVENLABS_WEBHOOK_SECRET` | ✅       | Shared secret for verifying post-call webhook HMAC     |
| `ELEVENLABS_API_KEY`        | optional | Only needed for local agent-management scripts         |

## Project layout

```
src/
  app/
    layout.tsx
    page.tsx                                  # tiny landing
    start/page.tsx                            # creates session, redirects
    mock/[sessionId]/page.tsx                 # renders the widget
    api/
      sessions/create/route.ts                # POST → { sessionId }
      agent-tools/
        get-next-question/route.ts
        record-response/route.ts
        end-interview/route.ts
      agent-webhook/
        conversation-ended/route.ts           # HMAC-verified, writes transcripts
  components/
    InterviewWidget.tsx                       # `useConversation` from @elevenlabs/react
  db/
    schema.ts                                 # Drizzle tables
    client.ts                                 # neon-http client
    seed.ts                                   # 5 questions
  lib/
    env.ts
    elevenlabs-auth.ts                        # HMAC verification
    sessions.ts                               # createSession helper
    prompts/
      interviewer.txt                         # agent system prompt
```

## Milestone 1 acceptance flow (manual)

After running `pnpm db:push && pnpm db:seed && pnpm dev` and pointing an
ElevenLabs agent at the app per `docs/elevenlabs-setup.md`:

1. Visit `/start?name=Test Candidate`.
2. You're redirected to `/mock/<sessionId>`.
3. Click **Start interview**, allow microphone access.
4. Agent asks 5 questions, probes when answers are vague, closes politely.
5. Verify in Neon:
   - 1 `interview_sessions` row with `status = 'completed'`
   - 5 `session_questions` rows, all with `closed_at` set
   - 5 `session_responses` rows with non-empty `transcript_excerpt`

## Evaluator (Milestone 2)

After the post-call webhook saves transcripts, `evaluateSession()` runs
inline: it loads each `session_responses` row joined with its question,
builds a structured prompt, calls `claude-sonnet-4-6` via
`generateObject` from the Vercel AI SDK, validates with Zod, and writes
to the `evaluations` table. `interview_sessions.evaluation_status` is
set to `completed` or `failed`.

**Deviations from `milestone-2-evaluation.md`** (intentional, per
project owner):

- The rubric is **per-answer only** — no `overall_score` and no
  `ready_for_client_screening`. Each answer scored on a 4-tier scale:
  `strong_no | no | yes | strong_yes`.
- Each answer also has its own `red_flags` and `green_flags` (open-vocab
  `{label, description}` objects) and up to 8 `word_improvements`
  (`{original_phrase, suggested_rewording, reason}`).
- Session-level patterns are captured separately as
  `general_red_flags` / `general_green_flags`.
- The M3 admin view will need to render per-question data directly,
  rather than displaying an aggregate badge — see `milestone-3-admin.md`
  for the original M3 spec; it predates this rubric change.

**Few-shot examples**: `src/lib/prompts/evaluator.ts` contains a
clearly labeled `// TODO: add 2–3 anonymized few-shot examples` block.
The evaluator runs without them but eval quality will be limited until
real examples are pasted in. Do not invent example candidates.

## Milestones

- **M1** ✅ — conversational pipeline + transcript capture
- **M2** ✅ — automated evaluator with structured output via Claude Sonnet 4.6
- **M3** — minimal admin view for the Silver.dev team

See `milestone-3-admin.md` for the next phase.
