'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import {
  createSession,
  createSimulatedSession,
  deleteSession,
  getSessionStatus,
  type SessionStatusSnapshot,
} from '@/lib/sessions';

export async function startInterviewAction(): Promise<void> {
  const { id } = await createSession({ candidateName: null, candidateEmail: null });
  redirect(`/mock/${id}?autostart=1`);
}

export async function simulateInterviewAction(): Promise<void> {
  await createSimulatedSession();
  revalidatePath('/');
}

const DeleteInput = z.object({ sessionId: z.string().uuid() });

export async function deleteSessionAction(input: { sessionId: string }): Promise<void> {
  const parsed = DeleteInput.parse(input);
  await deleteSession(parsed.sessionId);
  revalidatePath('/');
}

const StatusInput = z.object({ sessionId: z.string().uuid() });

export async function getSessionStatusAction(input: {
  sessionId: string;
}): Promise<SessionStatusSnapshot | null> {
  const parsed = StatusInput.parse(input);
  return getSessionStatus(parsed.sessionId);
}
