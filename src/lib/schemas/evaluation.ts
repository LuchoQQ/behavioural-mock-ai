import { z } from 'zod';

export const RUBRIC_VERSION = 'v2';

// Legacy / admin-audit shapes — kept for star_completeness, general_*_flags,
// reviewer_notes, and optional word_improvements. Do NOT remove.
export const StarComponent = z.enum(['missing', 'vague', 'clear']);
export type StarComponentT = z.infer<typeof StarComponent>;

export const ScoreLevel = z.enum(['strong_no', 'no', 'yes', 'strong_yes']);
export type ScoreLevelT = z.infer<typeof ScoreLevel>;

export const Flag = z.object({
  label: z.string(),
  description: z.string(),
});
export type FlagT = z.infer<typeof Flag>;

export const WordImprovement = z.object({
  original_phrase: z.string(),
  suggested_rewording: z.string(),
  reason: z.string(),
});
export type WordImprovementT = z.infer<typeof WordImprovement>;

// v2 shapes — consumed by the HTML report.
// Using `{ t, flag?, id? }` with a refinement (no discriminator) — the LLM
// produces cleaner output without a `kind` tag.
export const AnswerSegment = z
  .object({
    t: z.string(),
    flag: z.enum(['green', 'red']).optional(),
    id: z.string().min(1).optional(),
  })
  .refine(
    (s) => (s.flag == null && s.id == null) || (s.flag != null && s.id != null),
    { message: 'flag and id must both be set or both be absent' },
  );
export type AnswerSegmentT = z.infer<typeof AnswerSegment>;

export const FlagCard = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  note: z.string().min(1),
});
export type FlagCardT = z.infer<typeof FlagCard>;

export const PracticeArea = z.object({
  rank: z.number().int().min(1).max(3),
  title: z.string().min(1),
  detail: z.string().min(1),
});
export type PracticeAreaT = z.infer<typeof PracticeArea>;

export const PerQuestionEval = z.object({
  question_id: z.string().uuid(),
  question_text: z.string(),
  short_label: z.string().min(1).max(60),

  star_completeness: z.object({
    situation: StarComponent,
    task: StarComponent,
    action: StarComponent,
    result: StarComponent,
  }),

  score: z.number().int().min(1).max(4),

  answer_segments: z.array(AnswerSegment).min(1),
  green_flags: z.array(FlagCard),
  red_flags: z.array(FlagCard),

  improvement: z.string().min(1),

  word_improvements: z.array(WordImprovement).max(8).optional(),
  notes: z.string().optional(),
});
export type PerQuestionEvalT = z.infer<typeof PerQuestionEval>;

export const FinalEval = z.object({
  per_question: z
    .array(PerQuestionEval)
    .min(1)
    .describe('REQUIRED. One entry per question evaluated.'),
  general_red_flags: z
    .array(Flag)
    .describe(
      'REQUIRED. Session-level red flag patterns recurring across two or more answers. Empty array if none.',
    ),
  general_green_flags: z
    .array(Flag)
    .describe(
      'REQUIRED. Session-level green flag patterns recurring across two or more answers. Empty array if none.',
    ),
  reviewer_notes: z
    .string()
    .default('')
    .describe(
      'REQUIRED. 3–6 sentence overall qualitative summary of the candidate. Specific and actionable, not generic.',
    ),
  practice_areas: z
    .array(PracticeArea)
    .max(3)
    .default([])
    .describe(
      'REQUIRED. Exactly 3 practice areas ranked 1/2/3, the top things to drill before the next mock.',
    ),
});
export type FinalEvalT = z.infer<typeof FinalEval>;
