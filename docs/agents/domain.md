# Domain documentation

The root [`CONTEXT.md`](../../CONTEXT.md) is the domain glossary. Do not grow it as project setup or codebase documentation.

When a real terminology conflict is resolved and misunderstanding it would cause a product or architectural mistake, record the term in `CONTEXT.md`. Keep each definition to the minimum needed to distinguish that term. Product flows, implementation details, provider behavior, and speculative concepts belong elsewhere.

Record an ADR under `docs/adr/` only when a decision is difficult to reverse, surprising without context, and the result of a genuine tradeoff. Read relevant ADRs before changing the architecture. Read `CONTEXT.md` when the task uses its terms.
