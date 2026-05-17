'use client';

import Link from 'next/link';
import {
  type CSSProperties,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type {
  AnswerSegmentT,
  FinalEvalT,
  PerQuestionEvalT,
} from '@/lib/schemas/evaluation';
import type { SessionWithEval } from '@/lib/sessions';

type Props = {
  session: SessionWithEval;
  backHref: string;
};

const SCORE_LABEL: Record<number, string> = {
  1: 'Needs work',
  2: 'Acceptable',
  3: 'Solid',
  4: 'Excellent',
};
const SCORE_COLOR: Record<number, string> = {
  1: 'var(--destructive)',
  2: 'var(--difficulty-medium)',
  3: 'var(--difficulty-easy)',
  4: '#e8e8e8',
};

type QuestionVM = {
  num: number;
  label: string;
  question: string;
  score: number;
  answer: AnswerSegmentT[];
  greenFlags: PerQuestionEvalT['green_flags'];
  redFlags: PerQuestionEvalT['red_flags'];
  improvement: string;
};

export function ResultsView({ session, backHref }: Props) {
  if (!session.evaluation) {
    return <EmptyShell session={session} backHref={backHref} />;
  }

  const questions: QuestionVM[] = session.evaluation.per_question.map((q, i) => ({
    num: i + 1,
    label: q.short_label,
    question: q.question_text,
    score: q.score,
    answer: q.answer_segments,
    greenFlags: q.green_flags,
    redFlags: q.red_flags,
    improvement: q.improvement,
  }));

  return (
    <Report
      session={session}
      evaluation={session.evaluation}
      questions={questions}
      backHref={backHref}
    />
  );
}

function Report({
  session,
  evaluation,
  questions,
  backHref,
}: {
  session: SessionWithEval;
  evaluation: FinalEvalT;
  questions: QuestionVM[];
  backHref: string;
}) {
  const [activeId, setActiveId] = useState<string | null>(null);
  const [scrollPct, setScrollPct] = useState(0);
  const [activeQ, setActiveQ] = useState<number | 'outro'>(1);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const max = doc.scrollHeight - window.innerHeight;
      setScrollPct(max > 0 ? doc.scrollTop / max : 0);
      const mid = window.scrollY + window.innerHeight * 0.4;
      let cur: number | 'outro' = 1;
      for (const q of questions) {
        const el = sectionRefs.current[`q-${q.num}`];
        if (el && el.offsetTop <= mid) cur = q.num;
      }
      const outro = sectionRefs.current['outro'];
      if (outro && outro.offsetTop <= mid) cur = 'outro';
      setActiveQ(cur);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [questions]);

  const jump = useCallback((target: number | 'outro') => {
    const id = target === 'outro' ? 'outro' : `q-${target}`;
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div style={{ background: '#050505', minHeight: '100vh' }}>
      <TopBar
        session={session}
        questions={questions}
        scrollPct={scrollPct}
        activeQ={activeQ}
        backHref={backHref}
        onJump={jump}
      />
      <Hero
        session={session}
        questions={questions}
        onJump={jump}
      />
      {questions.map((q) => (
        <QuestionSection
          key={q.num}
          q={q}
          total={questions.length}
          activeId={activeId}
          setActiveId={setActiveId}
          sectionRef={(el) => {
            sectionRefs.current[`q-${q.num}`] = el;
          }}
        />
      ))}
      <Outro
        session={session}
        evaluation={evaluation}
        questions={questions}
        backHref={backHref}
        sectionRef={(el) => {
          sectionRefs.current['outro'] = el;
        }}
      />
    </div>
  );
}

function TopBar({
  session,
  questions,
  scrollPct,
  activeQ,
  backHref,
  onJump,
}: {
  session: SessionWithEval;
  questions: QuestionVM[];
  scrollPct: number;
  activeQ: number | 'outro';
  backHref: string;
  onJump: (target: number | 'outro') => void;
}) {
  return (
    <div className="topbar" style={{ height: 52 }}>
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          height: '100%',
          padding: '0 24px',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
        }}
      >
        <Link
          href={backHref}
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            textDecoration: 'none',
          }}
        >
          silver.dev
        </Link>
        <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <span style={{ fontSize: 12.5, color: 'var(--muted-foreground)' }}>
          Your feedback —{' '}
          <span style={{ color: 'var(--foreground)', fontWeight: 500 }}>
            Behavioral mock #{session.mockNumber}
          </span>
        </span>

        <div style={{ marginLeft: 'auto', display: 'flex', gap: 2 }}>
          {questions.map((q) => (
            <button
              key={q.num}
              type="button"
              onClick={() => onJump(q.num)}
              style={{
                padding: '4px 10px',
                borderRadius: 6,
                border: 0,
                background: activeQ === q.num ? 'var(--secondary)' : 'transparent',
                color: activeQ === q.num ? 'var(--foreground)' : 'var(--muted-foreground)',
                fontSize: 12,
                fontWeight: 500,
                cursor: 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.7 }}>
                Q{q.num}
              </span>
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 999,
                  background: SCORE_COLOR[q.score],
                }}
              />
            </button>
          ))}
          <button
            type="button"
            onClick={() => onJump('outro')}
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              border: 0,
              background: activeQ === 'outro' ? 'var(--secondary)' : 'transparent',
              color: activeQ === 'outro' ? 'var(--foreground)' : 'var(--muted-foreground)',
              fontSize: 12,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Summary
          </button>
        </div>

        <span style={{ width: 1, height: 16, background: 'var(--border)' }} />
        <span
          style={{
            fontSize: 12,
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          {formatDate(session.startedAt ?? session.createdAt)}
        </span>
      </div>
      <div
        className="progress"
        style={{ ['--p' as never]: scrollPct } as CSSProperties}
      />
    </div>
  );
}

