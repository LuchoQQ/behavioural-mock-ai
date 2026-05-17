import { notFound } from 'next/navigation';
import { z } from 'zod';
import { InterviewWidget } from '@/components/InterviewWidget';
import { env } from '@/lib/env';

const ParamsSchema = z.object({ sessionId: z.string().uuid() });

type Params = Promise<{ sessionId: string }>;
type SearchParams = Promise<{ autostart?: string }>;

export default async function MockSessionPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParams;
}) {
  const resolved = await params;
  const parsed = ParamsSchema.safeParse(resolved);
  if (!parsed.success) notFound();

  const { autostart } = await searchParams;
  const { ELEVENLABS_AGENT_ID } = env();

  return (
    <InterviewWidget
      agentId={ELEVENLABS_AGENT_ID}
      sessionId={parsed.data.sessionId}
      autoStart={autostart === '1'}
    />
  );
}
