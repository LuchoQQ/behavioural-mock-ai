'use client';

import {
  type ReactNode,
  type RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { useConversation } from '@elevenlabs/react';
import Link from 'next/link';
import { getSessionStatusAction } from '@/lib/actions';

type Props = {
  agentId: string;
  sessionId: string;
  autoStart?: boolean;
};

type Stage = 'pre-flight' | 'joining' | 'in-call' | 'ending' | 'wrap-up';

export function InterviewWidget({ agentId, sessionId, autoStart = false }: Props) {
  // Autostart flow: landing already showed an intro hero, so jump straight to the
  // 5-second joining countdown (it kicks off startSession() when it lands at 0).
  // Direct nav: show the full pre-flight device check.
  const [stage, setStage] = useState<Stage>(autoStart ? 'joining' : 'pre-flight');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [muted, setMuted] = useState(false);
  const [camOn, setCamOn] = useState(true);
  const [elapsed, setElapsed] = useState('00:00');
  const startedAtRef = useRef<number | null>(null);
  const sessionStartedRef = useRef(false);
  // Marks that we actually connected to the agent. Lets onDisconnect distinguish
  // a real call ending (auto wrap-up) from no-call-yet state.
  const callConnectedRef = useRef(false);

  // Real webcam preview — the design's whole point is "te ves vos".
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [camReady, setCamReady] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    if (!camOn) {
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
        streamRef.current = null;
      }
      if (videoRef.current) videoRef.current.srcObject = null;
      setCamReady(false);
      setCamError(null);
      return;
    }

    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user' },
          audio: false,
        });
        if (cancelled) {
          for (const t of stream.getTracks()) t.stop();
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
        setCamReady(true);
        setCamError(null);
      } catch (err) {
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : 'Camera unavailable';
        console.warn('[interview] camera unavailable', msg);
        setCamError(msg);
        setCamReady(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [camOn]);

  useEffect(() => {
    return () => {
      if (streamRef.current) {
        for (const t of streamRef.current.getTracks()) t.stop();
      }
    };
  }, []);

  const conversation = useConversation({
    micMuted: muted,
    onConnect: ({ conversationId }) => {
      setErrorMessage(null);
      startedAtRef.current = Date.now();
      callConnectedRef.current = true;
      console.log('[interview] connected', { sessionId, conversationId });
    },
    onDisconnect: () => {
      console.log('[interview] disconnected', { sessionId });
      // Agent ended the call (it called end_call after the closing line,
      // or the candidate hit End, or the connection dropped). In all
      // in-call cases we move to the 'ending' fade so the candidate
      // sees an intentional transition rather than an abrupt cut.
      if (!callConnectedRef.current) return;
      setStage((s) => (s === 'in-call' ? 'ending' : s));
    },
    onError: (msg: string) => {
      console.error('[interview] error', { sessionId, msg });
      setErrorMessage(msg);
    },
    onMessage: ({ source, message }) => {
      console.log(`[interview] ${source}:`, message);
    },
  });

  const status = conversation.status;
  const isSpeaking = conversation.isSpeaking;
  const isConnected = status === 'connected';
  const isConnecting = status === 'connecting';

  useEffect(() => {
    if (stage !== 'in-call' || !isConnected) return;
    const id = setInterval(() => {
      setElapsed(formatStamp(startedAtRef.current));
    }, 1000);
    return () => clearInterval(id);
  }, [stage, isConnected]);

  // Safety net for the agent's hang-up. The prompt instructs the agent
  // to call `end_call` after `end_interview`, which closes the WebRTC
  // cleanly via onDisconnect. If the LLM skips end_call, polling catches
  // the session's 'completed' flag and we tear down the call ourselves
  // so the candidate isn't left on a dead line.
  useEffect(() => {
    if (stage !== 'in-call' || !isConnected) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const snap = await getSessionStatusAction({ sessionId });
        if (cancelled) return;
        if (snap?.status === 'completed') {
          console.log('[interview] agent ended interview — closing call');
          try {
            await conversation.endSession();
          } catch (err) {
            console.warn('[interview] endSession after auto-detect failed', err);
          }
          setStage((s) => (s === 'in-call' ? 'ending' : s));
          return;
        }
      } catch (err) {
        console.warn('[interview] status poll failed', err);
      }
      if (cancelled) return;
      timer = setTimeout(tick, 4000);
    };

    timer = setTimeout(tick, 4000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [stage, isConnected, sessionId, conversation]);

  // Brief fade between call-end and wrap-up so the disconnect feels
  // intentional, not abrupt.
  useEffect(() => {
    if (stage !== 'ending') return;
    const id = setTimeout(() => setStage('wrap-up'), 800);
    return () => clearTimeout(id);
  }, [stage]);

  const startSession = useCallback(async () => {
    if (sessionStartedRef.current) return;
    sessionStartedRef.current = true;
    setErrorMessage(null);
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      await conversation.startSession({
        agentId,
        connectionType: 'websocket',
        dynamicVariables: { session_id: sessionId },
      });
    } catch (err) {
      sessionStartedRef.current = false;
      const text = err instanceof Error ? err.message : 'Failed to start session';
      console.error('[interview] start failed', { sessionId, err });
      setErrorMessage(text);
      setStage('pre-flight');
    }
  }, [agentId, sessionId, conversation]);

  const onPreflightJoin = useCallback(() => {
    setErrorMessage(null);
    setStage('joining');
  }, []);

  const onJoiningComplete = useCallback(async () => {
    setStage('in-call');
    await startSession();
  }, [startSession]);

  const end = useCallback(async () => {
    try {
      await conversation.endSession();
    } catch (err) {
      console.error('[interview] end failed', { sessionId, err });
    } finally {
      setStage('ending');
    }
  }, [sessionId, conversation]);

  const skip = useCallback(() => {
    try {
      conversation.sendContextualUpdate(
        'The candidate would like to move on to the next question.',
      );
    } catch (err) {
      console.error('[interview] skip failed', { sessionId, err });
    }
  }, [conversation, sessionId]);

  const restart = useCallback(() => {
    setElapsed('00:00');
    startedAtRef.current = null;
    sessionStartedRef.current = false;
    callConnectedRef.current = false;
    setStage('pre-flight');
  }, []);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        overflow: 'hidden',
        background: '#050505',
        color: 'var(--foreground)',
        position: 'relative',
      }}
    >
      <TopBar
        elapsed={elapsed}
        recording={stage === 'in-call' && isConnected}
      />

      {/* Single hidden video element — shared across all stages so the camera
          doesn't tear down between transitions. Each stage's YouTile renders a
          <video> via a forwarded ref into this same element. */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{ display: 'none' }}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        {stage === 'pre-flight' && (
          <DeviceCheck
            onJoin={onPreflightJoin}
            camOn={camOn}
            onToggleCam={() => setCamOn((v) => !v)}
            muted={muted}
            onToggleMute={() => setMuted((v) => !v)}
            isConnecting={isConnecting}
            errorMessage={errorMessage}
            videoRef={videoRef}
            camReady={camReady}
            camError={camError}
          />
        )}
        {stage === 'joining' && (
          <Joining
            onEnter={onJoiningComplete}
            muted={muted}
            camOn={camOn}
            videoRef={videoRef}
            camReady={camReady}
          />
        )}
        {stage === 'in-call' && (
          <InCall
            speaking={isSpeaking}
            connected={isConnected}
            muted={muted}
            camOn={camOn}
            videoRef={videoRef}
            camReady={camReady}
          />
        )}
        {stage === 'ending' && (
          <Ending
            muted={muted}
            camOn={camOn}
            videoRef={videoRef}
            camReady={camReady}
          />
        )}
        {stage === 'wrap-up' && (
          <WrapupScreen
            sessionId={sessionId}
            elapsed={elapsed}
            onRestart={restart}
          />
        )}
      </div>

      {stage === 'in-call' && (
        <Toolbar
          muted={muted}
          onMute={() => setMuted((m) => !m)}
          camOn={camOn}
          onToggleCam={() => setCamOn((v) => !v)}
          onSkip={skip}
          onEnd={end}
        />
      )}

      {errorMessage && stage === 'in-call' && (
        <div
          role="alert"
          style={{
            position: 'absolute',
            left: 24,
            bottom: 120,
            padding: '10px 14px',
            background: 'color-mix(in srgb, var(--destructive) 18%, transparent)',
            border:
              '1px solid color-mix(in srgb, var(--destructive) 45%, transparent)',
            borderRadius: 10,
            color: 'var(--foreground)',
            fontSize: 12.5,
            maxWidth: 360,
          }}
        >
          {errorMessage}
        </div>
      )}
    </div>
  );
}