function Hero({
  session,
  questions,
  onJump,
}: {
  session: SessionWithEval;
  questions: QuestionVM[];
  onJump: (target: number) => void;
}) {
  const overall = session.overallScore ?? 0;
  const prev = session.previousScores.length > 0 ? session.previousScores[session.previousScores.length - 1]! : null;
  const delta = prev != null ? +(overall - prev).toFixed(1) : null;
  const candidate = (session.candidateName?.trim() || 'Anonymous').split(' ')[0]!;
  const duration = formatDuration(session.startedAt, session.endedAt);

  return (
    <section style={{ padding: '64px 24px 24px' }}>
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          <span className="eyebrow">Behavioral · Mock #{session.mockNumber}</span>
          <Dot />
          <span style={{ fontSize: 12, color: 'var(--muted-foreground)' }}>
            {formatDate(session.startedAt ?? session.createdAt)}
          </span>
          {duration && (
            <>
              <Dot />
              <span
                style={{
                  fontSize: 12,
                  color: 'var(--muted-foreground)',
                  fontFamily: 'var(--font-mono)',
                }}
              >
                {duration}
              </span>
            </>
          )}
        </div>

        <h1
          style={{
            margin: '0 0 56px',
            fontSize: 56,
            lineHeight: 1.02,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            textWrap: 'pretty' as CSSProperties['textWrap'],
            maxWidth: 880,
          }}
        >
          {candidate}, <span className="silver-shimmer">here's how it went</span>.
        </h1>

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: 24,
            marginBottom: 56,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
            <span
              className="silver-shimmer"
              style={{
                fontSize: 128,
                fontWeight: 700,
                letterSpacing: '-0.05em',
                lineHeight: 0.85,
                fontFamily: 'var(--font-mono)',
              }}
            >
              {overall.toFixed(1)}
            </span>
            <span
              style={{
                fontSize: 28,
                color: 'var(--muted-foreground)',
                fontFamily: 'var(--font-mono)',
              }}
            >
              /4
            </span>
          </div>
          <div style={{ paddingBottom: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span className="eyebrow" style={{ fontSize: 11 }}>
              Overall score
            </span>
            {delta != null && prev != null && (
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13,
                  fontWeight: 600,
                  color: delta >= 0 ? 'var(--difficulty-easy)' : 'var(--destructive)',
                }}
              >
                <Icon name={delta >= 0 ? 'chevronUp' : 'chevronDown'} size={13} />
                {delta >= 0 ? '+' : ''}
                {delta} vs last mock ({prev.toFixed(1)})
              </div>
            )}
          </div>
        </div>

        <div
          style={{
            borderTop: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
          }}
        >
          {questions.map((q) => (
            <HoverRow key={q.num} q={q} onJump={() => onJump(q.num)} />
          ))}
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 6,
            marginTop: 56,
            marginBottom: 8,
          }}
        >
          <span
            style={{
              fontSize: 11,
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.18em',
              fontWeight: 600,
            }}
          >
            Keep scrolling for the breakdown
          </span>
          <span
            style={{
              display: 'inline-flex',
              color: 'var(--muted-foreground)',
              animation: 'scrollHint 1.6s ease-in-out infinite',
            }}
          >
            <Icon name="chevron-down" size={18} />
          </span>
        </div>
      </div>
    </section>
  );
}

