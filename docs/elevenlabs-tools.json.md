# ElevenLabs Agent Tools — JSON to paste

Open the agent in the ElevenLabs dashboard → **Tools** sub-tab → for each
tool click **Add tool** → **Webhook** → switch to **Edit as JSON** mode →
paste the corresponding block below → Save.

Base URL assumed: `https://unsordid-altagracia-condescending.ngrok-free.dev`
(the reserved ngrok domain configured in `~/Library/Application Support/ngrok/ngrok.yml`).
If you change the ngrok URL, update all three blocks.

> **Important schema rule** — for each body property, all of
> `description`, `dynamic_variable`, and `constant_value` must be present
> (the UI form validator requires them), but only **one** can be
> non-empty (the server requires that). The JSON below follows that rule.

---

## Tool 1 of 3 — `get_next_question`

```json
{
  "type": "webhook",
  "name": "get_next_question",
  "description": "Fetches the next behavioral interview question. Call this ONLY at the very start of the interview, or immediately after a record_response call (with no speech between record_response and this call). NEVER call this in the same turn that you asked a question or follow-up — wait for the candidate to answer first. Returns done=true when all questions have been asked, in which case you must immediately call end_interview and thank the candidate. Otherwise returns question_id, question_text, current, and total — ask the question_text naturally to the candidate, then end your turn and wait for their reply.",
  "api_schema": {
    "url": "https://unsordid-altagracia-condescending.ngrok-free.dev/api/agent-tools/get-next-question",
    "method": "POST",
    "path_params_schema": [],
    "query_params_schema": [],
    "request_body_schema": {
      "id": "body",
      "type": "object",
      "description": "Request body containing the interview session ID.",
      "required": true,
      "properties": [
        {
          "id": "session_id",
          "type": "string",
          "description": "",
          "dynamic_variable": "session_id",
          "constant_value": "",
          "value_type": "dynamic_variable",
          "required": true,
          "enum": null
        }
      ],
      "value_type": "llm_prompt"
    },
    "request_headers": [],
    "content_type": "application/json",
    "auth_connection": null
  },
  "response_timeout_secs": 20,
  "dynamic_variables": {
    "dynamic_variable_placeholders": {}
  },
  "assignments": [],
  "disable_interruptions": false,
  "pre_tool_speech": "auto",
  "tool_call_sound": null,
  "tool_call_sound_behavior": "auto",
  "execution_mode": "immediate",
  "tool_error_handling_mode": "auto",
  "response_mocks": []
}
```

---

## Tool 2 of 3 — `record_response`

