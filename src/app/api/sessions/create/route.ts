import { z } from 'zod';
import { env } from '@/lib/env';
import { createSession } from '@/lib/sessions';

const BodySchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

export async function POST(req: Request) {
  try {
    env();
    const json = await req.json().catch(() => ({}));
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) {
      return Response.json({ error: 'invalid_body', issues: parsed.error.issues }, { status: 400 });
    }

    const { id } = await createSession({
      candidateName: parsed.data.name ?? null,
      candidateEmail: parsed.data.email ?? null,
    });
    return Response.json({ sessionId: id }, { status: 201 });
  } catch (err) {
    console.error('[api/sessions/create] failed', { err });
    return Response.json({ error: 'internal_error' }, { status: 500 });
  }
}
