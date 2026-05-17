import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

async function main() {
  const conversationId = process.argv[2];
  if (!conversationId) {
    console.error('Usage: pnpm tsx scripts/inspect-conversation.ts <conversation_id>');
    process.exit(2);
  }
  const apiKey = process.env.ELEVENLABS_API_KEY!;
  const res = await fetch(
    `https://api.elevenlabs.io/v1/convai/conversations/${conversationId}`,
    { headers: { 'xi-api-key': apiKey } },
  );
  const body = await res.json();
  const transcript: Array<Record<string, unknown>> = body.transcript ?? [];
  console.log('Top-level keys:', Object.keys(body));
  console.log('Metadata keys:', Object.keys(body.metadata ?? {}));
  console.log('Transcript length:', transcript.length);
  console.log('First turn:', JSON.stringify(transcript[0], null, 2));
  console.log('Sample turn with tools:');
  const toolTurn = transcript.find((t) => t.tool_calls || t.tool_results);
  if (toolTurn) console.log(JSON.stringify(toolTurn, null, 2));
  console.log('Tool-related turns summary:');
  for (const t of transcript) {
    const role = t.role;
    const tc = (t.tool_calls as unknown[]) ?? (t.tool_requests as unknown[]) ?? null;
    const tr = (t.tool_results as unknown[]) ?? null;
    if (tc || tr) {
      console.log({
        secs: t.time_in_call_secs,
        role,
        tool_calls: tc,
        tool_results: tr,
      });
    }
  }
}
main();