function HoverRow({ q, onJump }: { q: QuestionVM; onJump: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onJump}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        width: '100%',
        textAlign: 'left',
        background: hover ? 'color-mix(in srgb, var(--foreground) 3%, transparent)' : 'transparent',
        border: 0,
        padding: '22px 4px',
        paddingLeft: hover ? 12 : 4,
        borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
        display: 'grid',
        gridTemplateColumns: '64px minmax(0, 1.4fr) 1fr 140px 24px',
        alignItems: 'center',
        gap: 24,
        fontFamily: 'inherit',
        color: 'var(--foreground)',
        cursor: 'pointer',
        transition: 'background .12s ease, padding-left .12s ease',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-mono)',
          color: 'var(--muted-foreground)',
          fontSize: 13,
        }}
      >
        Q{q.num}
      </span>
      <span style={{ fontSize: 17, fontWeight: 500, letterSpacing: '-0.01em' }}>
        {q.label}
      </span>
      <span style={{ fontSize: 13, color: SCORE_COLOR[q.score] }}>
        {SCORE_LABEL[q.score]}
      </span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end' }}>
        <ScoreBar score={q.score} width={80} />
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontWeight: 700,
            fontSize: 22,
            color: SCORE_COLOR[q.score],
            minWidth: 32,
            textAlign: 'right',
          }}
        >
          {q.score}
        </span>
      </div>
      <span style={{ color: 'var(--muted-foreground)', justifySelf: 'end' }}>
        <Icon name="chevron-right" size={16} />
      </span>
    </button>
  );
}

function QuestionSection({
  q,
  total,
  activeId,
  setActiveId,
  sectionRef,
}: {
  q: QuestionVM;
  total: number;
  activeId: string | null;
  setActiveId: (id: string | null) => void;
  sectionRef: (el: HTMLElement | null) => void;
}) {
  return (
    <section
      ref={sectionRef}
      id={`q-${q.num}`}
      className="q-section"
      style={{ padding: '96px 24px 80px' }}
    >
      <div
        style={{
          maxWidth: 1180,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1fr) 320px',
          gap: 64,
        }}
      >
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              marginBottom: 32,
              fontSize: 12.5,
            }}
          >
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                color: 'var(--muted-foreground)',
              }}
            >
              Q{q.num}
              <span style={{ opacity: 0.5 }}> / {total}</span>
            </span>
            <Dot />
            <span style={{ color: 'var(--muted-foreground)' }}>{q.label}</span>
            <span style={{ flex: 1 }} />
            <ScoreBar score={q.score} width={64} />
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontWeight: 600,
                color: SCORE_COLOR[q.score],
              }}
            >
              {q.score}/4
            </span>
          </div>

          <div
            style={{
              margin: '0 0 36px',
              fontSize: 16,
              lineHeight: 1.5,
              color: 'var(--muted-foreground)',
              fontWeight: 400,
              maxWidth: 720,
              textWrap: 'pretty' as CSSProperties['textWrap'],
            }}
          >
            <span
              style={{
                color: 'var(--muted-foreground)',
                opacity: 0.6,
                fontStyle: 'italic',
              }}
            >
              Question:
            </span>{' '}
            {q.question}
          </div>

          <AnnotatedAnswer
            segments={q.answer}
            activeId={activeId}
            onHover={setActiveId}
          />
        </div>

        <aside
          className="sticky-side"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 30,
            fontSize: 13,
          }}
        >
          <FlagGroup
            title="What worked"
            count={q.greenFlags.length}
            color="var(--difficulty-easy)"
          >
            {q.greenFlags.length === 0 ? (
              <EmptyFlagNote>No clear highlights here.</EmptyFlagNote>
            ) : (
              q.greenFlags.map((f) => (
                <FlagItem
                  key={f.id}
                  flag={f}
                  kind="green"
                  activeId={activeId}
                  onHover={setActiveId}
                />
              ))
            )}
          </FlagGroup>

          <FlagGroup
            title="What hurt"
            count={q.redFlags.length}
            color="var(--destructive)"
          >
            {q.redFlags.length === 0 ? (
              <EmptyFlagNote>Nothing to fix.</EmptyFlagNote>
            ) : (
              q.redFlags.map((f) => (
                <FlagItem
                  key={f.id}
                  flag={f}
                  kind="red"
                  activeId={activeId}
                  onHover={setActiveId}
                />
              ))
            )}
          </FlagGroup>

          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'baseline',
                gap: 8,
                fontSize: 11,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--callout-warning-link, var(--difficulty-medium))',
                marginBottom: 14,
              }}
            >
              Try this
            </div>
            <div
              style={{
                fontSize: 13.5,
                lineHeight: 1.55,
                color: 'var(--foreground)',
                paddingLeft: 14,
                borderLeft:
                  '2px solid var(--callout-warning-link, var(--difficulty-medium))',
              }}
            >
              {q.improvement}
            </div>
          </div>
        </aside>
      </div>
    </section>
  );
}