// ============================================================
// Helpers
// ============================================================
function formatStamp(startedAt: number | null): string {
  if (!startedAt) return '00:00';
  const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

// ============================================================
// AI Orb
// ============================================================
function AIOrb({ speaking, size = 200 }: { speaking: boolean; size?: number }) {
  const ringSize = size + 28;
  return (
    <div
      style={{
        position: 'relative',
        width: ringSize,
        height: ringSize,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {speaking &&
        [0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              position: 'absolute',
              width: size,
              height: size,
              borderRadius: '50%',
              border: '1px solid rgba(220,220,220,0.32)',
              animationName: 'ringPulse',
              animationDuration: '2.4s',
              animationTimingFunction: 'ease-out',
              animationIterationCount: 'infinite',
              animationDelay: `${i * 0.7}s`,
            }}
          />
        ))}
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          position: 'relative',
          background:
            'radial-gradient(circle at 35% 30%, #ffffff 0%, #d6d6d6 22%, #8e8e8e 55%, #2a2a2a 100%), linear-gradient(135deg, #c0c0c0, #4a4a4a)',
          backgroundBlendMode: 'screen',
          boxShadow: speaking
            ? '0 0 60px rgba(220,220,220,0.32), inset 0 0 30px rgba(255,255,255,0.15), inset -20px -20px 60px rgba(0,0,0,0.55)'
            : '0 0 30px rgba(180,180,180,0.18), inset 0 0 30px rgba(255,255,255,0.1), inset -20px -20px 60px rgba(0,0,0,0.55)',
          animation: speaking
            ? 'orbSpeak 1.4s ease-in-out infinite'
            : 'orbBreath 4s ease-in-out infinite',
          transition: 'box-shadow .3s ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            top: '14%',
            left: '20%',
            width: '30%',
            height: '22%',
            borderRadius: '50%',
            background:
              'radial-gradient(closest-side, rgba(255,255,255,0.85), transparent 70%)',
            filter: 'blur(2px)',
          }}
        />
      </div>
    </div>
  );
}