```json
{
  "type": "webhook",
  "name": "record_response",
  "description": "Closes the current question and records the candidate's full performance on it. Call this ONLY when you are done probing — that means EITHER the candidate's STAR is complete enough OR you have already asked 2 follow-ups AND heard the candidate's reply to the most recent one. NEVER call this in the same turn that you asked a question or follow-up — you must first wait for the candidate to answer. Call exactly once per question, and immediately follow it with get_next_question (no speech in between). Pass your internal STAR assessment (a brief note covering Situation/Task/Action/Result coverage and any gaps) and the number of follow-up questions you asked for this question. Do not call this if get_next_question has not been called yet.",
  "api_schema": {
    "url": "https://unsordid-altagracia-condescending.ngrok-free.dev/api/agent-tools/record-response",
    "method": "POST",
    "path_params_schema": [],
    "query_params_schema": [],
    "request_body_schema": {
      "id": "body",
      "type": "object",
      "description": "Records the candidate's response for the current question along with the agent's internal STAR assessment.",
      "required": true,
      "properties": [
        {
          "id": "session_id",
          "type": "string",
          "description": "",
          "dynamic_variable": "session_id",
          "constant_value": "",
          "value_type": "dynamic_variable",
          "required": true,
          "enum": null
        },
        {
          "id": "question_id",
          "type": "string",
          "description": "The UUID of the question this response is for. Use the question_id returned by the most recent get_next_question call.",
          "dynamic_variable": "",
          "constant_value": "",
          "value_type": "llm_prompt",
          "required": true,
          "enum": null
        },
        {
          "id": "internal_assessment",
          "type": "string",
          "description": "Brief internal note on how well the candidate covered the STAR framework for this question. Mention which components (Situation/Task/Action/Result) were covered or missing, and overall quality. Example: 'Situation and Task clear, Action somewhat vague (used we instead of I), Result missing concrete metrics.' Keep under 300 characters. Never shown to the candidate.",
          "dynamic_variable": "",
          "constant_value": "",
          "value_type": "llm_prompt",
          "required": true,
          "enum": null
        },
        {
          "id": "follow_up_count",
          "type": "integer",
          "description": "How many follow-up questions you asked for this question (0, 1, or 2). Does not include the original question itself.",
          "dynamic_variable": "",
          "constant_value": "",
          "value_type": "llm_prompt",
          "required": true,
          "enum": null
        }
      ],
      "value_type": "llm_prompt"
    },
    "request_headers": [],
    "content_type": "application/json",
    "auth_connection": null
  },
  "response_timeout_secs": 20,
  "dynamic_variables": {
    "dynamic_variable_placeholders": {}
  },
  "assignments": [],
  "disable_interruptions": false,
  "pre_tool_speech": "auto",
  "tool_call_sound": null,
  "tool_call_sound_behavior": "auto",
  "execution_mode": "immediate",
  "tool_error_handling_mode": "auto",
  "response_mocks": []
}
```

> If ElevenLabs rejects `"type": "integer"` for `follow_up_count`, change it to `"type": "string"`. The backend handler uses Zod and coerces it back to a number.

---

## Tool 3 of 3 — `end_interview`

```json
{
  "type": "webhook",
  "name": "end_interview",
  "description": "Marks the interview as completed in the database. Call this ONLY when get_next_question returns done=true. After calling this, thank the candidate warmly in one or two sentences and stop speaking — the conversation will end shortly after.",
  "api_schema": {
    "url": "https://unsordid-altagracia-condescending.ngrok-free.dev/api/agent-tools/end-interview",
    "method": "POST",
    "path_params_schema": [],
    "query_params_schema": [],
    "request_body_schema": {
      "id": "body",
      "type": "object",
      "description": "Request body containing the interview session ID.",
      "required": true,
      "properties": [
        {
          "id": "session_id",
          "type": "string",
          "description": "",
          "dynamic_variable": "session_id",
          "constant_value": "",
          "value_type": "dynamic_variable",
          "required": true,
          "enum": null
        }
      ],
      "value_type": "llm_prompt"
    },
    "request_headers": [],
    "content_type": "application/json",
    "auth_connection": null
  },
  "response_timeout_secs": 20,
  "dynamic_variables": {
    "dynamic_variable_placeholders": {}
  },
  "assignments": [],
  "disable_interruptions": false,
  "pre_tool_speech": "auto",
  "tool_call_sound": null,
  "tool_call_sound_behavior": "auto",
  "execution_mode": "immediate",
  "tool_error_handling_mode": "auto",
  "response_mocks": []
}
```

---

## Post-call webhook (separate, NOT in the Tools tab)

Go to the agent's **Analysis** or **Advanced** sub-tab and find "Post-call webhook":

- **URL**: `https://unsordid-altagracia-condescending.ngrok-free.dev/api/agent-webhook/conversation-ended`
- **HMAC Secret**: `180067e3a652760328a26f85d5036d8ddb032139e01f4eae52df717de082e80c`
  (same value as `ELEVENLABS_WEBHOOK_SECRET` in `.env.local`)
- Include the full transcript and `audio_url` in the payload.

## Agent ID

Copy from the agent header or URL (`…/agents/agent_XXXXX`) into `.env.local`:

```
ELEVENLABS_AGENT_ID=agent_XXXXX
```
