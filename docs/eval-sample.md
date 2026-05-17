# Sample Evaluator Run

Generated from session `e2bbfd9e-98ca-4ecc-8cd2-6a4250ade02f` (candidate: Luciano Sanchez).
ElevenLabs conversation: `conv_3101krstjvbjer6rxekgx74nbfhh`.
Rubric version: `v1`.
Evaluator model: `anthropic('claude-sonnet-4-6')` via `generateObject` (temperature 0.3, schema = `FinalEval`).

---

## 1. Prompt sent to the LLM

This is the EXACT prompt produced by `buildEvaluatorPrompt(...)` (`src/lib/prompts/evaluator.ts`) using the 3 real transcripts from the DB.

```text
You are an experienced technical recruiter evaluating a candidate's
performance on a behavioral screening interview for a US-based software
engineering role. Produce a structured per-answer evaluation following the
schema you are given.

DO NOT PENALIZE the candidate for any of the following:
- Non-native English: grammar errors, accent, word choice, hesitation.
  Many candidates are ESL (Spanish, Portuguese, etc.).
- Speech-to-text artifacts: minor transcription errors are expected.
  Read for meaning, not literal text.
- Length: a concise, complete answer scores the same as a long one with
  the same content.

DO PENALIZE:
- Missing STAR components (Situation, Task, Action, Result).
- Vague answers without concrete details (names, numbers, dates, tools).
- "We did" framing when the question is about THEIR contribution.
- Lack of quantified impact when the situation calls for it.
- Red-flag behaviors: badmouthing employers, taking undue credit, evading
  specifics when probed, no self-reflection on failures, rambling without
  structure.

PER-ANSWER 4-TIER SCORE (`score` field, applied to every question):
- "strong_no":  multiple critical STAR components missing OR clear red flag
                (e.g. badmouthing, evasion) OR no audible answer.
- "no":         one critical STAR component missing OR one notable red flag.
- "yes":        all four STAR components present with specifics; would pass
                a real screening.
- "strong_yes": rich and specific (numbers, names, dates), clear personal
                ownership ("I" not "we"), quantified impact, zero red flags.

STAR PER-COMPONENT SCALE (`star_completeness` field):
- "missing": candidate did not address this component at all.
- "vague":   candidate referenced it but without concrete detail.
- "clear":   candidate provided specific, concrete information.

RED FLAGS vs GREEN FLAGS:
Per-question `red_flags` / `green_flags` are `{ id, label, note }` cards
that anchor to a flagged segment of the answer. Patterns are scoped to
one answer — there is no session-level flag layer.

LABEL VOCABULARY (closed list — picked from the bounded set below; if
no label fits, omit the flag rather than invent a new one):
- Red:   "badmouthed_employer", "took_undue_credit", "no_self_reflection",
         "rambled_no_structure", "evasive_on_specifics", "blamed_others",
         "we_focused_throughout", "no_quantified_impact_when_warranted".
- Green: "clear_ownership", "quantified_impact", "concrete_artifacts",
         "strong_self_reflection", "well_structured_star",
         "honest_about_tradeoffs", "constructive_conflict".

WORD/PHRASE IMPROVEMENTS (`word_improvements`):
For each question, pick up to 8 of the candidate's actual phrases that
would land better with a recruiter-grade rewording. For each item:
- `original_phrase`: the candidate's exact phrase (or close paraphrase
  if STT garbled it).
- `suggested_rewording`: a concrete recruiter-grade alternative.
- `reason`: one short line explaining why the rewording is stronger
  (e.g. "shifts from passive 'we' to active 'I', and adds the metric").

Produce these improvements in the SAME LANGUAGE the candidate used. If
the candidate mixed languages, default to English.

REVIEWER NOTES (`reviewer_notes`):
A 3–6 sentence overall qualitative summary of the candidate's interview
style, the dominant strengths, and the dominant gaps. This text will be
shown to the Silver.dev team — be specific and actionable, not generic.

NOTES will be shown to candidates and recruiters. Be honest, specific,
and constructive. Avoid generic praise or generic criticism.

NOW EVALUATE THESE 3 ANSWERS:

QUESTION 1 of 3 (id: 226ed0aa-3cbf-43d2-817b-d5e6363e4831):
Tell me about a project of yours that failed.

CANDIDATE ANSWER (full transcript, may contain STT artifacts):
Sure, let's go!
I wouldn't call it a complete failure, but I had to significantly refine my initial approach on a project for the biggest airline of Fletch in America. I was the main back-end developer building a provider evaluation platform from scratch and we needed a dynamic questionnaire system where different providers would get different questions based on their profile. My initial database design treated questionnaires as a monolithic unit and as requirements evolved, I realized this approach couldn't handle the flexibility we needed. Mixing templates, updating questions independently, tracking different states per provider, I had to step back and redesign the whole structure. I ended up creating a component-based architecture, questionnaires made of templates, templates made of sections, sections made of questions. It was like building blocks that could be mixed and matched. The redesign took me an extra hour for a week, but I act, but the final system was much more flexible and scalable. It taught me to invest more time understanding how data will evolve
Well it was an internal tool for the company but... The results were less time wasted for the team that created questions and easy template selection for the vendors.
---

QUESTION 2 of 3 (id: 331638fd-b79a-4e56-b294-9884656e2b6b):
Tell me about the hardest challenge that you ever faced.

CANDIDATE ANSWER (full transcript, may contain STT artifacts):
I can tell you about a time I had a reduced churn on an e-commerce platform with over 300,000 active subscriptions and 10,000 daily orders.
Well, I was working as a backend developer for Shopify integration. When the company was being acquired, they proposed a cloud migration and in the process of made over the last, pipelines got broken and suddenly we had a flood of angry merchants complaining about checkouts that never completed. So I did research and I discovered a pattern in the database. In a specific span of times where things went wrong and robots were needed, a lot of corrupted data in contracts and users, hundreds of failing attempts being created in the loop, and a lot of desynchronization with data between payment provider and Shopify. So I fixed this data by creating backfill scripts from scratch that run in production, write conditions with a lot of manual testing, creating some new migration for the TV and a lot of bug fixing. At the end I reduced transaction errors from 0.05 to 0.01 and protected around 22000 in monthly revenue.
---

QUESTION 3 of 3 (id: 5fa4c293-9fe0-4b1c-843b-b6645f0f44c9):
How did you handle disagreement with a colleague or leadership?

CANDIDATE ANSWER (full transcript, may contain STT artifacts):
Well, I can tell you about a time I disagreed with a product owner about a deadline.
I worked as a full-stack developer on the number one App Store app in the US and Canada for new parents. So million of downloads, thousands of active subscriptions, and one day we got an easy but urgent task launch our Valentine's Day discount campaign by Wednesday. We had three days to launch a Valentine's Day campaign which I felt wasn't enough time to do it safely. Instead of just pushing back, I proposed a plan. Prioritize web-first since that were most traffic came from. I'd improve our Lambda functions to handle high traffic. The PO agreed and we launched on time. Handled two times normal traffic and got hundreds of new subscriptions. I learned to choose my battles and focus on protecting revenue.
Bye-bye.
---

Produce a complete FinalEval object covering every question above. Do
not output any prose outside of the structured object.
```

