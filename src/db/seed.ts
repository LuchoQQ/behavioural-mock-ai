import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import { eq } from 'drizzle-orm';
import { questionBank, type CommonPitfall } from './schema';

const QUESTIONS = [
  {
    text: 'Tell me about the hardest challenge that you ever faced.',
    shortLabel: 'Hardest challenge',
    category: 'challenge',
    primaryCompetencies: ['learning_agility', 'judgment'],
    secondaryCompetencies: ['ownership'],
    interpretationNotes: `
The candidate chooses the example, and that choice itself is a signal.
Picking something trivial relative to their stated level reveals weak
self-assessment. Unlike a failure question, this one implies the
candidate prevailed or grew — a positive or mixed-positive outcome is
expected. The challenge can be technical OR interpersonal; both valid.

The strongest answers reveal HOW the candidate thinks under pressure,
not just what they did. Listen for: how they decomposed the problem,
what they considered and rejected, where they were uncertain, who they
involved, and what changed in them as a result.

Be aware: this is often confused with a failure question. If the
candidate's story has no positive arc and is just hardship, gently
probe for what they took away from it.
    `.trim(),
    commonPitfalls: [
      {
        name: 'choice_of_trivial_example',
        description: 'Picks something not actually hard for their stated level (e.g., senior picking a junior-level bug)',
        severity: 'moderate',
      },
      {
        name: 'confused_with_failure',
        description: 'Tells a failure story instead of a challenge story — no growth or resolution arc',
        severity: 'minor',
      },
      {
        name: 'missing_growth_arc',
        description: 'Describes hardship without articulating what changed in them or what they learned',
        severity: 'moderate',
      },
      {
        name: 'pure_external_difficulty',
        description: 'Frames challenge as external circumstances with no inner cognitive/emotional dimension',
        severity: 'moderate',
      },
      {
        name: 'jump_to_solution',
        description: 'Skips investigation, decision-making, or hypothesis-testing — answer is "I had problem X, then I did Y"',
        severity: 'severe',
      },
    ] satisfies CommonPitfall[],
    seniorityRange: ['junior', 'mid', 'senior', 'staff', 'principal'],
    weight: 100,
  },
  {
    text: 'Tell me about a project of yours that failed.',
    shortLabel: 'Failed project',
    category: 'failure',
    primaryCompetencies: ['self_awareness', 'ownership'],
    secondaryCompetencies: ['learning_agility', 'judgment'],
    interpretationNotes: `
Two critical words: "of yours" demands ownership; "project" demands
scope (not a one-off bug, commit, or PR).

The question tests whether the candidate can admit failure honestly
while still appearing trustworthy. Watch carefully for "the project
failed" framing instead of "I failed at this project" — the former
dodges accountability. The strongest answers identify specific
decision points where the candidate could have acted differently, not
external causes.

Listen for: which specific decision they own as the wrong one, what
signal they missed or ignored, how they communicated the failure to
stakeholders, and what they've concretely changed in their approach
since.

This question is the highest-signal one in the bank. Candidates who
can't fail honestly here are usually candidates who can't be trusted
after a failure in the role.
    `.trim(),
    commonPitfalls: [
      {
        name: 'project_failed_not_me_failed',
        description: 'Passive framing puts failure on circumstances ("the project failed") rather than on their decisions',
        severity: 'severe',
      },
      {
        name: 'requirements_changed_excuse',
        description: 'Blames shifting requirements or scope creep without acknowledging their own failure to push back, escalate, or adapt',
        severity: 'severe',
      },
      {
        name: 'fake_failure',
        description: 'Picks a project that "failed" only in minor ways (e.g., shipped late but ultimately successful, or hit minor scope cut)',
        severity: 'severe',
      },
      {
        name: 'too_small_scope',
        description: 'Picks a personal coding mistake or small bug instead of project-scale failure',
        severity: 'moderate',
      },
      {
        name: 'no_decision_points',
        description: 'Tells what happened chronologically but never identifies the moments where they could have decided differently',
        severity: 'moderate',
      },
      {
        name: 'no_lesson_named',
        description: 'Story ends without articulating a specific, falsifiable lesson learned and applied',
        severity: 'moderate',
      },
      {
        name: 'blames_team',
        description: 'Attributes failure to teammates, manager, or org dysfunction without owning their part',
        severity: 'severe',
      },
    ] satisfies CommonPitfall[],
    seniorityRange: ['junior', 'mid', 'senior', 'staff', 'principal'],
    weight: 150,
  },
  {
    text: 'How did you handle disagreement with a colleague or leadership?',
    shortLabel: 'Disagreement',
    category: 'conflict',
    primaryCompetencies: ['collaboration', 'judgment'],
    secondaryCompetencies: ['self_awareness'],
    interpretationNotes: `
The verb "handle" emphasizes process over outcome. Strong answers walk
through the conversation itself: what they said, what the other said,
how they bridged.

The "or leadership" framing is an invitation. Candidates who pick
disagreement with leadership show comfort pushing up, which is more
impressive at senior level. A senior or staff candidate who ONLY ever
picks disagreements with colleagues (never leadership) is a subtle red
flag for hierarchical thinking or conflict avoidance with authority.

Listen for: how they steelmanned the other side, whether they tried
direct resolution before escalating, whether the relationship survived
intact, and what they learned. A good answer is rarely "I convinced
them I was right" — it's usually "we found a third option" or "I
updated my view based on something they said."
    `.trim(),
    commonPitfalls: [
      {
        name: 'who_was_right_focus',
        description: 'Answers with the resolution outcome ("turns out I was right") instead of the handling process',
        severity: 'moderate',
      },
      {
        name: 'generic_we_talked_it_out',
        description: 'Vague "we had a conversation and worked it out" with no concrete dialogue, positions, or moments',
        severity: 'moderate',
      },
      {
        name: 'i_was_right_they_were_wrong',
        description: 'Zero humility — conflict described as the candidate enlightening the wrong party',
        severity: 'severe',
      },
      {
        name: 'escalated_too_fast',
        description: 'Jumps to manager or HR without first attempting direct resolution with the other party',
        severity: 'severe',
      },
      {
        name: 'seniority_avoidance',
        description: 'Senior+ candidate picks an easy colleague disagreement when leadership-pushback examples would demonstrate more',
        severity: 'minor',
      },
      {
        name: 'emotional_residue',
        description: 'Tone reveals lingering bitterness or unresolved feelings about the other party',
        severity: 'severe',
      },
      {
        name: 'avoided_conflict',
        description: '"We just moved on" or "I let it go" without actual resolution or learning',
        severity: 'moderate',
      },
    ] satisfies CommonPitfall[],
    seniorityRange: ['mid', 'senior', 'staff', 'principal'],
    weight: 100,
  },
];

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const sql = neon(process.env.DATABASE_URL);
  const db = drizzle(sql, { schema: { questionBank } });

  const existing = await db.select({ id: questionBank.id, text: questionBank.text }).from(questionBank);
  const existingByText = new Map(existing.map((e) => [e.text, e.id]));

  let inserted = 0;
  let updated = 0;
  for (const q of QUESTIONS) {
    const existingId = existingByText.get(q.text);
    if (existingId) {
      await db
        .update(questionBank)
        .set({
          shortLabel: q.shortLabel,
          category: q.category,
          primaryCompetencies: q.primaryCompetencies,
          secondaryCompetencies: q.secondaryCompetencies,
          interpretationNotes: q.interpretationNotes,
          commonPitfalls: q.commonPitfalls,
          seniorityRange: q.seniorityRange,
          weight: q.weight,
        })
        .where(eq(questionBank.id, existingId));
      updated++;
    } else {
      await db.insert(questionBank).values(q);
      inserted++;
    }
  }
  console.log(`question_bank: ${inserted} inserted, ${updated} updated (${QUESTIONS.length} total in source)`);
}

main().catch((err) => {
  console.error('Seed failed', err);
  process.exit(1);
});