// ============================================================
// Waveform
// ============================================================
function Waveform({
  active,
  color = 'var(--foreground)',
  height = 28,
  bars = 24,
}: {
  active: boolean;
  color?: string;
  height?: number;
  bars?: number;
}) {
  const anims = ['wave1', 'wave2', 'wave3', 'wave4', 'wave5'];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        height,
        opacity: active ? 1 : 0.3,
        transition: 'opacity .3s ease',
      }}
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 3,
            borderRadius: 2,
            background: color,
            height: '40%',
            animationName: active ? anims[i % anims.length] : 'none',
            animationDuration: `${0.7 + (i % 5) * 0.15}s`,
            animationTimingFunction: 'ease-in-out',
            animationIterationCount: 'infinite',
            animationDelay: `${(i * 0.05) % 0.6}s`,
          }}
        />
      ))}
    </div>
  );
}

// ============================================================
// You tile — real webcam (with silhouette fallback when off / denied)
// ============================================================
function YouTile({
  name,
  muted,
  camOn,
  camReady,
  talking,
  dim,
  hint,
  videoRef,
}: {
  name: string;
  muted: boolean;
  camOn: boolean;
  camReady: boolean;
  talking: boolean;
  dim?: boolean;
  hint?: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
}) {
  // Mirror a clone of the video stream into this tile. We can't move the
  // real <video> here (its srcObject is set by the parent), so we attach
  // the same MediaStream to a local <video> when the parent's stream is ready.
  const localVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const local = localVideoRef.current;
    const source = videoRef.current;
    if (!local) return;
    if (camOn && camReady && source && source.srcObject) {
      local.srcObject = source.srcObject;
    } else {
      local.srcObject = null;
    }
  }, [camOn, camReady, videoRef]);

  const showVideo = camOn && camReady;

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: 18,
        overflow: 'hidden',
        background: 'linear-gradient(180deg, #1a1410 0%, #0a0807 100%)',
        border: talking
          ? '1px solid rgba(220,220,220,0.7)'
          : '1px solid var(--border)',
        boxShadow: talking
          ? '0 0 32px rgba(220,220,220,0.18)'
          : 'var(--shadow)',
        transition: 'border-color .2s ease, box-shadow .2s ease, filter .3s ease',
        filter: dim ? 'brightness(.4) saturate(.7)' : 'none',
      }}
    >
      {showVideo ? (
        <>
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            style={{
              position: 'absolute',
              inset: 0,
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: 'scaleX(-1)', // mirror so it feels like a mirror
            }}
          />
          <div className="you-tile-vignette" />
        </>
      ) : (
        <FauxCamera camOn={camOn} name={name} />
      )}

      {/* Name + mic pill */}
      <div
        style={{
          position: 'absolute',
          left: 14,
          bottom: 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 11px',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(10px)',
          fontSize: 12.5,
          fontWeight: 500,
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        {muted && <Icon name="mic-off" size={12} />}
        {name}
        {hint && (
          <span
            style={{
              marginLeft: 6,
              paddingLeft: 9,
              borderLeft: '1px solid rgba(255,255,255,0.18)',
              fontSize: 11,
              color: '#d4d4d4',
              fontStyle: 'italic',
            }}
          >
            you see yourself — on purpose
          </span>
        )}
      </div>

      {talking && showVideo && (
        <div
          style={{
            position: 'absolute',
            right: 14,
            bottom: 14,
            width: 42,
            height: 16,
          }}
        >
          <Waveform active height={16} bars={7} color="#e8e8e8" />
        </div>
      )}
    </div>
  );
}

function FauxCamera({ camOn, name }: { camOn: boolean; name: string }) {
  if (!camOn) {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: 12,
          background: '#0c0908',
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            background: 'linear-gradient(135deg,#3a2a1f,#1a120c)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#a89684',
            fontSize: 22,
            fontWeight: 600,
            border: '1px solid var(--border)',
          }}
        >
          {name.slice(0, 2).toUpperCase() || 'YO'}
        </div>
        <div
          style={{
            fontSize: 13,
            color: 'var(--muted-foreground)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <Icon name="cam-off" size={12} />
          Camera off
        </div>
      </div>
    );
  }
  // Camera on but not ready yet (or denied) — silhouette
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background:
            'radial-gradient(circle at 50% 65%, #2a1f18 0%, #110b08 60%, #050402 100%)',
        }}
      />
      <svg
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
        }}
        viewBox="0 0 400 300"
        preserveAspectRatio="xMidYMid slice"
      >
        <defs>
          <radialGradient id="you-grad" cx="50%" cy="40%" r="40%">
            <stop offset="0%" stopColor="#5a4634" />
            <stop offset="100%" stopColor="#1a120c" />
          </radialGradient>
        </defs>
        <circle cx="200" cy="120" r="62" fill="url(#you-grad)" />
        <path
          d="M 110 300 Q 110 200 200 200 Q 290 200 290 300 Z"
          fill="url(#you-grad)"
        />
      </svg>
      <div className="you-tile-vignette" />
    </>
  );
}

