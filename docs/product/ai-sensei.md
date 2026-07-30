# AI Sensei

Status: post-MVP landscape placeholder established; detailed planning deferred

## Release posture

AI Sensei is accounted for in the product landscape but is not part of the initial MVP. No further feature definition, interaction design, persistence design, or technical selection is required until it is deliberately scheduled for a later phase.

## Role

AI Sensei is Zenbu Japanese's in-app, Japanese-specialized contextual LLM chat.

The learner can open it directly for an open-ended Japanese or language question. Other Product Experiences can also offer **Ask Sensei**, carrying the current word, kanji, phrase, sentence, translation, analysis result, or selected media context into the conversation.

AI Sensei owns contextual question-and-answer conversation. It is not a course engine, a duplicate of Dojo, or an isolated generic chatbot with no awareness of the rest of Zenbu.

## Domain-specialized behavior

The product should feel unusually relevant and knowledgeable about Japanese because Zenbu owns the LLM application layer around the model. Domain quality may come from:

- app-owned instructions and prompt composition
- explicit context supplied by the originating Product Experience
- Japanese-specific reference data, retrieval, or tools
- structured multi-step behavior when a task requires it
- traceable prompt and model revisions
- Japanese-domain quality evaluations
- promotion of bad real outputs into regression fixtures

This requirement does not select a particular model, provider, retrieval system, prompt framework, or agent architecture during the product-landscape pass.

The later technical design should follow some kind of created application architecture.

Here is a previous architecture design reference for an example/clarification of what this might entail:

- `/Users/devin/dev/repos/serp/docs/standards/llm-application-architecture.md`

## Product boundaries

- AI Sensei can be entered directly or through a contextual handoff.
- The originating Product Experience owns what it sends; AI Sensei owns the resulting conversation.
- Context must be visible and understandable to the learner rather than silently inventing an unrelated hidden profile.
- Dojo remains the possible home of structured study; AI Sensei remains conversational.

## Historical evidence

The previous prototype includes a first-class Sensei chat surface and historical planning for contextual handoffs:

- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/docs/product/future/ai-sensei.md`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/app/src/features/sensei/`
- `/Users/devin/dev/repos/github@zenbujapanese/prototypes/japanese-app-v2/_archive/nextjs-app/`

These are reference evidence, not the new project's complete specification or architecture.

## Deferred discovery

When AI Sensei is scheduled after MVP, define its first-version boundary, contextual handoffs, history and memory behavior, permitted app context, and Japanese-domain quality evaluations.
