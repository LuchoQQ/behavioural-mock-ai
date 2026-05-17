# ElevenLabs Agent Setup

This app expects an ElevenLabs Conversational AI agent that calls into our
backend via tool webhooks and posts the final transcript to our webhook.
The agent itself is configured in the ElevenLabs dashboard — not in code.

## 1. Create the agent

1. Sign up / log in at <https://elevenlabs.io>.
2. Go to **Agents** → **Create a new agent**.
3. **Name**: `Silver Mock Interviewer`.

## 2. Connect Claude as the LLM

1. **LLM** → **Custom LLM**.
2. Provider: **Anthropic**.
3. Model: `claude-sonnet-4-6`.
4. Paste your `ANTHROPIC_API_KEY` (the same one you put in `.env`).

## 3. Voice

Pick a professional English voice. `Brian` or `Adam` work well.

## 4. First message

> Hi, thanks for taking the time today. I'm going to ask you a few
> behavioral questions, similar to what you'd get in a real screening.
> Take your time with each answer. Ready to start?

## 5. System prompt

Open `src/lib/prompts/interviewer.txt` in this repo and paste its full
content into the agent's **System prompt** field. Keep the two in sync
when iterating.

## 6. Dynamic variables

In the agent's **Dynamic Variables** section, declare:

| Variable     | Type   | Description                              |
|--------------|--------|------------------------------------------|
| `session_id` | string | Passed in from the React widget at start |

## 7. Tools

The agent needs three tool webhooks. Use a public URL — either your
deployed Vercel URL (e.g. `https://your-app.vercel.app`) or an ngrok
tunnel for local dev (`ngrok http 3000` → use the `https://*.ngrok-free.app`
URL).

### `get_next_question`
- **Method**: POST
- **URL**: `${PUBLIC_BASE_URL}/api/agent-tools/get-next-question`
- **Body**: `{ "session_id": "{{session_id}}" }`
- **Description**: Returns the next behavioral question, or `{ "done": true }`
  if all 5 have been asked.

### `record_response`
- **Method**: POST
- **URL**: `${PUBLIC_BASE_URL}/api/agent-tools/record-response`
- **Body**:
  ```json
  {
    "session_id": "{{session_id}}",
    "question_id": "{{question_id}}",
    "internal_assessment": "{{internal_assessment}}",
    "follow_up_count": {{follow_up_count}}
  }
  ```
- **Parameters the agent fills in**: `internal_assessment` (string),
  `follow_up_count` (integer).

### `end_interview`
- **Method**: POST
- **URL**: `${PUBLIC_BASE_URL}/api/agent-tools/end-interview`
- **Body**: `{ "session_id": "{{session_id}}" }`

## 8. Post-call webhook

1. In the agent settings, find **Post-call webhook**.
2. URL: `${PUBLIC_BASE_URL}/api/agent-webhook/conversation-ended`.
3. Generate (or copy) the **shared secret**. Put it in `.env` as
   `ELEVENLABS_WEBHOOK_SECRET`.
4. Make sure the webhook is configured to include `audio_url` and the
   full transcript in the payload.

## 9. Copy the agent ID

From the agent page, copy the agent ID into your `.env` file:

```
ELEVENLABS_AGENT_ID=agent_xxx
```

## 10. Local development

If you are developing locally:

```bash
ngrok http 3000
```

Use the printed `https://*.ngrok-free.app` URL as `${PUBLIC_BASE_URL}` in
every webhook above. The URL changes on each ngrok restart — update the
agent's tool/webhook URLs each time, or use a static ngrok domain.