function AnnotatedAnswer({
  segments,
  activeId,
  onHover,
}: {
  segments: AnswerSegmentT[];
  activeId: string | null;
  onHover: (id: string | null) => void;
}) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: 24,
        lineHeight: 1.5,
        letterSpacing: '-0.005em',
        color: 'var(--foreground)',
        textWrap: 'pretty' as CSSProperties['textWrap'],
        fontWeight: 400,
      }}
    >
      {segments.map((s, i) => {
        if (!s.flag || !s.id) return <span key={i}>{s.t}</span>;
        const isActive = activeId === s.id;
        return (
          <span
            key={i}
            className="ann"
            data-flag={s.flag}
            data-active={isActive ? 'true' : 'false'}
            data-id={s.id}
            onMouseEnter={() => onHover(s.id ?? null)}
            onMouseLeave={() => onHover(null)}
          >
            {s.t}
          </span>
        );
      })}
    </p>
  );
}

function FlagGroup({
  title,
  count,
  color,
  children,
}: {
  title: string;
  count: number;
  color: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: 8,
          fontSize: 11,
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          color: 'var(--muted-foreground)',
          marginBottom: 14,
        }}
      >
        <span style={{ color }}>{title}</span>
        <span style={{ fontFamily: 'var(--font-mono)', opacity: 0.6 }}>
          {String(count).padStart(2, '0')}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>
    </div>
  );
}

function FlagItem({
  flag,
  kind,
  activeId,
  onHover,
}: {
  flag: { id: string; label: string; note: string };
  kind: 'green' | 'red';
  activeId: string | null;
  onHover: (id: string | null) => void;
}) {
  const c = kind === 'green' ? 'var(--difficulty-easy)' : 'var(--destructive)';
  const isActive = activeId === flag.id;
  return (
    <div
      data-id={flag.id}
      onMouseEnter={() => onHover(flag.id)}
      onMouseLeave={() => onHover(null)}
      style={{
        padding: '4px 0 4px 14px',
        borderLeft: `2px solid ${isActive ? c : `color-mix(in srgb, ${c} 35%, transparent)`}`,
        transition: 'border-color .15s ease, transform .15s ease',
        transform: isActive ? 'translateX(2px)' : 'translateX(0)',
        cursor: 'default',
      }}
    >
      <div
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: isActive ? c : 'var(--foreground)',
          letterSpacing: '-0.005em',
          marginBottom: 2,
          transition: 'color .15s ease',
        }}
      >
        {formatFlagLabel(flag.label)}
      </div>
      <div
        style={{
          fontSize: 13,
          lineHeight: 1.5,
          color: 'var(--muted-foreground)',
        }}
      >
        {flag.note}
      </div>
    </div>
  );
}

function EmptyFlagNote({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        fontSize: 12.5,
        color: 'var(--muted-foreground)',
        fontStyle: 'italic',
      }}
    >
      {children}
    </div>
  );
}

