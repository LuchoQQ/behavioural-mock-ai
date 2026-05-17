# Milestone 3 — Minimal admin view

## Goal

Flor and the Silver.dev team can review completed sessions, read
transcripts, and see structured evaluations in a clean web UI. Single
shared password.

## Prerequisites

Milestone 2 is complete. Sessions are being evaluated and you can find
populated `evaluations` rows in Neon.

## Definition of done

1. `/admin` redirects unauthenticated users to `/admin/login`.
2. `/admin/login` accepts a password, compares to `ADMIN_PASSWORD` env
   var, sets a signed cookie, redirects to `/admin`.
3. `/admin` shows a table of all sessions: candidate name, started_at
   (formatted), duration, status, evaluation status, overall_score
   (when available). Most recent first. Each row links to detail.
4. `/admin/<sessionId>` shows:
   - Header: candidate name, session ID, dates, duration
   - "Transcript" section: per-question, the question text + the
     candidate's full answer transcript, readable formatting
   - "Evaluation" section: overall_score, ready_for_screening
     (yes/no badge), top_strengths/improvements/focus_areas, then
     per-question breakdown with STAR coverage indicators (green/
     yellow/red dots) and red flags as tags
5. Logout link clears the cookie.
6. Renders fine on desktop. Mobile is nice-to-have.
7. `pnpm typecheck` and `pnpm build` pass.

## Auth implementation

Use `iron-session` or a hand-rolled signed cookie with
`ADMIN_COOKIE_SECRET` env var. No user records, no DB writes for auth.

```typescript
// src/lib/admin-auth.ts
// helpers: setAdminCookie(response), clearAdminCookie(response),
//          isAdminCookieValid(request)
// Use HMAC-SHA256 of a constant payload (e.g. "admin:v1") signed with
// ADMIN_COOKIE_SECRET. Store the HMAC in a httpOnly, secure cookie.
```

```typescript
// src/middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isAdminCookieValid } from '@/lib/admin-auth';

export function middleware(req: NextRequest) {
  if (req.nextUrl.pathname.startsWith('/admin') &&
      req.nextUrl.pathname !== '/admin/login') {
    if (!isAdminCookieValid(req)) {
      return NextResponse.redirect(new URL('/admin/login', req.url));
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
```

## UI layout

### `/admin` (list)

```
┌─ Silver Mock Interview · Admin ─────────── [Logout] ─┐
│                                                       │
│ ┌──────────────────────────────────────────────────┐  │
│ │ Candidate    Date           Status      Score    │  │
│ ├──────────────────────────────────────────────────┤  │
│ │ Luciano P.   2026-05-14    completed   strong_yes│  │
│ │ Maria G.     2026-05-14    completed   weak_yes  │  │
│ │ Juan S.      2026-05-13    failed      —         │  │
│ └──────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────┘
```

### `/admin/<sessionId>` (detail)

Two columns on desktop, stacked on mobile:

```
┌─ Luciano P. · 2026-05-14 14:30 · 23 min ──────────────┐
│                                                        │
│ ┌── Transcript ──────────┐ ┌── Evaluation ───────────┐ │
│ │                         │ │                         │ │
│ │ Q1 · Leadership         │ │ Overall: strong_yes     │ │
│ │ "Tell me about a..."    │ │ ✓ Ready for screening   │ │
│ │                         │ │                         │ │
│ │ Luciano:                │ │ Top strengths:          │ │
│ │ [full transcript]       │ │ • Specific examples     │ │
│ │                         │ │ • Quantified impact     │ │
│ │ Q2 · Conflict           │ │ ...                     │ │
│ │ ...                     │ │                         │ │
│ │                         │ │ Per question:           │ │
│ │                         │ │ Q1: S●T●A●R● strong_yes │ │
│ │                         │ │ Q2: S●T●A●R○ yes        │ │
│ │                         │ │   red flags: none       │ │
│ │                         │ │ ...                     │ │
│ └─────────────────────────┘ └─────────────────────────┘ │
└────────────────────────────────────────────────────────┘
```

STAR dots: green=clear, yellow=vague, red=missing.

## Styling guidance

- Tailwind v4, system font stack, plenty of whitespace.
- Avoid colored gradients, drop shadows, or visual noise. Recruiters
  read this, not designers.
- Score badges: a single colored pill per tier. `strong_yes` = green,
  `yes` = teal, `weak_yes` = amber, `no` = red.
- Red flags: small red tags with the underscore_case turned into Title
  Case ("Took Undue Credit").
- Render the payload's `reviewer_notes` as a quote block at the bottom
  of the evaluation column.
- For transcripts: 1.7 line-height, max 70ch width, separator between
  questions.

## Server components everywhere possible

The list and detail pages are pure reads. No client interactivity
except the logout button (which is a form posting to a server action).

## Files to create

- `src/middleware.ts`
- `src/lib/admin-auth.ts`
- `src/app/admin/login/page.tsx`
- `src/app/admin/login/actions.ts` (server action for password check)
- `src/app/admin/page.tsx` (list)
- `src/app/admin/[sessionId]/page.tsx` (detail)
- `src/app/admin/logout/route.ts` or server action
- Small UI components if useful: `src/components/admin/StarDots.tsx`,
  `src/components/admin/ScoreBadge.tsx`, `src/components/admin/RedFlagTag.tsx`

## Ground rules

- One password, in env, hashed comparison with `crypto.timingSafeEqual`.
- No DB tables for users or sessions.
- No exports (PDF, CSV) in this milestone.
- No search or filtering. The dataset is small.
- Show me the final admin URL flow and a screenshot when done.

## Verification flow

1. Visit `/admin` while logged out → redirected to `/admin/login`.
2. Enter wrong password → error message, no cookie set.
3. Enter correct password → cookie set, redirected to `/admin`.
4. Logged in, see at least one session in the list.
5. Click a session → see transcripts and evaluation rendered cleanly.
6. Click logout → cookie cleared, redirected to login.
