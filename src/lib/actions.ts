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

const StartInput = z
  .object({
    camOn: z.boolean(),
    muted: z.boolean(),
  })
  .optional();

export async function startInterviewAction(input?: {
  camOn: boolean;
  muted: boolean;
}): Promise<void> {
  const parsed = StartInput.parse(input);
  const { id } = await createSession({ candidateName: null, candidateEmail: null });
  const params = new URLSearchParams({ autostart: '1' });
  if (parsed && !parsed.camOn) params.set('cam', '0');
  if (parsed?.muted) params.set('mic', '0');
  redirect(`/mock/${id}?${params.toString()}`);
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
