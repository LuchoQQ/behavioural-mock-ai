import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { asc, eq } from 'drizzle-orm';
import { db } from '@/db/client';
import {
  questionBank,
  sessionQuestions,
  sessionResponses,
  interviewSessions,
  evaluations,
} from '@/db/schema';
import {
  type AnswerSegmentT,
  FinalEval,
  type PerQuestionEvalT,
  RUBRIC_VERSION,
  type FinalEvalT,
} from '@/lib/schemas/evaluation';
import { buildEvaluatorPrompt } from '@/lib/prompts/evaluator';

type InvariantFailure = { ok: false; reason: string };
type InvariantOk = { ok: true };
type InvariantResult = InvariantOk | InvariantFailure;

function checkInvariants(
  payload: FinalEvalT,
  expectedByQuestionId: Map<string, string>,
  orderByQuestionId: Map<string, number>,
): InvariantResult {
  for (const q of payload.per_question) {
    const num = orderByQuestionId.get(q.question_id) ?? '?';
    const expected = expectedByQuestionId.get(q.question_id);
    if (expected == null) {
      return { ok: false, reason: `unknown question_id on Q${num}` };
    }

    const reconstructed = q.answer_segments.map((s) => s.t).join('');
    if (reconstructed !== expected) {
      return { ok: false, reason: `transcript divergence on Q${num}` };
    }

    const greenCardIds = new Set(q.green_flags.map((f) => f.id));
    const redCardIds = new Set(q.red_flags.map((f) => f.id));
    if (greenCardIds.size !== q.green_flags.length) {
      return { ok: false, reason: `duplicate green flag id on Q${num}` };
    }
    if (redCardIds.size !== q.red_flags.length) {
      return { ok: false, reason: `duplicate red flag id on Q${num}` };
    }

    const segGreenIds = new Set<string>();
    const segRedIds = new Set<string>();
    for (const s of q.answer_segments) {
      if (s.flag === 'green' && s.id) segGreenIds.add(s.id);
      if (s.flag === 'red' && s.id) segRedIds.add(s.id);
    }

    if (!setsEqual(segGreenIds, greenCardIds)) {
      return { ok: false, reason: `green flag id mismatch on Q${num}` };
    }
    if (!setsEqual(segRedIds, redCardIds)) {
      return { ok: false, reason: `red flag id mismatch on Q${num}` };
    }
  }

  // practice_areas is best-effort: the model occasionally drops it. We accept
  // 0..3 entries; if present, ranks must be unique and in 1..3.
  if (payload.practice_areas.length > 0) {
    const ranks = payload.practice_areas.map((p) => p.rank).sort();
    const unique = new Set(ranks);
    if (unique.size !== ranks.length || ranks.some((r) => r < 1 || r > 3)) {
      return { ok: false, reason: 'practice_areas ranks must be unique within 1..3' };
    }
  }

  return { ok: true };
}

function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
  if (a.size !== b.size) return false;
  for (const v of a) if (!b.has(v)) return false;
  return true;
}

// Bounded vocabulary for per-question flag labels. The prompt instructs the
// model to pick from these lists only, but we enforce it here too so a
// well-meaning hallucination doesn't pollute the cross-session pattern set.
const ALLOWED_GREEN_LABELS = new Set<string>([
  'clear_ownership',
  'quantified_impact',
  'concrete_artifacts',
  'strong_self_reflection',
  'well_structured_star',
  'honest_about_tradeoffs',
  'constructive_conflict',
]);

const ALLOWED_RED_LABELS = new Set<string>([
  'badmouthed_employer',
  'took_undue_credit',
  'no_self_reflection',
  'rambled_no_structure',
  'evasive_on_specifics',
  'blamed_others',
  'we_focused_throughout',
  'no_quantified_impact_when_warranted',
]);

// Drops any flag whose label is outside the bounded vocabulary, along with the
// matching annotation on the segment that carried that flag's id. Segment
// text is preserved — only the `flag`/`id` keys are stripped.
function dropOffVocabFlags(
  q: PerQuestionEvalT,
  sessionId: string,
  questionNum: number | string,
): PerQuestionEvalT {
  const droppedGreen = q.green_flags
    .filter((f) => !ALLOWED_GREEN_LABELS.has(f.label))
    .map((f) => f.label);
  const droppedRed = q.red_flags
    .filter((f) => !ALLOWED_RED_LABELS.has(f.label))
    .map((f) => f.label);

  if (droppedGreen.length === 0 && droppedRed.length === 0) return q;

  console.warn('[evaluator] dropped off-vocab flags', {
    sessionId,
    question: `Q${questionNum}`,
    droppedGreen,
    droppedRed,
  });

  const keptGreen = q.green_flags.filter((f) => ALLOWED_GREEN_LABELS.has(f.label));
  const keptRed = q.red_flags.filter((f) => ALLOWED_RED_LABELS.has(f.label));
  const keptIds = new Set<string>([
    ...keptGreen.map((f) => f.id),
    ...keptRed.map((f) => f.id),
  ]);

  const cleanedSegments: AnswerSegmentT[] = q.answer_segments.map((s) => {
    if (s.flag != null && s.id != null && !keptIds.has(s.id)) {
      // Strip the annotation but keep the literal text so the transcript still
      // reconstructs byte-for-byte.
      return { t: s.t };
    }
    return s;
  });

  return {
    ...q,
    answer_segments: cleanedSegments,
    green_flags: keptGreen,
    red_flags: keptRed,
  };
}

