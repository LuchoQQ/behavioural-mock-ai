import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { asc, eq } from 'drizzle-orm';
import { generateObject } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';

import { db } from '../src/db/client';
import { questionBank, sessionQuestions, sessionResponses } from '../src/db/schema';
import { FinalEval, type FinalEvalT } from '../src/lib/schemas/evaluation';
import { buildEvaluatorPrompt } from '../src/lib/prompts/evaluator';
import { checkInvariants } from '../src/lib/evaluator';

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

function ok(label: string) {
  console.log(`${GREEN}OK${RESET}   ${label}`);
}
function fail(label: string, reason?: string) {
  console.log(`${RED}FAIL${RESET} ${label}${reason ? ` — ${reason}` : ''}`);
}
function warn(label: string) {
  console.log(`${YELLOW}WARN${RESET} ${label}`);
}

async function main() {
  const sessionId = process.argv[2] ?? process.env.SESSION_ID;
  if (!sessionId) {
    console.error('Usage: pnpm tsx scripts/eval-fixture.ts <sessionId>');
    console.error('   or: SESSION_ID=<sessionId> pnpm tsx scripts/eval-fixture.ts');
    process.exit(2);
  }

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
    console.error(`No responses for session ${sessionId}`);
    process.exit(1);
  }

  const transcriptInputs = rows.map((r) => ({
    question_id: r.question_id,
    question_text: r.question_text,
    short_label: r.short_label,
    candidate_transcript: r.candidate_transcript ?? '',
  }));

  console.log(`\n=== Building prompt for ${transcriptInputs.length} questions ===`);
  const prompt = buildEvaluatorPrompt(transcriptInputs);

  console.log('=== Calling LLM (claude-sonnet-4-6) ===\n');
  const { object } = await generateObject({
    model: anthropic('claude-sonnet-4-6'),
    schema: FinalEval,
    prompt,
    temperature: 0.3,
  });

  console.log('=== Raw payload ===');
  console.log(JSON.stringify(object, null, 2));
  console.log('\n=== Validation summary ===');

  const reparsed = FinalEval.safeParse(object);
  if (reparsed.success) {
    ok('FinalEval.safeParse');
  } else {
    fail('FinalEval.safeParse', JSON.stringify(reparsed.error.issues, null, 2));
  }

  const expectedByQuestionId = new Map(
    transcriptInputs.map((t) => [t.question_id, t.candidate_transcript]),
  );
  const orderByQuestionId = new Map(rows.map((r, i) => [r.question_id, i + 1]));

  const typedObject = object as FinalEvalT;
  const invariant = checkInvariants(typedObject, expectedByQuestionId, orderByQuestionId);
  if (invariant.ok) {
    ok('invariants (transcript faithfulness + id integrity + practice_areas ranks)');
  } else {
    fail('invariants', invariant.reason);
  }

  console.log('\n=== Per-question detail ===');
  for (let i = 0; i < typedObject.per_question.length; i++) {
    const q = typedObject.per_question[i]!;
    const expected = expectedByQuestionId.get(q.question_id) ?? '';
    const reconstructed = q.answer_segments.map((s) => s.t).join('');
    const sameLen = reconstructed.length === expected.length;
    const sameContent = reconstructed === expected;

    console.log(
      `\nQ${i + 1} [${q.short_label}] score=${q.score} segments=${q.answer_segments.length} green=${q.green_flags.length} red=${q.red_flags.length}`,
    );
    if (sameContent) {
      ok('  transcript faithfulness');
    } else {
      fail(
        '  transcript faithfulness',
        `expected ${expected.length} chars, got ${reconstructed.length} chars (lengthMatch=${sameLen})`,
      );
      const firstDiff = firstDiffIndex(expected, reconstructed);
      if (firstDiff >= 0) {
        warn(
          `  first divergence at char ${firstDiff}: expected ${JSON.stringify(expected.slice(firstDiff, firstDiff + 40))}, got ${JSON.stringify(reconstructed.slice(firstDiff, firstDiff + 40))}`,
        );
      }
    }

    const segGreen = new Set<string>();
    const segRed = new Set<string>();
    for (const s of q.answer_segments) {
      if (s.flag === 'green' && s.id) segGreen.add(s.id);
      if (s.flag === 'red' && s.id) segRed.add(s.id);
    }
    const cardGreen = new Set(q.green_flags.map((f) => f.id));
    const cardRed = new Set(q.red_flags.map((f) => f.id));

    diffSet('  green ids (segments vs cards)', segGreen, cardGreen);
    diffSet('  red ids (segments vs cards)', segRed, cardRed);
  }

  console.log('\n=== Practice areas ===');
  const ranks = typedObject.practice_areas.map((p) => p.rank).sort();
  if (ranks.length === 3 && ranks[0] === 1 && ranks[1] === 2 && ranks[2] === 3) {
    ok('ranks = [1, 2, 3]');
  } else {
    fail('ranks', JSON.stringify(ranks));
  }
  for (const p of typedObject.practice_areas.slice().sort((a, b) => a.rank - b.rank)) {
    console.log(`  #${p.rank} ${p.title} — ${p.detail}`);
  }
  console.log();
}

function firstDiffIndex(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) if (a[i] !== b[i]) return i;
  return a.length !== b.length ? n : -1;
}

function diffSet(label: string, segIds: Set<string>, cardIds: Set<string>) {
  const onlySeg = [...segIds].filter((id) => !cardIds.has(id));
  const onlyCard = [...cardIds].filter((id) => !segIds.has(id));
  if (onlySeg.length === 0 && onlyCard.length === 0) {
    ok(label);
    return;
  }
  fail(
    label,
    `seg-only=${JSON.stringify(onlySeg)} card-only=${JSON.stringify(onlyCard)}`,
  );
}

main().catch((err) => {
  console.error('eval-fixture failed:', err);
  process.exit(1);
});