// ============================================================
// AI tile — orb + name pill
// ============================================================
function AITile({ speaking, dim }: { speaking: boolean; dim?: boolean }) {
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: 18,
        overflow: 'hidden',
        background: 'radial-gradient(circle at 50% 40%, #1c1c1c 0%, #050505 100%)',
        border: speaking
          ? '1px solid rgba(220,220,220,0.7)'
          : '1px solid var(--border)',
        boxShadow: speaking
          ? '0 0 36px rgba(220,220,220,0.18)'
          : 'var(--shadow)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'border-color .2s ease, box-shadow .2s ease, filter .3s ease',
        filter: dim ? 'brightness(.4) saturate(.7)' : 'none',
      }}
    >
      <AIOrb speaking={speaking} size={220} />
      <div
        style={{
          position: 'absolute',
          left: 14,
          bottom: 14,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '6px 11px',
          borderRadius: 8,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(10px)',
          fontSize: 12.5,
          fontWeight: 500,
          color: '#fff',
          border: '1px solid rgba(255,255,255,0.06)',
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: speaking ? '#e8e8e8' : '#9ca3af',
            animation: speaking ? 'recordDot 1.2s ease-in-out infinite' : 'none',
          }}
        />
        Silver AI
      </div>
      {speaking && (
        <div
          style={{
            position: 'absolute',
            right: 14,
            bottom: 14,
            width: 42,
            height: 16,
          }}
        >
          <Waveform active height={16} bars={7} color="#d4d4d4" />
        </div>
      )}
    </div>
  );
}

// ============================================================
// Top bar
// ============================================================
function TopBar({
  elapsed,
  recording,
}: {
  elapsed: string;
  recording: boolean;
}) {
  return (
    <header
      style={{
        height: 56,
        padding: '0 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderBottom:
          '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
        background: 'rgba(8,8,8,0.7)',
        backdropFilter: 'blur(10px)',
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'var(--foreground)',
            letterSpacing: '-0.01em',
          }}
        >
          silver.dev
        </span>
        <span style={{ width: 1, height: 18, background: 'var(--border)' }} />
        <span
          style={{
            fontSize: 13,
            color: 'var(--muted-foreground)',
            fontWeight: 500,
          }}
        >
          Behavioral mock
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        {recording && (
          <span
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: 'var(--destructive)',
                animation: 'recordDot 1.4s ease-in-out infinite',
              }}
            />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'var(--foreground)',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
              }}
            >
              Rec
            </span>
          </span>
        )}
        <span
          style={{
            fontSize: 17,
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: 'var(--foreground)',
            letterSpacing: '0.02em',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {elapsed}
        </span>
      </div>
    </header>
  );
}

// ============================================================
// Toolbar
// ============================================================
function ToolButton({
  icon,
  label,
  danger,
  active,
  onClick,
}: {
  icon: IconName;
  label: string;
  danger?: boolean;
  active?: boolean;
  onClick?: () => void;
}) {
  const [hover, setHover] = useState(false);
  const bg = danger
    ? hover
      ? '#ef3a3a'
      : 'var(--destructive)'
    : active
      ? hover
        ? 'rgba(255,90,90,0.35)'
        : 'rgba(255,90,90,0.22)'
      : hover
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(255,255,255,0.04)';
  const fg = danger ? '#fff' : active ? '#ff8a8a' : '#fff';
  const border = active
    ? '1px solid color-mix(in srgb, var(--destructive) 55%, transparent)'
    : danger
      ? '1px solid transparent'
      : '1px solid color-mix(in srgb, var(--border) 90%, transparent)';

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      title={label}
      style={{
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        background: 'transparent',
        border: 0,
        cursor: 'pointer',
        color: 'var(--muted-foreground)',
        fontFamily: 'inherit',
        padding: 0,
      }}
    >
      <span
        style={{
          width: 52,
          height: 52,
          borderRadius: 999,
          background: bg,
          border,
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: fg,
          transition: 'all .15s ease',
        }}
      >
        <Icon name={icon} size={20} />
      </span>
      <span style={{ fontSize: 11, color: 'var(--muted-foreground)' }}>
        {label}
      </span>
    </button>
  );
}

function Toolbar({
  muted,
  onMute,
  camOn,
  onToggleCam,
  onSkip,
  onEnd,
}: {
  muted: boolean;
  onMute: () => void;
  camOn: boolean;
  onToggleCam: () => void;
  onSkip: () => void;
  onEnd: () => void;
}) {
  return (
    <footer
      style={{
        padding: '18px 24px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 32,
        flexShrink: 0,
        position: 'relative',
      }}
    >
      <ToolButton
        icon={muted ? 'mic-off' : 'mic'}
        label={muted ? 'Unmute' : 'Mute'}
        active={muted}
        onClick={onMute}
      />
      <ToolButton
        icon={camOn ? 'cam' : 'cam-off'}
        label={camOn ? 'Camera off' : 'Camera on'}
        active={!camOn}
        onClick={onToggleCam}
      />
      <ToolButton icon="logout" label="End" danger onClick={onEnd} />

      <button
        type="button"
        onClick={onSkip}
        style={{
          position: 'absolute',
          right: 28,
          top: '50%',
          transform: 'translateY(-50%)',
          height: 34,
          padding: '0 12px',
          borderRadius: 8,
          background: 'transparent',
          color: 'var(--muted-foreground)',
          border: '1px solid var(--border)',
          fontSize: 12.5,
          fontWeight: 500,
          cursor: 'pointer',
          fontFamily: 'inherit',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
        }}
      >
        <Icon name="chevron-right" size={12} />
        Next question
      </button>
    </footer>
  );
}

