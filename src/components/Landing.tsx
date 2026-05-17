'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { PreflightScreen } from './InterviewWidget';
import {
  deleteSessionAction,
  simulateInterviewAction,
  startInterviewAction,
} from '@/lib/actions';
import type { SessionListItem } from '@/lib/sessions';

type Props = {
  sessions: SessionListItem[];
};

export function Landing({ sessions }: Props) {
  const [isStarting, startStartTransition] = useTransition();
  const [isSimulating, startSimulateTransition] = useTransition();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onStart = () => {
    setErrorMessage(null);
    startStartTransition(async () => {
      try {
        await startInterviewAction();
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to start interview');
      }
    });
  };

  const onSimulate = () => {
    setErrorMessage(null);
    startSimulateTransition(async () => {
      try {
        await simulateInterviewAction();
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to simulate session');
      }
    });
  };

  const onDelete = (sessionId: string) => {
    setErrorMessage(null);
    setPendingDeleteId(sessionId);
    startSimulateTransition(async () => {
      try {
        await deleteSessionAction({ sessionId });
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : 'Failed to delete session');
      } finally {
        setPendingDeleteId(null);
      }
    });
  };

  const scrollToHistory = () => {
    document
      .getElementById('previous-interviews')
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div style={{ minHeight: '100vh', background: '#050505', color: 'var(--foreground)' }}>
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          height: '100vh',
          overflow: 'hidden',
        }}
      >
        <PreflightScreen
          onStart={onStart}
          isConnecting={isStarting}
          errorMessage={errorMessage}
        />
        <ScrollHint count={sessions.length} onClick={scrollToHistory} />
      </div>

      <PreviousResults
        sessions={sessions}
        onSimulate={onSimulate}
        onDelete={onDelete}
        isSimulating={isSimulating}
        pendingDeleteId={pendingDeleteId}
      />
    </div>
  );
}

function ScrollHint({ count, onClick }: { count: number; onClick: () => void }) {
  const label =
    count === 0
      ? 'Previous interviews'
      : count === 1
        ? '1 previous interview'
        : `${count} previous interviews`;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Scroll to previous interviews"
      style={{
        position: 'absolute',
        left: '50%',
        bottom: 18,
        transform: 'translateX(-50%)',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '6px 14px',
        background: 'rgba(0,0,0,0.45)',
        border: 0,
        borderRadius: 999,
        color: 'var(--muted-foreground)',
        fontFamily: 'inherit',
        fontSize: 11,
        fontWeight: 600,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        cursor: 'pointer',
        backdropFilter: 'blur(8px)',
        animation: 'scrollHint 2.2s ease-in-out infinite',
      }}
    >
      <span>{label}</span>
      <svg
        width={14}
        height={14}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );
}

function PreviousResults({
  sessions,
  onSimulate,
  onDelete,
  isSimulating,
  pendingDeleteId,
}: {
  sessions: SessionListItem[];
  onSimulate: () => void;
  onDelete: (id: string) => void;
  isSimulating: boolean;
  pendingDeleteId: string | null;
}) {
  return (
    <section
      id="previous-interviews"
      style={{
        padding: '60px 24px 80px',
        background:
          'linear-gradient(180deg, #050505 0%, #0a0a0a 100%)',
        borderTop: '1px solid var(--border)',
        scrollMarginTop: 24,
      }}
    >
      <div style={{ maxWidth: 880, margin: '0 auto' }}>
        <header
          style={{
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
            gap: 16,
            marginBottom: 24,
          }}
        >
          <div>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                color: 'var(--muted-foreground)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              History
            </span>
            <h2
              style={{
                margin: '8px 0 0',
                fontSize: 24,
                fontWeight: 700,
                letterSpacing: '-0.01em',
                color: 'var(--foreground)',
              }}
            >
              Previous interviews
            </h2>
          </div>
          <button
            type="button"
            onClick={onSimulate}
            disabled={isSimulating}
            style={{
              height: 36,
              padding: '0 14px',
              borderRadius: 8,
              background: 'transparent',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: isSimulating ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              opacity: isSimulating ? 0.6 : 1,
            }}
          >
            {isSimulating ? 'Working…' : '+ Simulate completed interview'}
          </button>
        </header>

        {sessions.length === 0 ? (
          <div
            style={{
              padding: '32px 24px',
              borderRadius: 12,
              border: '1px dashed var(--border)',
              background: 'color-mix(in srgb, var(--card) 60%, transparent)',
              textAlign: 'center',
              color: 'var(--muted-foreground)',
              fontSize: 13.5,
            }}
          >
            No interviews yet. Start one above or simulate a completed session.
          </div>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {sessions.map((s) => (
              <SessionRow
                key={s.id}
                session={s}
                onDelete={() => onDelete(s.id)}
                isDeleting={pendingDeleteId === s.id}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function SessionRow({
  session,
  onDelete,
  isDeleting,
}: {
  session: SessionListItem;
  onDelete: () => void;
  isDeleting: boolean;
}) {
  const created = new Date(session.createdAt);
  const dateLabel = created.toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const name = session.candidateName?.trim() || 'Anonymous';
  const completed = session.status === 'completed';

  return (
    <li
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto auto auto auto',
        gap: 16,
        alignItems: 'center',
        padding: '14px 18px',
        borderRadius: 12,
        border: '1px solid var(--border)',
        background: 'color-mix(in srgb, var(--card) 80%, transparent)',
        opacity: isDeleting ? 0.4 : 1,
        transition: 'opacity .2s ease',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--foreground)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {name}
        </div>
        <div
          style={{
            fontSize: 12,
            color: 'var(--muted-foreground)',
            fontFamily: 'var(--font-mono)',
            marginTop: 2,
          }}
        >
          {dateLabel}
        </div>
      </div>

      <StatusBadge label={session.status} tone={completed ? 'good' : 'neutral'} />
      <StatusBadge
        label={
          session.hasEvaluation
            ? 'Evaluated'
            : session.evaluationStatus === 'pending'
              ? 'Pending eval'
              : session.evaluationStatus
        }
        tone={session.hasEvaluation ? 'good' : 'neutral'}
      />

      <Link
        href={`/results/${session.id}`}
        style={{
          height: 30,
          padding: '0 12px',
          borderRadius: 6,
          background: session.hasEvaluation ? '#fff' : 'transparent',
          color: session.hasEvaluation ? '#0c0a09' : 'var(--muted-foreground)',
          border: session.hasEvaluation ? 0 : '1px solid var(--border)',
          fontSize: 12,
          fontWeight: 600,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          textDecoration: 'none',
        }}
      >
        View →
      </Link>

      <button
        type="button"
        onClick={onDelete}
        disabled={isDeleting}
        title="Delete session"
        style={{
          height: 30,
          padding: '0 12px',
          borderRadius: 6,
          background: 'transparent',
          color: 'var(--destructive)',
          border: '1px solid color-mix(in srgb, var(--destructive) 40%, transparent)',
          fontSize: 12,
          fontWeight: 600,
          cursor: isDeleting ? 'wait' : 'pointer',
          fontFamily: 'inherit',
        }}
      >
        {isDeleting ? '…' : 'Delete'}
      </button>
    </li>
  );
}

function StatusBadge({
  label,
  tone,
}: {
  label: string;
  tone: 'good' | 'neutral';
}) {
  const color = tone === 'good' ? 'var(--difficulty-easy)' : 'var(--muted-foreground)';
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        fontSize: 10.5,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        padding: '3px 8px',
        borderRadius: 999,
        color,
        background: `color-mix(in srgb, ${color} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 30%, transparent)`,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </span>
  );
}