function Outro({
  session,
  evaluation,
  questions,
  backHref,
  sectionRef,
}: {
  session: SessionWithEval;
  evaluation: FinalEvalT;
  questions: QuestionVM[];
  backHref: string;
  sectionRef: (el: HTMLElement | null) => void;
}) {
  const currentAvg = session.overallScore ?? 0;
  const scoresAll = useMemo(
    () => [...session.previousScores, currentAvg],
    [session.previousScores, currentAvg],
  );
  const prev =
    session.previousScores.length > 0
      ? session.previousScores[session.previousScores.length - 1]!
      : null;
  const delta = prev != null ? +(currentAvg - prev).toFixed(1) : null;
  const sortedAreas = [...evaluation.practice_areas].sort((a, b) => a.rank - b.rank);

  return (
    <section
      ref={sectionRef}
      id="outro"
      style={{
        padding: '96px 24px 96px',
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(60,60,60,0.16), transparent 60%)',
      }}
    >
      <div style={{ maxWidth: 1180, margin: '0 auto' }}>
        <span className="eyebrow">Summary</span>
        <h2
          style={{
            margin: '14px 0 56px',
            fontSize: 42,
            fontWeight: 700,
            letterSpacing: '-0.025em',
            maxWidth: 720,
            lineHeight: 1.05,
          }}
        >
          Focus on <span className="silver-shimmer">just these 3 things</span> before
          your next mock and we expect you at 3.0+.
        </h2>

        <div style={{ marginBottom: 64 }}>
          {sortedAreas.map((pa, idx) => (
            <div
              key={pa.rank}
              style={{
                display: 'grid',
                gridTemplateColumns: '52px 1fr',
                alignItems: 'baseline',
                gap: 24,
                padding: '22px 0',
                borderTop:
                  idx === 0
                    ? '1px solid color-mix(in srgb, var(--border) 80%, transparent)'
                    : 0,
                borderBottom: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
              }}
            >
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 36,
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: pa.rank === 1 ? 'var(--foreground)' : 'var(--muted-foreground)',
                  opacity: pa.rank === 1 ? 1 : 0.55,
                  lineHeight: 1,
                }}
              >
                {String(pa.rank).padStart(2, '0')}
              </span>
              <div style={{ minWidth: 0, paddingTop: 4 }}>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 600,
                    color: 'var(--foreground)',
                    marginBottom: 6,
                    letterSpacing: '-0.015em',
                  }}
                >
                  {pa.title}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: 'var(--muted-foreground)',
                    maxWidth: 720,
                  }}
                >
                  {pa.detail}
                </div>
              </div>
            </div>
          ))}
        </div>

        {scoresAll.length > 1 && (
          <div
            style={{
              padding: '32px 36px',
              background:
                'linear-gradient(160deg, color-mix(in srgb, var(--card) 80%, transparent) 0%, color-mix(in srgb, var(--card) 30%, transparent) 100%)',
              border: '1px solid var(--border)',
              borderRadius: 18,
              display: 'grid',
              gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.2fr)',
              gap: 40,
              alignItems: 'center',
            }}
          >
            <div>
              <span className="eyebrow" style={{ fontSize: 11 }}>
                Your progress
              </span>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                  marginTop: 10,
                }}
              >
                <span
                  style={{
                    fontSize: 48,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    letterSpacing: '-0.03em',
                    lineHeight: 1,
                  }}
                >
                  {currentAvg.toFixed(1)}
                </span>
                <span
                  style={{
                    fontSize: 18,
                    color: 'var(--muted-foreground)',
                    fontFamily: 'var(--font-mono)',
                  }}
                >
                  /4
                </span>
                {delta != null && (
                  <span
                    style={{
                      marginLeft: 8,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 13,
                      fontWeight: 600,
                      color: delta >= 0 ? 'var(--difficulty-easy)' : 'var(--destructive)',
                    }}
                  >
                    <Icon
                      name={delta >= 0 ? 'chevronUp' : 'chevronDown'}
                      size={13}
                    />
                    {delta >= 0 ? '+' : ''}
                    {delta}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontSize: 14,
                  color: 'var(--muted-foreground)',
                  marginTop: 14,
                  lineHeight: 1.55,
                }}
              >
                {delta == null
                  ? 'First mock — the baseline. Run another to start tracking progress.'
                  : delta >= 0
                    ? `Up ${delta} points from your last mock. Lean on what worked.`
                    : `Down ${Math.abs(delta)} points. Go back to an explicit STAR structure.`}
              </div>
            </div>
            <ProgressBars scores={scoresAll} />
          </div>
        )}

        {/* unused but keeps the questions ref intentional */}
        <span style={{ display: 'none' }}>{questions.length}</span>

        <div
          style={{
            marginTop: 56,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ fontSize: 15, color: 'var(--muted-foreground)' }}>
            Ready for another round? We&apos;ll send 3 new questions.
          </div>
          <Link
            href={backHref}
            style={{
              height: 40,
              padding: '0 18px',
              borderRadius: 10,
              background: '#fff',
              color: '#0c0a09',
              border: 0,
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
            }}
          >
            <Icon name="play" size={13} />
            Run another mock
          </Link>
        </div>
      </div>
    </section>
  );
}