// ============================================================
// Status banner — small pill at the bottom of the in-call screen
// ============================================================
function StatusBanner({
  speaking,
  connected,
}: {
  speaking: boolean;
  connected: boolean;
}) {
  const label = !connected
    ? 'Connecting…'
    : speaking
      ? 'Silver AI is speaking'
      : 'Your turn — answer naturally';
  return (
    <div
      style={{
        maxWidth: 760,
        margin: '0 auto',
        padding: '14px 22px',
        background: 'rgba(0,0,0,0.45)',
        border: '1px solid color-mix(in srgb, var(--border) 90%, transparent)',
        borderRadius: 14,
        backdropFilter: 'blur(12px)',
        animation: 'fadeIn .3s ease',
        display: 'flex',
        gap: 14,
        alignItems: 'center',
      }}
    >
      <Waveform
        active={connected && !speaking}
        height={18}
        bars={10}
        color="#d4d4d4"
      />
      <span
        style={{
          fontSize: 14.5,
          lineHeight: 1.4,
          color: 'var(--foreground)',
          fontWeight: 500,
          letterSpacing: '-0.005em',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ============================================================
// In-call screen — two equal tiles + status banner
// ============================================================
function InCall({
  speaking,
  connected,
  muted,
  camOn,
  videoRef,
  camReady,
}: {
  speaking: boolean;
  connected: boolean;
  muted: boolean;
  camOn: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  camReady: boolean;
}) {
  return (
    <div
      style={{
        position: 'relative',
        flex: 1,
        overflow: 'hidden',
        background: '#050505',
        display: 'flex',
        flexDirection: 'column',
        padding: '24px 24px 0',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 18,
          minHeight: 0,
        }}
      >
        <AITile speaking={speaking} />
        <YouTile
          name="You"
          muted={muted}
          camOn={camOn}
          camReady={camReady}
          talking={connected && !speaking && !muted}
          hint
          videoRef={videoRef}
        />
      </div>

      <div style={{ padding: '16px 0 18px' }}>
        <StatusBanner speaking={speaking} connected={connected} />
      </div>
    </div>
  );
}

// ============================================================
// Ending — brief fade between call-end and wrap-up
// ============================================================
function Ending({
  muted,
  camOn,
  videoRef,
  camReady,
}: {
  muted: boolean;
  camOn: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  camReady: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: '#050505',
        padding: '24px 24px 0',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 18,
          minHeight: 0,
        }}
      >
        <AITile speaking={false} dim />
        <YouTile
          name="You"
          muted={muted}
          camOn={camOn}
          camReady={camReady}
          talking={false}
          dim
          videoRef={videoRef}
        />
      </div>
      <div style={{ height: 80 }} />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.78) 65%, rgba(0,0,0,0.85) 100%)',
          gap: 12,
          animation: 'fadeIn .35s ease',
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.22em',
          }}
        >
          Interview complete
        </span>
        <span
          style={{
            fontSize: 14,
            color: 'var(--muted-foreground)',
            maxWidth: 360,
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          Preparing your evaluation…
        </span>
      </div>
    </div>
  );
}

// ============================================================
// Joining — 5-second countdown overlay on dimmed tiles
// ============================================================
function Joining({
  onEnter,
  muted,
  camOn,
  videoRef,
  camReady,
}: {
  onEnter: () => void;
  muted: boolean;
  camOn: boolean;
  videoRef: RefObject<HTMLVideoElement | null>;
  camReady: boolean;
}) {
  const [n, setN] = useState(5);

  useEffect(() => {
    if (n <= 0) {
      const id = setTimeout(onEnter, 350);
      return () => clearTimeout(id);
    }
    const id = setTimeout(() => setN((v) => v - 1), 1000);
    return () => clearTimeout(id);
  }, [n, onEnter]);

  return (
    <div
      style={{
        flex: 1,
        position: 'relative',
        overflow: 'hidden',
        background: '#050505',
        padding: '24px 24px 0',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      <div
        style={{
          flex: 1,
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 18,
          minHeight: 0,
        }}
      >
        <AITile speaking={false} dim />
        <YouTile
          name="You"
          muted={muted}
          camOn={camOn}
          camReady={camReady}
          talking={false}
          dim
          videoRef={videoRef}
        />
      </div>
      <div style={{ height: 80 }} />

      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
          background:
            'radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0.55) 0%, rgba(0,0,0,0.78) 65%, rgba(0,0,0,0.85) 100%)',
          gap: 14,
        }}
      >
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.22em',
          }}
        >
          Connecting you
        </span>
        <div
          key={n}
          style={{
            fontSize: 140,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            letterSpacing: '-0.04em',
            color: 'var(--foreground)',
            lineHeight: 1,
            animation: 'countdownPop .9s ease-out',
            textShadow: '0 0 60px rgba(220,220,220,0.2)',
          }}
        >
          {n > 0 ? n : '·'}
        </div>
        <span
          style={{
            fontSize: 13,
            color: 'var(--muted-foreground)',
            maxWidth: 360,
            textAlign: 'center',
            marginTop: 6,
            lineHeight: 1.5,
          }}
        >
          Breathe. Look at the camera. Speak like it's the real interview —
          because that's what you're practicing.
        </span>
      </div>
    </div>
  );
}

