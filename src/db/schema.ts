import { pgTable, uuid, text, boolean, timestamp, integer, jsonb } from 'drizzle-orm/pg-core';

export type CommonPitfall = {
  name: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe';
};

export const questionBank = pgTable('question_bank', {
  id: uuid('id').defaultRandom().primaryKey(),
  text: text('text').notNull(),
  shortLabel: text('short_label').notNull(),
  category: text('category').notNull(),
  active: boolean('active').default(true).notNull(),
  primaryCompetencies: text('primary_competencies').array().notNull().default([]),
  secondaryCompetencies: text('secondary_competencies').array().notNull().default([]),
  interpretationNotes: text('interpretation_notes'),
  commonPitfalls: jsonb('common_pitfalls').$type<CommonPitfall[]>().notNull().default([]),
  seniorityRange: text('seniority_range').array().notNull().default([]),
  weight: integer('weight').notNull().default(100),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const interviewSessions = pgTable('interview_sessions', {
  id: uuid('id').defaultRandom().primaryKey(),
  candidateName: text('candidate_name'),
  candidateEmail: text('candidate_email'),
  status: text('status').notNull().default('created'),
  elevenlabsConversationId: text('elevenlabs_conversation_id'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  evaluationStatus: text('evaluation_status').notNull().default('pending'),
  evaluationError: text('evaluation_error'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sessionQuestions = pgTable('session_questions', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => interviewSessions.id),
  questionId: uuid('question_id')
    .notNull()
    .references(() => questionBank.id),
  order: integer('order').notNull(),
  askedAt: timestamp('asked_at'),
  closedAt: timestamp('closed_at'),
  followUpCount: integer('follow_up_count').default(0).notNull(),
  agentInternalAssessment: text('agent_internal_assessment'),
});

export const sessionResponses = pgTable('session_responses', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => interviewSessions.id),
  sessionQuestionId: uuid('session_question_id')
    .notNull()
    .references(() => sessionQuestions.id),
  transcriptExcerpt: text('transcript_excerpt'),
  audioUrl: text('audio_url'),
  startedAt: timestamp('started_at'),
  endedAt: timestamp('ended_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const evaluations = pgTable('evaluations', {
  id: uuid('id').defaultRandom().primaryKey(),
  sessionId: uuid('session_id')
    .notNull()
    .references(() => interviewSessions.id),
  rubricVersion: text('rubric_version').notNull(),
  payload: jsonb('payload').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
