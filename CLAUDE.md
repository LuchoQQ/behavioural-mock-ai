# Silver Mock Interview — CLAUDE.md

## What this is

AI-powered behavioral interview practice tool for Silver.dev candidates. A
candidate gets a link, completes a 20-25 min voice mock interview with an
AI interviewer, and an automated evaluator scores their performance against
a STAR-based rubric. Goal: reduce client-screening reject rate by training
candidates on behavioral interview skills.

## Stack (locked in — do not substitute without asking)

- **Framework**: Next.js 15 App Router, TypeScript strict
- **Database**: Postgres on Neon (serverless), Drizzle ORM
- **Voice agent**: ElevenLabs Agents (`@elevenlabs/react` for the widget)
- **AI**: Vercel AI SDK with `@ai-sdk/anthropic`
- **Validation**: Zod at every external boundary
- **Styling**: Tailwind v4
- **Deploy**: Vercel

## Architecture (one screen)

```
candidate browser
  └─ <InterviewWidget />  (ElevenLabs WebRTC)
       │
       ▼
ElevenLabs cloud (STT + LLM via BYOK + TTS + turn-taking)
  │
  ├─→ tool webhooks  ─→ /api/agent-tools/*
  └─→ post-call webhook ─→ /api/agent-webhook/conversation-ended

Next.js backend
  ├─ Drizzle writes to Neon
  └─ Evaluator (AI SDK → claude-sonnet-4-6) writes structured eval
```

The agent is configured in the ElevenLabs dashboard, not in code. The
setup steps live in `docs/elevenlabs-setup.md`. We reference it from the
code via `ELEVENLABS_AGENT_ID` env var.

## Project structure

```
src/
  app/
    start/page.tsx                          # candidate entry
    mock/[sessionId]/page.tsx               # interview UI
    admin/page.tsx                          # session list (M3)
    admin/[sessionId]/page.tsx              # session detail (M3)
    admin/login/page.tsx                    # password gate (M3)
    api/
      sessions/create/route.ts
      agent-tools/
        get-next-question/route.ts
        record-response/route.ts
        end-interview/route.ts
      agent-webhook/
        conversation-ended/route.ts
  db/
    schema.ts                               # Drizzle schema
    client.ts                               # Drizzle client (Neon)
    seed.ts                                 # question bank
  lib/
    env.ts                                  # Zod-validated env
    elevenlabs-auth.ts                      # webhook HMAC verification
    evaluator.ts                            # eval pipeline (M2)
    prompts/
      interviewer.txt                       # agent system prompt
      evaluator.ts                          # eval prompt builder (M2)
    schemas/
      evaluation.ts                         # FinalEval Zod schema (M2)
  components/
    InterviewWidget.tsx                     # client component, wraps @elevenlabs/react
  middleware.ts                             # admin auth (M3)
docs/
  elevenlabs-setup.md                       # dashboard setup steps
```

## Conventions

- Server components by default. `'use client'` only where required
  (`InterviewWidget`, admin forms).
- Every API route validates input with Zod before any side effects.
- Every ElevenLabs webhook verifies the HMAC signature before processing.
- DB access is server-only. No client-side queries.
- Env vars validated at boot via `src/lib/env.ts` (fail fast).
- Errors are logged with context (sessionId, route, payload summary).
  Never silent-catch.
- No `any`. If you need to widen a type, use `unknown` and narrow with Zod.

## Commands

```bash
pnpm install
pnpm db:generate              # generate Drizzle migrations
pnpm db:push                  # push schema to Neon
pnpm db:seed                  # seed question_bank
pnpm dev                      # http://localhost:3000
pnpm typecheck                # tsc --noEmit
pnpm lint
pnpm build
```

For local ElevenLabs webhook testing: `ngrok http 3000` and point the
agent's webhook URLs at the ngrok URL.

## Env vars (required)

```
DATABASE_URL=                     # Neon connection string
ANTHROPIC_API_KEY=                # used by the evaluator AND by the
                                  # ElevenLabs agent via BYOK
ELEVENLABS_API_KEY=               # not used by the app yet, useful for
                                  # local agent management scripts
ELEVENLABS_AGENT_ID=              # from ElevenLabs dashboard
ELEVENLABS_WEBHOOK_SECRET=        # for HMAC verification
ADMIN_PASSWORD=                   # M3 admin gate
ADMIN_COOKIE_SECRET=              # M3 signed cookie
```

## Non-goals (do NOT build)

- User authentication beyond a single env-var admin password.
- Per-question async evaluation. Final eval at end-of-session only.
- Email notifications.
- Candidate-facing report page.
- Question bank admin UI. Edit `db/seed.ts` and re-run.
- Multiple agents/voices/modes.
- Anti-cheating measures.
- Mobile-optimized admin UI.

If a feature feels out-of-scope, push back before implementing.

## Definition of done (every milestone)

- `pnpm typecheck` passes with zero errors
- `pnpm build` succeeds
- Manual end-to-end test of the milestone's user flow passes
- Manual DB inspection confirms expected rows
- README is updated if a new env var or command was added

## Anti-patterns observed in past iterations — avoid

- Tracking interview state inside the LLM. State lives in Postgres;
  the LLM calls tools.
- Skipping Zod on "internal" API calls. Tool webhooks are external.
- Hardcoded prompts inline in route handlers. Prompts live in
  `src/lib/prompts/`.
- Using `fetch` to call our own API routes from server components.
  Call the function directly.
