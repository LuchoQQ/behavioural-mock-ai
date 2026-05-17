import { asc, desc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  evaluations,
  interviewSessions,
  sessionQuestions,
  sessionResponses,
} from '@/db/schema';
import { FinalEval, RUBRIC_VERSION, type FinalEvalT } from '@/lib/schemas/evaluation';

export type CreateSessionInput = {
  candidateName?: string | null;
  candidateEmail?: string | null;
};

export async function createSession(input: CreateSessionInput): Promise<{ id: string }> {
  const [row] = await db
    .insert(interviewSessions)
    .values({
      candidateName: input.candidateName ?? null,
      candidateEmail: input.candidateEmail ?? null,
      status: 'created',
    })
    .returning({ id: interviewSessions.id });

  if (!row) throw new Error('Failed to create interview session');
  return { id: row.id };
}

export type SessionListItem = {
  id: string;
  candidateName: string | null;
  candidateEmail: string | null;
  status: string;
  evaluationStatus: string;
  createdAt: string;
  endedAt: string | null;
  hasEvaluation: boolean;
};

export async function listSessions(): Promise<SessionListItem[]> {
  const rows = await db
    .select({
      id: interviewSessions.id,
      candidateName: interviewSessions.candidateName,
      candidateEmail: interviewSessions.candidateEmail,
      status: interviewSessions.status,
      evaluationStatus: interviewSessions.evaluationStatus,
      createdAt: interviewSessions.createdAt,
      endedAt: interviewSessions.endedAt,
      evaluationId: evaluations.id,
    })
    .from(interviewSessions)
    .leftJoin(evaluations, eq(evaluations.sessionId, interviewSessions.id))
    .orderBy(desc(interviewSessions.createdAt));

  return rows.map((r) => ({
    id: r.id,
    candidateName: r.candidateName,
    candidateEmail: r.candidateEmail,
    status: r.status,
    evaluationStatus: r.evaluationStatus,
    createdAt: r.createdAt.toISOString(),
    endedAt: r.endedAt ? r.endedAt.toISOString() : null,
    hasEvaluation: r.evaluationId !== null,
  }));
}

export type SessionWithEval = {
  id: string;
  candidateName: string | null;
  candidateEmail: string | null;
  status: string;
  evaluationStatus: string;
  evaluationError: string | null;
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
  evaluation: FinalEvalT | null;
  mockNumber: number;
  previousScores: number[];
  overallScore: number | null;
};

function averageScore(payload: FinalEvalT): number {
  const total = payload.per_question.reduce((a, q) => a + q.score, 0);
  return +(total / payload.per_question.length).toFixed(2);
}

export async function getSessionWithEvaluation(
  id: string,
): Promise<SessionWithEval | null> {
  const rows = await db
    .select({
      id: interviewSessions.id,
      candidateName: interviewSessions.candidateName,
      candidateEmail: interviewSessions.candidateEmail,
      status: interviewSessions.status,
      evaluationStatus: interviewSessions.evaluationStatus,
      evaluationError: interviewSessions.evaluationError,
      startedAt: interviewSessions.startedAt,
      endedAt: interviewSessions.endedAt,
      createdAt: interviewSessions.createdAt,
      payload: evaluations.payload,
    })
    .from(interviewSessions)
    .leftJoin(evaluations, eq(evaluations.sessionId, interviewSessions.id))
    .orderBy(asc(interviewSessions.createdAt));

  const idx = rows.findIndex((r) => r.id === id);
  if (idx === -1) return null;
  const current = rows[idx]!;

  let parsedEval: FinalEvalT | null = null;
  if (current.payload) {
    const parsed = FinalEval.safeParse(current.payload);
    if (parsed.success) parsedEval = parsed.data;
    else
      console.error('[sessions] evaluation payload failed validation', {
        id,
        issues: parsed.error.issues,
      });
  }

  const previousScores: number[] = [];
  for (let i = 0; i < idx; i++) {
    const r = rows[i]!;
    if (!r.payload) continue;
    const parsed = FinalEval.safeParse(r.payload);
    if (parsed.success) previousScores.push(averageScore(parsed.data));
  }

  return {
    id: current.id,
    candidateName: current.candidateName,
    candidateEmail: current.candidateEmail,
    status: current.status,
    evaluationStatus: current.evaluationStatus,
    evaluationError: current.evaluationError,
    startedAt: current.startedAt ? current.startedAt.toISOString() : null,
    endedAt: current.endedAt ? current.endedAt.toISOString() : null,
    createdAt: current.createdAt.toISOString(),
    evaluation: parsedEval,
    mockNumber: idx + 1,
    previousScores,
    overallScore: parsedEval ? averageScore(parsedEval) : null,
  };
}

