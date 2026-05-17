import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

import { createHmac } from 'node:crypto';

const LOCAL_URL =
  process.env.WEBHOOK_REPLAY_URL ?? 'http://localhost:3000/api/agent-webhook/conversation-ended';

async function main() {
  const conversationId = process.argv[2];
  if (!conversationId) {
    console.error('Usage: pnpm tsx src/db/replay-webhook.ts <conversation_id> [session_id_override]');
    process.exit(1);
  }
  const sessionOverride = process.argv[3];

  const apiKey = process.env.ELEVENLABS_API_KEY;
  const secret = process.env.ELEVENLABS_WEBHOOK_SECRET;
  if (!apiKey) throw new Error('ELEVENLABS_API_KEY missing');
  if (!secret) throw new Error('ELEVENLABS_WEBHOOK_SECRET missing');

  console.log(`Fetching conversation ${conversationId} from ElevenLabs…`);
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
    { headers: { 'xi-api-key': apiKey } },
  );
  if (!res.ok) {
    throw new Error(`EL API ${res.status}: ${await res.text()}`);
  }
  const conv = (await res.json()) as Record<string, unknown>;

  if (sessionOverride) {
    const cicd =
      (conv.conversation_initiation_client_data as Record<string, unknown> | undefined) ??
      {};
    const dv = (cicd.dynamic_variables as Record<string, unknown> | undefined) ?? {};
    conv.conversation_initiation_client_data = {
      ...cicd,
      dynamic_variables: { ...dv, session_id: sessionOverride },
    };
    console.log(`Injected session_id override: ${sessionOverride}`);
  }

  const envelope = {
    type: 'post_call_transcription',
    event_timestamp: Math.floor(Date.now() / 1000),
    data: conv,
  };
  const body = JSON.stringify(envelope);

  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = createHmac('sha256', secret).update(`${ts}.${body}`).digest('hex');
  const headerValue = `t=${ts},v0=${sig}`;

  console.log(`POSTing replay to ${LOCAL_URL} (${body.length} bytes)…`);
  const r = await fetch(LOCAL_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'elevenlabs-signature': headerValue,
    },
    body,
  });
  const text = await r.text();
  console.log(`-> ${r.status}`);
  console.log(text);
}

main().catch((err) => {
  console.error('Replay failed', err);
  process.exit(1);
});
