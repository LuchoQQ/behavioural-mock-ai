import { notFound } from 'next/navigation';
import { z } from 'zod';
import { ResultsView } from '@/components/ResultsView';
import { getSessionWithEvaluation } from '@/lib/sessions';

const ParamsSchema = z.object({ sessionId: z.string().uuid() });

type Params = Promise<{ sessionId: string }>;

export const dynamic = 'force-dynamic';

export default async function ResultsPage({ params }: { params: Params }) {
  const resolved = await params;
  const parsed = ParamsSchema.safeParse(resolved);
  if (!parsed.success) notFound();

  const session = await getSessionWithEvaluation(parsed.data.sessionId);
  if (!session) notFound();

  return <ResultsView session={session} backHref="/" />;
}

export function generateMetadata() {
  return { title: 'Interview results' };
}