function ProgressBars({ scores }: { scores: number[] }) {
  const max = 4;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 18,
        height: 160,
        padding: '24px 0 0',
      }}
    >
      {scores.map((s, i) => {
        const isCurrent = i === scores.length - 1;
        const h = (s / max) * 100;
        return (
          <div
            key={i}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 10,
            }}
          >
            <div
              style={{
                flex: 1,
                width: '100%',
                display: 'flex',
                alignItems: 'flex-end',
              }}
            >
              <div
                style={{
                  width: '100%',
                  height: `${h}%`,
                  borderRadius: 4,
                  background: isCurrent
                    ? 'linear-gradient(180deg, #f5f5f5, #888)'
                    : 'color-mix(in srgb, var(--difficulty-easy) 35%, transparent)',
                  position: 'relative',
                }}
              >
                <span
                  style={{
                    position: 'absolute',
                    top: -26,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    fontSize: 14,
                    fontWeight: 700,
                    fontFamily: 'var(--font-mono)',
                    color: isCurrent ? 'var(--foreground)' : 'var(--muted-foreground)',
                  }}
                >
                  {s.toFixed(1)}
                </span>
              </div>
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: isCurrent ? 'var(--foreground)' : 'var(--muted-foreground)',
                fontWeight: isCurrent ? 600 : 400,
              }}
            >
              Mock #{i + 1}
              {isCurrent ? ' · now' : ''}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ScoreBar({ score, width = 80 }: { score: number; width?: number }) {
  const max = 4;
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${max}, 1fr)`,
        gap: 4,
        width,
      }}
    >
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          style={{
            height: 6,
            borderRadius: 2,
            background:
              i < score
                ? SCORE_COLOR[score]
                : 'color-mix(in srgb, var(--secondary) 80%, transparent)',
          }}
        />
      ))}
    </div>
  );
}

function Dot() {
  return (
    <span
      style={{
        width: 3,
        height: 3,
        borderRadius: '50%',
        background: 'var(--border)',
        display: 'inline-block',
      }}
    />
  );
}

type IconName = 'chevronUp' | 'chevronDown' | 'chevron-down' | 'chevron-right' | 'play' | 'file';
function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const props = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.75,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const paths: Record<IconName, ReactNode> = {
    chevronUp: <path d="M18 15l-6-6-6 6" />,
    chevronDown: <path d="M6 9l6 6 6-6" />,
    'chevron-down': <path d="M6 9l6 6 6-6" />,
    'chevron-right': <path d="M9 18l6-6-6-6" />,
    play: <polygon points="6 4 20 12 6 20 6 4" />,
    file: (
      <>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
      </>
    ),
  };
  return <svg {...props}>{paths[name]}</svg>;
}

function formatFlagLabel(label: string): string {
  const spaced = label.replace(/_/g, ' ').trim();
  if (!spaced) return spaced;
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatDuration(start: string | null, end: string | null): string | null {
  if (!start || !end) return null;
  const secs = Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000));
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function EmptyShell({ session, backHref }: { session: SessionWithEval; backHref: string }) {
  const text =
    session.evaluationStatus === 'pending'
      ? 'Evaluation is still pending. Refresh in a minute.'
      : session.evaluationStatus === 'failed'
        ? 'Evaluation failed.'
        : 'No evaluation available for this session.';

  return (
    <main
      style={{
        minHeight: '100vh',
        background: '#050505',
        color: 'var(--foreground)',
        padding: '64px 24px',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <Link
          href={backHref}
          style={{
            fontSize: 12.5,
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            textDecoration: 'none',
            marginBottom: 24,
            display: 'inline-block',
          }}
        >
          ← Back
        </Link>
        <h1
          style={{
            margin: '8px 0 16px',
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: '-0.02em',
          }}
        >
          Mock #{session.mockNumber}
        </h1>
        <p style={{ color: 'var(--muted-foreground)', fontSize: 14, lineHeight: 1.6 }}>
          {text}
          {session.evaluationError ? ` — ${session.evaluationError}` : ''}
        </p>
      </div>
    </main>
  );
}