---

## 2. Structured response (`FinalEval`)

The LLM was forced to emit JSON matching the `FinalEval` Zod schema (`src/lib/schemas/evaluation.ts`). What follows is the raw object stored in `evaluations.payload` for this session.

```json
{
  "per_question": [
    {
      "notes": "Solid answer with good technical specificity and clear personal ownership. The main gap is the result component — the candidate trails off and offers only qualitative benefits with no metrics. The reflexive reframing of 'failure' as 'refinement' is a minor yellow flag but not disqualifying given the genuine self-reflection that follows.",
      "score": "yes",
      "red_flags": [
        {
          "label": "reframed_failure",
          "description": "Candidate immediately hedged with 'I wouldn't call it a complete failure,' which softens the self-reflection the question is designed to elicit and may signal difficulty owning setbacks."
        },
        {
          "label": "no_quantified_impact_when_warranted",
          "description": "The result is described qualitatively ('less time wasted', 'easy template selection') with no numbers — e.g. no estimate of hours saved, reduction in support tickets, or delivery timeline impact."
        }
      ],
      "green_flags": [
        {
          "label": "clear_ownership",
          "description": "Candidate consistently used 'I' when describing the redesign decision and execution, making personal accountability clear."
        },
        {
          "label": "concrete_artifacts",
          "description": "Described a specific architectural pattern (component-based: questionnaires → templates → sections → questions) that demonstrates real technical depth."
        },
        {
          "label": "strong_self_reflection",
          "description": "Explicitly stated the lesson learned: 'invest more time understanding how data will evolve,' showing genuine retrospective thinking."
        }
      ],
      "question_id": "226ed0aa-3cbf-43d2-817b-d5e6363e4831",
      "question_text": "Tell me about a project of yours that failed.",
      "star_completeness": {
        "task": "clear",
        "action": "clear",
        "result": "vague",
        "situation": "clear"
      },
      "word_improvements": [
        {
          "reason": "Removes the defensive hedge and reframes the story as a genuine learning moment, which is what interviewers are looking for.",
          "original_phrase": "I wouldn't call it a complete failure",
          "suggested_rewording": "This project taught me one of my most important engineering lessons — my initial design failed to meet evolving requirements."
        },
        {
          "reason": "Likely an STT artifact; clarifying the geography makes the client context credible and impressive.",
          "original_phrase": "the biggest airline of Fletch in America",
          "suggested_rewording": "the largest airline in Latin America"
        },
        {
          "reason": "The original phrasing is ambiguous and confusing; the rewrite communicates the cost of the rework clearly.",
          "original_phrase": "The redesign took me an extra hour for a week",
          "suggested_rewording": "The redesign added roughly one extra week of engineering work"
        },
        {
          "reason": "Removes the STT artifact and delivers the positive outcome cleanly.",
          "original_phrase": "I act, but the final system was much more flexible",
          "suggested_rewording": "The final system was significantly more flexible and scalable"
        },
        {
          "reason": "More specific framing of the business value; ideally add a percentage or hour estimate.",
          "original_phrase": "less time wasted for the team that created questions",
          "suggested_rewording": "reduced question-authoring time for the content team by eliminating redundant rework"
        },
        {
          "reason": "Adds a business-outcome framing rather than a purely functional description.",
          "original_phrase": "easy template selection for the vendors",
          "suggested_rewording": "streamlined template selection for vendors, reducing onboarding friction"
        }
      ]
    },
    {
      "notes": "This is the strongest answer in the session. The candidate demonstrates real technical depth (backfill scripts, payment provider desync, Shopify integration) and backs it up with hard numbers. The task component is slightly vague — it's not fully explicit whether the candidate was formally assigned this or self-directed — but this is a minor gap. The STT artifacts are the main readability issue, not the content.",
      "score": "strong_yes",
      "red_flags": [
        {
          "label": "we_focused_throughout",
          "description": "The action section mixes 'I' and 'we' ('pipelines got broken', 'robots were needed') making it slightly unclear which parts of the fix were solely the candidate's work."
        }
      ],
      "green_flags": [
        {
          "label": "quantified_impact",
          "description": "Candidate provided specific, impressive metrics: 300,000 active subscriptions, 10,000 daily orders, error rate reduced from 0.05% to 0.01%, and ~$22,000 in protected monthly revenue."
        },
        {
          "label": "concrete_artifacts",
          "description": "Named specific technical tools and approaches: backfill scripts, database migrations, payment provider desync debugging, and Shopify integration — all concrete and verifiable."
        },
        {
          "label": "clear_ownership",
          "description": "Used 'I did research', 'I discovered', 'I fixed', 'I reduced' — strong first-person ownership throughout the action and result."
        },
        {
          "label": "well_structured_star",
          "description": "Despite some STT noise, the answer flows naturally through situation (acquisition/migration), action (backfill scripts, bug fixes), and result (quantified error reduction and revenue protection)."
        }
      ],
      "question_id": "331638fd-b79a-4e56-b294-9884656e2b6b",
      "question_text": "Tell me about the hardest challenge that you ever faced.",
      "star_completeness": {
        "task": "vague",
        "action": "clear",
        "result": "clear",
        "situation": "clear"
      },
      "word_improvements": [
        {
          "reason": "The original phrasing is awkward and passive; the rewrite leads with the impact and sets up the story confidently.",
          "original_phrase": "I can tell you about a time I had a reduced churn",
          "suggested_rewording": "I'll describe a critical incident where I prevented significant churn on an e-commerce platform"
        },
        {
          "reason": "Cleans up the STT artifact and delivers the situation crisply.",
          "original_phrase": "in the process of made over the last, pipelines got broken",
          "suggested_rewording": "during the cloud migration, several data pipelines broke"
        },
        {
          "reason": "Likely an STT artifact for 'retries'; the rewrite uses precise technical language.",
          "original_phrase": "robots were needed",
          "suggested_rewording": "automated retry jobs were triggering"
        },
        {
          "reason": "More precise and professional framing of the technical problem.",
          "original_phrase": "a lot of corrupted data in contracts and users",
          "suggested_rewording": "widespread data corruption across subscription contracts and user records"
        },
        {
          "reason": "'TV' is almost certainly an STT artifact; the rewrite clarifies the technical action.",
          "original_phrase": "creating some new migration for the TV",
          "suggested_rewording": "writing new database migrations to correct the schema"
        },
        {
          "reason": "Adding the percentage unit and the relative improvement makes the metric land harder with a recruiter.",
          "original_phrase": "I reduced transaction errors from 0.05 to 0.01",
          "suggested_rewording": "I reduced the transaction error rate from 0.05% to 0.01% — an 80% improvement"
        },
        {
          "reason": "Adding the currency symbol and 'recurring' clarifies the business impact and sounds more polished.",
          "original_phrase": "protected around 22000 in monthly revenue",
          "suggested_rewording": "protected approximately $22,000 in monthly recurring revenue"
        }
      ]
    },
    {
      "notes": "Good structure and clear personal ownership, but the disagreement itself is too frictionless — the PO simply agreed, so the candidate never had to truly navigate conflict. The result is also under-quantified for a platform of this scale. To score strong_yes, the candidate should either pick a story with real pushback or add specific subscription/revenue numbers to this one.",
      "score": "yes",
      "red_flags": [
        {
          "label": "no_quantified_impact_when_warranted",
          "description": "'Hundreds of new subscriptions' is vague for a platform with millions of downloads and thousands of active subscriptions — a specific number or revenue figure would be expected here."
        },
        {
          "label": "shallow_disagreement_story",
          "description": "The disagreement was resolved quickly and without real friction — the PO simply agreed. The answer doesn't demonstrate how the candidate navigated pushback or conflict, which is the core of the question."
        }
      ],
      "green_flags": [
        {
          "label": "clear_ownership",
          "description": "Candidate used 'I proposed', 'I'd improve', making their individual contribution to the resolution explicit."
        },
        {
          "label": "honest_about_tradeoffs",
          "description": "Acknowledged the time constraint was real and proposed a scoped solution (web-first) rather than demanding more time, showing pragmatic engineering judgment."
        },
        {
          "label": "strong_self_reflection",
          "description": "Closed with a concrete lesson: 'choose my battles and focus on protecting revenue' — a mature, business-aware takeaway."
        },
        {
          "label": "concrete_artifacts",
          "description": "Named a specific technical action (improving Lambda functions for high traffic) and a specific context (number one App Store app in US and Canada), adding credibility."
        }
      ],
      "question_id": "5fa4c293-9fe0-4b1c-843b-b6645f0f44c9",
      "question_text": "How did you handle disagreement with a colleague or leadership?",
      "star_completeness": {
        "task": "clear",
        "action": "clear",
        "result": "vague",
        "situation": "clear"
      },
      "word_improvements": [
        {
          "reason": "Consolidates the impressive context details into one punchy sentence rather than spreading them across the answer.",
          "original_phrase": "the number one App Store app in the US and Canada for new parents",
          "suggested_rewording": "the top-ranked parenting app in the US and Canada App Store, with millions of downloads and thousands of active subscriptions"
        },
        {
          "reason": "Calling it 'easy' undersells the challenge; the rewrite sets up the tension more effectively.",
          "original_phrase": "we got an easy but urgent task",
          "suggested_rewording": "we received an urgent request that seemed straightforward on the surface"
        },
        {
          "reason": "Cleans up the STT artifact and sounds more polished.",
          "original_phrase": "that were most traffic came from",
          "suggested_rewording": "which accounted for the majority of our traffic"
        },
        {
          "reason": "More specific and action-oriented; naming AWS adds technical credibility.",
          "original_phrase": "I'd improve our Lambda functions to handle high traffic",
          "suggested_rewording": "I optimized our AWS Lambda functions to handle the anticipated traffic spike"
        },
        {
          "reason": "'Aligned with' implies genuine persuasion rather than passive agreement, which better answers the disagreement question.",
          "original_phrase": "The PO agreed and we launched on time",
          "suggested_rewording": "The product owner aligned with the plan and we shipped on schedule"
        },
        {
          "reason": "More precise and professional; 'without degradation' adds the quality dimension.",
          "original_phrase": "Handled two times normal traffic",
          "suggested_rewording": "The system handled 2x our normal peak traffic without degradation"
        },
        {
          "reason": "Prompts the candidate to replace the vague 'hundreds' with an actual number, which would make this a strong_yes answer.",
          "original_phrase": "got hundreds of new subscriptions",
          "suggested_rewording": "drove over [X] new paid subscriptions during the campaign window"
        },
        {
          "reason": "The casual sign-off undermines the professional tone of an otherwise solid answer.",
          "original_phrase": "Bye-bye.",
          "suggested_rewording": "(omit — end with the lesson learned)"
        }
      ]
    }
  ],
  "reviewer_notes": "The candidate presents as a technically credible backend/full-stack engineer with real experience on high-scale production systems. The standout answer is Q2, which is nearly recruiter-grade: specific metrics, clear personal ownership, concrete technical actions, and quantified business impact ($22K MRR protected, 80% error rate reduction). The main recurring gap is inconsistent quantification — Q1 and Q3 trail off into qualitative results despite the candidate clearly having access to numbers. A second pattern worth probing: the candidate tends to reframe adversity (a failure becomes a 'refinement'; a conflict resolves without pushback), which may indicate discomfort with vulnerability in interviews rather than a lack of real experience. Recommend probing Q3 with a follow-up: \"Was there a time the stakeholder pushed back on your proposal?\" to test conflict-navigation depth. Overall, this candidate would pass a screening for a mid-to-senior backend role, but should be coached to lead with metrics and own difficult moments more directly before advancing to technical rounds."
}
```