// When the LLM's answer_segments don't reconstruct the original transcript
// byte-for-byte (it paraphrased, fixed a typo, normalized whitespace, etc.),
// repair the question in place rather than failing the whole evaluation:
// find each flagged segment's text inside the original transcript and rebuild
// the segments around the matches. Flags whose text can't be located are
// dropped, along with their corresponding green/red flag cards.
function repairDivergentQuestion(
  q: PerQuestionEvalT,
  original: string,
): PerQuestionEvalT {
  const flagged = q.answer_segments.filter(
    (s): s is AnswerSegmentT & { flag: 'green' | 'red'; id: string } =>
      s.flag != null && s.id != null,
  );

  const matches: {
    start: number;
    end: number;
    flag: 'green' | 'red';
    id: string;
  }[] = [];

  let searchFrom = 0;
  for (const seg of flagged) {
    const idx = original.indexOf(seg.t, searchFrom);
    if (idx === -1) continue;
    matches.push({ start: idx, end: idx + seg.t.length, flag: seg.flag, id: seg.id });
    searchFrom = idx + seg.t.length;
  }

  const rebuilt: AnswerSegmentT[] = [];
  let cursor = 0;
  for (const m of matches) {
    if (m.start > cursor) {
      rebuilt.push({ t: original.slice(cursor, m.start) });
    }
    rebuilt.push({ t: original.slice(m.start, m.end), flag: m.flag, id: m.id });
    cursor = m.end;
  }
  if (cursor < original.length) {
    rebuilt.push({ t: original.slice(cursor) });
  }
  if (rebuilt.length === 0) {
    rebuilt.push({ t: original });
  }

  const keptIds = new Set(matches.map((m) => m.id));
  const green = q.green_flags.filter((f) => keptIds.has(f.id));
  const red = q.red_flags.filter((f) => keptIds.has(f.id));

  return {
    ...q,
    answer_segments: rebuilt,
    green_flags: green,
    red_flags: red,
  };
}

export async function evaluateSession(sessionId: string): Promise<void> {
  const rows = await db
    .select({
      question_id: questionBank.id,
      question_text: questionBank.text,
      short_label: questionBank.shortLabel,
      candidate_transcript: sessionResponses.transcriptExcerpt,
      order: sessionQuestions.order,
    })
    .from(sessionResponses)
    .innerJoin(sessionQuestions, eq(sessionQuestions.id, sessionResponses.sessionQuestionId))
    .innerJoin(questionBank, eq(questionBank.id, sessionQuestions.questionId))
    .where(eq(sessionResponses.sessionId, sessionId))
    .orderBy(asc(sessionQuestions.order));

  if (rows.length === 0) {
    throw new Error(`No responses for session ${sessionId}`);
  }

  const existing = await db
    .select({ id: evaluations.id })
    .from(evaluations)
    .where(eq(evaluations.sessionId, sessionId))
    .limit(1);
  if (existing.length > 0) {
    await db
      .update(interviewSessions)
      .set({ evaluationStatus: 'completed', evaluationError: null })
      .where(eq(interviewSessions.id, sessionId));
    return;
  }

  const transcriptInputs = rows.map((r) => ({
    question_id: r.question_id,
    question_text: r.question_text,
    short_label: r.short_label,
    candidate_transcript: r.candidate_transcript ?? '',
  }));

  const prompt = buildEvaluatorPrompt(transcriptInputs);

  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-6'),
    schema: FinalEval,
    prompt,
    temperature: 0.3,
    maxRetries: 2,
  });

  const expectedByQuestionId = new Map(
    transcriptInputs.map((t) => [t.question_id, t.candidate_transcript]),
  );
  const orderByQuestionId = new Map(rows.map((r, i) => [r.question_id, i + 1]));

  // Repair any per-question transcript divergence before the strict invariant
  // check. The LLM tends to normalize whitespace or fix typos in its segments —
  // costing us the whole evaluation under the original byte-for-byte rule.
  // Then drop any flag whose label falls outside the bounded vocabulary, so
  // cross-session pattern recognition stays meaningful.
  const repaired: FinalEvalT = {
    ...object,
    per_question: object.per_question.map((q) => {
      const expected = expectedByQuestionId.get(q.question_id);
      const num = orderByQuestionId.get(q.question_id) ?? '?';
      let next = q;
      if (expected != null) {
        const reconstructed = next.answer_segments.map((s) => s.t).join('');
        if (reconstructed !== expected) {
          console.warn('[evaluator] transcript divergence — repaired', {
            sessionId,
            question: `Q${num}`,
          });
          next = repairDivergentQuestion(next, expected);
        }
      }
      next = dropOffVocabFlags(next, sessionId, num);
      return next;
    }),
  };

  const result = checkInvariants(repaired, expectedByQuestionId, orderByQuestionId);
  if (!result.ok) {
    console.error('[evaluator] invariant_failed', { sessionId, reason: result.reason });
    await db
      .update(interviewSessions)
      .set({ evaluationStatus: 'failed', evaluationError: result.reason })
      .where(eq(interviewSessions.id, sessionId));
    return;
  }

  await db.insert(evaluations).values({
    sessionId,
    rubricVersion: RUBRIC_VERSION,
    payload: repaired,
  });

  await db
    .update(interviewSessions)
    .set({ evaluationStatus: 'completed', evaluationError: null })
    .where(eq(interviewSessions.id, sessionId));
}

export { checkInvariants };