// ============================================================
// Device check — full pre-flight on /mock/{id} direct nav
// ============================================================
function DeviceCheck({
  onJoin,
  camOn,
  onToggleCam,
  muted,
  onToggleMute,
  isConnecting,
  errorMessage,
  videoRef,
  camReady,
  camError,
}: {
  onJoin: () => void;
  camOn: boolean;
  onToggleCam: () => void;
  muted: boolean;
  onToggleMute: () => void;
  isConnecting: boolean;
  errorMessage: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
  camReady: boolean;
  camError: string | null;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        padding: '40px 32px 32px',
        overflow: 'auto',
        background:
          'radial-gradient(ellipse at 50% 0%, rgba(60,60,60,0.22), transparent 60%), #050505',
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto', width: '100%' }}>
        <div style={{ marginBottom: 20 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: 'var(--muted-foreground)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            Silver.dev · Behavioral mock
          </span>
          <h1
            style={{
              margin: '12px 0 8px',
              fontSize: 36,
              lineHeight: 1.05,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              maxWidth: 720,
            }}
          >
            Ready?{' '}
            <span className="silver-shimmer">You'll see yourself.</span>
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              lineHeight: 1.55,
              color: 'var(--muted-foreground)',
              maxWidth: 620,
            }}
          >
            For the whole interview you'll see your own camera next to the
            interviewer. It's not an accident — it's the part that's hardest in
            the real thing.
          </p>
        </div>

        <div
          style={{
            aspectRatio: '16 / 9',
            maxHeight: 'min(54vh, 480px)',
            borderRadius: 18,
            overflow: 'hidden',
            position: 'relative',
            marginBottom: 22,
          }}
        >
          <YouTile
            name="You"
            muted={muted}
            camOn={camOn}
            camReady={camReady}
            talking={false}
            videoRef={videoRef}
          />
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) auto',
            gap: 24,
            alignItems: 'center',
          }}
        >
          <div
            style={{
              display: 'flex',
              gap: 22,
              alignItems: 'center',
              fontSize: 13,
              color: 'var(--muted-foreground)',
              flexWrap: 'wrap',
            }}
          >
            <DeviceRow icon="mic" label="Default microphone" ok={!muted} />
            <DeviceRow
              icon="cam"
              label={camOn ? (camReady ? 'Camera ready' : 'Awaiting camera') : 'Camera off'}
              ok={camOn && camReady}
            />
            <DeviceRow icon="speaker" label="System speakers" ok />

            <span
              style={{ width: 1, height: 16, background: 'var(--border)' }}
            />

            <button
              type="button"
              onClick={onToggleMute}
              style={pillButton}
            >
              <Icon name={muted ? 'mic-off' : 'mic'} size={12} />
              {muted ? 'Mic muted' : 'Mic on'}
            </button>
            <button
              type="button"
              onClick={onToggleCam}
              style={pillButton}
            >
              <Icon name={camOn ? 'cam' : 'cam-off'} size={12} />
              {camOn ? 'Camera on' : 'Camera off'}
            </button>
          </div>

          <button
            type="button"
            onClick={onJoin}
            disabled={isConnecting}
            style={{
              height: 50,
              padding: '0 26px',
              borderRadius: 12,
              background: '#fff',
              color: '#0c0a09',
              border: 0,
              fontSize: 15,
              fontWeight: 600,
              cursor: isConnecting ? 'wait' : 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              boxShadow: '0 12px 32px rgba(220,220,220,0.16)',
              opacity: isConnecting ? 0.7 : 1,
            }}
          >
            {isConnecting ? 'Connecting…' : 'Join the interview'}
            <Icon name="arrow-right" size={15} />
          </button>
        </div>

        <p
          style={{
            margin: '20px 0 0',
            fontSize: 12,
            color: 'var(--muted-foreground)',
            textAlign: 'left',
            maxWidth: 720,
          }}
        >
          3 behavioral questions · ~20 min · we record audio for evaluation.
          You can stop anytime.
        </p>

        {camError && !camReady && camOn && (
          <p
            style={{
              marginTop: 12,
              fontSize: 12.5,
              color: 'var(--muted-foreground)',
              maxWidth: 520,
            }}
          >
            Camera not available ({camError}). You can still proceed — the
            interview is voice-only.
          </p>
        )}

        {errorMessage && (
          <p
            role="alert"
            style={{
              marginTop: 18,
              fontSize: 13,
              color: 'var(--destructive)',
              lineHeight: 1.5,
            }}
          >
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  );
}