export type SessionStatusSnapshot = {
  status: string;
  evaluationStatus: string;
  evaluationError: string | null;
  hasEvaluation: boolean;
};

export async function getSessionStatus(
  id: string,
): Promise<SessionStatusSnapshot | null> {
  const rows = await db
    .select({
      status: interviewSessions.status,
      evaluationStatus: interviewSessions.evaluationStatus,
      evaluationError: interviewSessions.evaluationError,
      evaluationId: evaluations.id,
    })
    .from(interviewSessions)
    .leftJoin(evaluations, eq(evaluations.sessionId, interviewSessions.id))
    .where(eq(interviewSessions.id, id))
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    status: row.status,
    evaluationStatus: row.evaluationStatus,
    evaluationError: row.evaluationError,
    hasEvaluation: row.evaluationId !== null,
  };
}

export async function deleteSession(id: string): Promise<void> {
  await db.delete(sessionResponses).where(eq(sessionResponses.sessionId, id));
  await db.delete(sessionQuestions).where(eq(sessionQuestions.sessionId, id));
  await db.delete(evaluations).where(eq(evaluations.sessionId, id));
  await db.delete(interviewSessions).where(eq(interviewSessions.id, id));
}

const SIMULATED_EVAL: FinalEvalT = {
  per_question: [
    {
      question_id: '00000000-0000-0000-0000-000000000001',
      question_text: 'Tell me about the hardest challenge you ever faced.',
      short_label: 'Hardest challenge',
      star_completeness: {
        situation: 'clear',
        task: 'clear',
        action: 'vague',
        result: 'clear',
      },
      score: 3,
      answer_segments: [
        { t: 'I was leading the migration of a legacy billing system to a new platform. ' },
        {
          t: 'The biggest risk was data loss during the cutover.',
          flag: 'green',
          id: 'g-clear-stakes',
        },
        { t: ' We rolled it out in stages and reconciled accounts daily, ' },
        {
          t: 'though I should have invested earlier in automated reconciliation tooling.',
          flag: 'red',
          id: 'r-late-tooling',
        },
        { t: ' Ultimately we cut over with zero customer-visible incidents.' },
      ],
      green_flags: [
        {
          id: 'g-clear-stakes',
          label: 'Articulates stakes clearly',
          note: 'Names the concrete business risk up front.',
        },
      ],
      red_flags: [
        {
          id: 'r-late-tooling',
          label: 'Late investment in tooling',
          note: 'Acknowledges tooling gap but only in hindsight.',
        },
      ],
      improvement: 'Tighten the Action section with one or two specific decisions you made.',
    },
  ],
  general_red_flags: [],
  general_green_flags: [
    {
      label: 'Calm pacing',
      description: 'Maintained a steady, deliberate cadence throughout the answer.',
    },
  ],
  reviewer_notes: 'Simulated session generated for UI testing.',
  practice_areas: [
    { rank: 1, title: 'Specificity', detail: 'Add concrete numbers, dates, and team sizes.' },
    { rank: 2, title: 'Reflection', detail: 'Surface what you would do differently today.' },
    { rank: 3, title: 'Structure', detail: 'Keep STAR sections clearly delineated.' },
  ],
};

export async function createSimulatedSession(): Promise<{ id: string }> {
  const now = new Date();
  const label = `Simulated · ${now.toLocaleString()}`;

  const [session] = await db
    .insert(interviewSessions)
    .values({
      candidateName: label,
      candidateEmail: null,
      status: 'completed',
      startedAt: now,
      endedAt: now,
      evaluationStatus: 'completed',
    })
    .returning({ id: interviewSessions.id });

  if (!session) throw new Error('Failed to create simulated session');

  await db.insert(evaluations).values({
    sessionId: session.id,
    rubricVersion: RUBRIC_VERSION,
    payload: SIMULATED_EVAL,
  });

  return { id: session.id };
}
