import { Landing } from '@/components/Landing';
import { listSessions } from '@/lib/sessions';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const sessions = await listSessions();
  return <Landing sessions={sessions} />;
}