const pillButton: React.CSSProperties = {
  height: 32,
  padding: '0 12px',
  borderRadius: 8,
  background: 'transparent',
  color: 'var(--foreground)',
  border: '1px solid var(--border)',
  fontSize: 12.5,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
};

function DeviceRow({
  icon,
  label,
  ok,
}: {
  icon: IconName;
  label: string;
  ok: boolean;
}) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <Icon name={icon} size={13} />
      {label}
      {ok && (
        <span
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background:
              'color-mix(in srgb, var(--difficulty-easy) 22%, transparent)',
            color: 'var(--difficulty-easy)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Icon name="check" size={9} />
        </span>
      )}
    </span>
  );
}

// ============================================================
// Pre-flight (intro hero) — used by Landing.tsx
// ============================================================
export function PreflightScreen({
  onStart,
  isConnecting,
  errorMessage,
}: {
  onStart: () => void;
  isConnecting: boolean;
  errorMessage: string | null;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        background:
          'radial-gradient(ellipse at 50% 30%, rgba(60,60,60,0.3), transparent 60%), #050505',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 880,
          display: 'grid',
          gridTemplateColumns: '1.1fr 0.9fr',
          gap: 32,
          alignItems: 'center',
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
            Silver.dev · Behavioral practice
          </span>
          <h1
            style={{
              margin: '14px 0 12px',
              fontSize: 38,
              lineHeight: 1.1,
              fontWeight: 700,
              letterSpacing: '-0.02em',
              color: 'var(--foreground)',
            }}
          >
            Ready for your{' '}
            <span className="silver-shimmer">mock interview</span>?
          </h1>
          <p
            style={{
              margin: '0 0 26px',
              fontSize: 15,
              lineHeight: 1.6,
              color: 'var(--muted-foreground)',
              maxWidth: 440,
            }}
          >
            Silver AI runs a ~20-minute behavioral interview with 3 STAR-style
            questions. Camera on so you see yourself the whole time —
            practice like it's the real one.
          </p>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              type="button"
              onClick={onStart}
              disabled={isConnecting}
              style={{
                height: 44,
                padding: '0 22px',
                borderRadius: 10,
                background: '#fff',
                color: '#0c0a09',
                border: 0,
                fontSize: 14,
                fontWeight: 600,
                cursor: isConnecting ? 'wait' : 'pointer',
                fontFamily: 'inherit',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                opacity: isConnecting ? 0.7 : 1,
              }}
            >
              <Icon name="play" size={13} />
              {isConnecting ? 'Connecting…' : 'Start interview'}
            </button>
          </div>

          {errorMessage && (
            <p
              role="alert"
              style={{
                marginTop: 18,
                fontSize: 13,
                color: 'var(--destructive)',
                lineHeight: 1.5,
              }}
            >
              {errorMessage}
            </p>
          )}
        </div>

        <div
          style={{
            position: 'relative',
            aspectRatio: '4 / 3',
            borderRadius: 18,
            overflow: 'hidden',
            border: '1px solid var(--border)',
            background:
              'radial-gradient(circle at 50% 45%, #1c1c1c 0%, #050505 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 30px 80px rgba(0,0,0,0.6)',
          }}
        >
          <AIOrb speaking={false} size={200} />
          <div
            style={{
              position: 'absolute',
              left: 16,
              bottom: 16,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 10px',
              borderRadius: 999,
              background: 'rgba(0,0,0,0.65)',
              backdropFilter: 'blur(8px)',
              border: '1px solid var(--border)',
              fontSize: 11.5,
              color: 'var(--foreground)',
            }}
          >
            <span
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: '#9ca3af',
              }}
            />
            Silver AI · Idle
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Wrap-up
// ============================================================
type EvalState =
  | { kind: 'analyzing' }
  | { kind: 'ready' }
  | { kind: 'failed'; reason: string };

