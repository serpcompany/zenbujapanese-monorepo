# AI Hero development-system research

Research supporting the Wayfinder decision [Define the testing and verification strategy](https://github.com/serpcompany/zenbujapanese-monorepo/issues/19). Consulted 2026-08-01. Sources are limited to first-party AI Hero material by Matt Pocock.

## Conclusion

The current Wayfinder work should settle the **testing strategy as a decision**, not prescribe future implementation-ticket fields or concrete interfaces. Matt's system gives each phase a distinct job:

```text
foggy effort
  -> wayfinder decision tickets
  -> settled map
  -> to-spec (behaviours, testing decisions, agreed seams)
  -> to-tickets (executable tracer-bullet slices with blocking edges)
  -> implement (drives TDD)
  -> code-review
```

The appropriate decision now is therefore: adopt risk-based verification; require the later spec to agree the smallest number of high, durable public test seams using the deep-module vocabulary; execute concrete behaviours through TDD once implementation begins; and run architecture improvement periodically after real code and change history exist.

## Decision tickets are not implementation tickets

`wayfinder` is an upstream shaping process for work too large and foggy to specify directly. Its tickets settle questions; they are explicitly not slices of a build, and its output is decisions rather than deliverables. Once the fog clears, the map normally hands off to `to-spec`, rather than directly to implementation. Source: [The `/wayfinder` skill](https://www.aihero.dev/skills-wayfinder).

`to-spec` converts the settled understanding into a build specification. That specification includes independently checkable user behaviours, implementation decisions already made, testing decisions, the seams at which the feature will be tested, and what “done” means. Before writing, it sketches deep-module opportunities and proposes as few test seams as possible, preferring existing seams and the highest useful seam, then checks those choices with the human. Source: [The `/to-spec` skill](https://www.aihero.dev/skills-to-spec).

`to-tickets` then converts that settled specification into **implementation tickets**. Each is an independently verifiable tracer-bullet vertical slice through the necessary layers and declares its blocking edges. Those executable tickets are therefore a later artifact with a different purpose from Wayfinder's decision tickets. Source: [The `/to-tickets` skill](https://www.aihero.dev/skills-to-tickets).

The sources do not require every implementation ticket to repeat or invent a seam. `implement` assumes that the specification is settled and the seams have already been agreed; it executes rather than reopening those decisions. Source: [The `/implement` skill](https://www.aihero.dev/skills-implement).

## Where TDD and seams fit

TDD belongs inside implementation, when a concrete behaviour is ready to build. `implement` drives `tdd`; the latter works one behaviour at a time through vertical red-green slices—one failing test, just enough implementation to pass it, then the next behaviour. Tests target public interfaces so internal refactors do not move the test surface. If behaviour is still unsettled, Matt directs the workflow back to specification first. Source: [The `/tdd` skill](https://www.aihero.dev/skills-tdd).

This means a Wayfinder testing-strategy decision can govern the later process—risk posture, verification layers, and the requirement to agree durable public seams—without naming concrete methods or protocol types prematurely.

## Where codebase design fits

`codebase-design` is the shared vocabulary beneath planning and implementation, not a refactoring procedure. It defines a deep module as substantial behaviour behind a small interface at a clean seam, and treats the interface as the test surface. It also cautions against speculative seams: one adapter indicates only a hypothetical seam; two adapters demonstrate real variation. `to-spec`, `tdd`, and architecture improvement all use this vocabulary. Source: [The `/codebase-design` skill](https://www.aihero.dev/skills-codebase-design).

Accordingly, deep-module and seam principles should inform the present strategy and the later spec, while exact interfaces wait until the relevant behaviour and code context are known.

## Where architecture improvement fits

`improve-codebase-architecture` is periodic upkeep over an existing, changing codebase. It inspects recent development hotspots for shallow modules and proposes evidence-based deepening opportunities, then grills through a selected candidate. Matt describes it as a recurring health check rather than a step in the feature-delivery chain. Source: [The `/improve-codebase-architecture` skill](https://www.aihero.dev/skills-improve-codebase-architecture).

For a greenfield native app with little or no implementation history, this skill should not be used to invent speculative module interfaces. Run it after implementation produces real modules, friction, and change history. Use `codebase-design` earlier when the problem is deciding the shape of a known interface.

## Recommended wording for the current decision

> Use risk-based verification. When the cleared Wayfinder map is converted into a specification, use the deep-module vocabulary to agree the smallest number of high, durable public test seams and define independently checkable behaviours and completion criteria. Build each executable tracer-bullet ticket through `implement`, which drives one red-green TDD slice at a time. Run architecture improvement periodically once real code and development history can reveal evidence-based deepening opportunities.

This keeps the current ticket at decision level while carrying the intended engineering discipline into the phases where concrete seams and executable tickets belong.