function WrapupScreen({
  sessionId,
  elapsed,
  onRestart,
}: {
  sessionId: string;
  elapsed: string;
  onRestart: () => void;
}) {
  const [state, setState] = useState<EvalState>({ kind: 'analyzing' });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const tick = async () => {
      try {
        const snap = await getSessionStatusAction({ sessionId });
        if (cancelled) return;
        if (!snap) {
          // Session was deleted — stop polling.
          return;
        }
        if (snap.hasEvaluation && snap.evaluationStatus === 'completed') {
          setState({ kind: 'ready' });
          return;
        }
        if (snap.evaluationStatus === 'failed') {
          setState({
            kind: 'failed',
            reason: snap.evaluationError ?? 'Evaluator could not finish',
          });
          return;
        }
      } catch (err) {
        console.warn('[wrapup] status poll failed', err);
      }
      if (cancelled) return;
      timer = setTimeout(tick, 3000);
    };

    tick();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        background:
          'radial-gradient(ellipse at 50% 30%, rgba(60,60,60,0.22), transparent 60%), #050505',
      }}
    >
      <div style={{ width: '100%', maxWidth: 520, textAlign: 'center' }}>
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--muted-foreground)',
            textTransform: 'uppercase',
            letterSpacing: '0.14em',
          }}
        >
          Session ended
        </span>
        <h1
          style={{
            margin: '12px 0 12px',
            fontSize: 38,
            fontWeight: 700,
            letterSpacing: '-0.025em',
            lineHeight: 1.05,
          }}
        >
          {state.kind === 'ready' ? 'Your report is ready.' : 'Nice work.'}
        </h1>
        <p
          style={{
            margin: '0 0 28px',
            fontSize: 15,
            color: 'var(--muted-foreground)',
            lineHeight: 1.6,
          }}
        >
          Total time{' '}
          <span style={{ color: 'var(--foreground)', fontWeight: 600 }}>
            {elapsed}
          </span>
          .
          {state.kind === 'analyzing' && (
            <>
              <br />
              Your evaluation will appear here in under a minute.
            </>
          )}
          {state.kind === 'failed' && (
            <>
              <br />
              We could not produce a full evaluation for this session.
            </>
          )}
        </p>

        {state.kind === 'analyzing' && (
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 999,
              background: 'color-mix(in srgb, var(--card) 70%, transparent)',
              border: '1px solid var(--border)',
              fontSize: 12.5,
              color: 'var(--muted-foreground)',
              marginBottom: 30,
            }}
          >
            <Waveform
              active
              height={14}
              bars={6}
              color="var(--muted-foreground)"
            />
            Analyzing your answers
          </div>
        )}

        {state.kind === 'failed' && (
          <div
            role="alert"
            style={{
              display: 'inline-block',
              padding: '10px 14px',
              borderRadius: 10,
              background:
                'color-mix(in srgb, var(--destructive) 14%, transparent)',
              border:
                '1px solid color-mix(in srgb, var(--destructive) 45%, transparent)',
              fontSize: 12.5,
              color: 'var(--foreground)',
              marginBottom: 30,
              maxWidth: 460,
              textAlign: 'left',
            }}
          >
            <strong style={{ fontWeight: 600 }}>Evaluation failed.</strong>{' '}
            <span style={{ color: 'var(--muted-foreground)' }}>
              {state.reason}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'center', gap: 10 }}>
          {state.kind === 'ready' && (
            <Link
              href={`/results/${sessionId}`}
              style={{
                height: 40,
                padding: '0 18px',
                borderRadius: 10,
                background: '#fff',
                color: '#0c0a09',
                border: 0,
                fontSize: 13.5,
                fontWeight: 600,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                textDecoration: 'none',
                gap: 8,
              }}
            >
              View report
              <Icon name="arrow-right" size={14} />
            </Link>
          )}
          <button
            type="button"
            onClick={onRestart}
            style={{
              height: 40,
              padding: '0 16px',
              borderRadius: 10,
              background: 'transparent',
              color: 'var(--foreground)',
              border: '1px solid var(--border)',
              fontSize: 13.5,
              fontWeight: 500,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Practice again
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// Icons (inline SVG)
// ============================================================
type IconName =
  | 'mic'
  | 'mic-off'
  | 'cam'
  | 'cam-off'
  | 'speaker'
  | 'wifi'
  | 'check'
  | 'play'
  | 'chevron-right'
  | 'arrow-right'
  | 'logout';

function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const paths: Record<IconName, ReactNode> = {
    mic: (
      <>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </>
    ),
    'mic-off': (
      <>
        <line x1="3" y1="3" x2="21" y2="21" />
        <path d="M9 9v2a3 3 0 0 0 5.12 2.12" />
        <path d="M15 9.34V6a3 3 0 0 0-5.94-.6" />
        <path d="M19 11a7 7 0 0 1-.41 2.38" />
        <path d="M12 18.5A7 7 0 0 1 5 11" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </>
    ),
    cam: (
      <>
        <rect x="3" y="6" width="13" height="12" rx="2" />
        <polygon points="16 10 22 6 22 18 16 14" />
      </>
    ),
    'cam-off': (
      <>
        <line x1="3" y1="3" x2="21" y2="21" />
        <path d="M16 16v2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h2" />
        <path d="M11 6h5a2 2 0 0 1 2 2v5" />
        <polyline points="22 8 22 18 17 14" />
      </>
    ),
    speaker: (
      <>
        <polygon points="4 9 8 9 13 4 13 20 8 15 4 15 4 9" />
        <path d="M16 8a5 5 0 0 1 0 8" />
        <path d="M19 5a9 9 0 0 1 0 14" />
      </>
    ),
    wifi: (
      <>
        <path d="M2 8.82a15 15 0 0 1 20 0" />
        <path d="M5 12.86a10 10 0 0 1 14 0" />
        <path d="M8.5 16.43a5 5 0 0 1 7 0" />
        <line x1="12" y1="20" x2="12" y2="20" />
      </>
    ),
    check: (
      <>
        <polyline points="20 6 9 17 4 12" />
      </>
    ),
    play: (
      <>
        <polygon points="6 4 20 12 6 20 6 4" />
      </>
    ),
    'chevron-right': (
      <>
        <polyline points="9 6 15 12 9 18" />
      </>
    ),
    'arrow-right': (
      <>
        <line x1="5" y1="12" x2="19" y2="12" />
        <polyline points="12 5 19 12 12 19" />
      </>
    ),
    logout: (
      <>
        <line x1="6" y1="6" x2="18" y2="18" />
        <line x1="6" y1="18" x2="18" y2="6" />
      </>
    ),
  };
  return <svg {...common}>{paths[name]}</svg>;
}
