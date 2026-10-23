# For GPT: status and reading list

This page is for GPT and other reviewers. It is updated at the end of each piece of work on the N-ought engine, and published with the workbench at https://n-ought.com/nought-workbench/docs/for-gpt.md (every document below sits beside it).

**Updated:** 2026-10-23.

## Where the engine stands

- **Versions.** Engine 0.4.0 and schema 0.4.0; the private package 0.4.1. PROP-TOP-01, allocation under an unknown top, is at 0.1.0. The work extension (P-WORK-01, P-DEP-01) is at 0.1.0, the backlog extension (P-LOAD-02, tracking only) at 0.1.0, the coupled run (P-COUPLE-01) at contract version 0.1 (attachment and trace 0.1.0), the handover run (P-HANDOFF-01) at contract version 0.1 (attachment and trace 0.1.0), and several works on one part (P-MULTIWORK-01) at contract version 0.1 (attachment and trace 0.1.0) is new.
- **Tests.** 339 engine tests pass, and the 3 package tests. Every historic golden hash is unchanged, and the compiled browser engine gives every golden hash, coupled runs included.
- **Latest work: allocation under an unknown top, PROP-TOP-01 0.1.0** (2026-10-22, James's decision Q3: "same either way"). An engine proposal for partial information, not a CANON rule. See [proposals.md](proposals.md) and [decisions.md](decisions.md).
  - **The case:** a model may leave its top as an information gap. Before this, every draw was refused then, even where nothing depended on the top.
  - **What it does:**
    - **When a draw is stated:** a resource's draw in a step is stated only where the allocation policy gives the same valid result under every candidate top: each part claiming the resource, and a top elsewhere in the boundary, which is one candidate, never a default. Every receipt, every store fill and the unused amount must agree.
    - **Otherwise:** the draw is refused for the top (`unknown-prerequisite $.boundary.top`), and its refusals carry to later steps as before.
    - **Which policies:** only a policy that declares `unknownTop: 'evaluate-admissible-tops'` (deterministic, no side effects) is evaluated so. P-ALLOC-01 declares it, and its rule is unchanged. A policy that reads rank, a missing policy and an undeclared policy are all refused as before.
  - **What it does not do:**
    - **No top is chosen or inferred.** The order and the protected flow stay refused, so a stated draw is never a protected-top allocation.
    - **A known top keeps its path,** with one call and no new record. Every golden hash is unchanged.
  - **With P-ALLOC-01:**
    - **Committed draws that fit:** stated, because decision Q-002 fixes the receipts.
    - **One claimant:** stated.
    - **Two or more claimants whose committed draws exceed what entered:** refused, even where what entered covers every requirement.
  - **Provenance:** each resource record carries `unknownTop`:
    - the candidates and whether each gave a valid result;
    - whether the valid results are identical;
    - whether Q-002 fixed the receipts;
    - the result and the reason.

    The stamp lists PROP-TOP-01.
  - **Layers:** where the top is unknown, the dependency layers are reported as not derived (`rank-underived`), instead of every part being called unreached.
  - **Package:** 0.4.1. The engine and schema versions, which every trace stamp carries, stay 0.4.0, because no known-top output changed. Changed runs are identified by PROP-TOP-01 and its record's version. Nothing is published or tagged.
  - **Tests:** 31 new (tests/top-unknown.test.ts), with the new unknown-top traces pinned by hash. The package's outside consumer reproduces two unknown-top cases from the installed tarball and compiles a policy written without the declaration.
- **Before that: the engine is a distributable package** (2026-10-22). No behaviour changed: no rule, calculation, refusal, proposal or golden trace.
  - **What it is:** the core, the proposals and the draft types, compiled to ES modules with TypeScript declarations by `tsconfig.package.json`. The declarations' relative imports are rewritten from `.ts` to `.js`, as the compiler already does for the JavaScript. It is packed by `npm run package` into `build/nought-engine-<version>.tgz` (now 0.4.1), privately; nothing is published, and there are no release tags yet.
  - **Entry points:** `nought-engine`, `nought-engine/proposals`, `nought-engine/draft` and `nought-engine/package.json`; Node refuses any other path. Node.js 22.18 or later; tested on 24.20.0. ES modules only.
  - **Contents:** the manifest, a README and `dist/` (37 modules, each with its declaration; 76 files). Never CANON or APPLICATION (only their fingerprints), the documents, the fixtures, the tests, the Node adapters, or anything of the institutional record or the mapper. The P-IPF proposals stay disabled.
  - **Tests:** `npm run test:package`, part of `npm run check`, inspects the tarball and installs it into a project outside the repository. That project type-checks under `strict` without `skipLibCheck` and reproduces every golden trace hash (the four core fixtures and every trace of the handover fixtures), equal to the same runs from source. A static test holds the institutional record and the mapper to the entry points the package distributes. Three builds gave the same tarball, byte for byte.
  - **Not yet:** a JSON Schema or document types for model and scenario documents (the exported schema types describe the parsed form), release tags, and a CommonJS build.
- **Before that: P-MULTIWORK-01's first release is implemented.** James approved the WQ-08 scope on 2026-10-21, with three refinements ([decisions.md](decisions.md)). One part may now do several works from one finite productive balance (what is left once upkeep is covered), under an explicitly mapped, dated arrangement: fixed shares (amounts or fractions; unused hours idle or passed on in a stated order) or strict priority. There is no default.
  - **Whole units:** they come only from a declared rule. Otherwise a fractional output of indivisible work is refused.
  - **Unknown arrangement:** each work's results are refused, while the balance, the demand, upper bounds and a lower bound on what is owed are kept where their inputs establish them.
  - **Unused:** without the attachment, every runner and trace is exactly as before.
  - **Documentation:** [proposals.md](proposals.md), [decisions.md](decisions.md), and the handover, sections 2, 3 and 5.
- **Before that: P-HANDOFF-01's first release is implemented.** James approved it in principle on 2026-10-21, with four decisions ([decisions.md](decisions.md)). `runHandoff` lets one account's completions become admissions of an account on another part, same-step or next-step as declared, so a later stage can complete work admitted in earlier steps.
  - **How:** it is built entirely from the unchanged `runCoupled` and `runBacklog`, in a number of passes fixed in advance.
  - **Where:** only where a static analysis finds the arrangement forward-only. Otherwise the handover is refused.
  - **Safeguard:** upstream invariance and conservation are checked after the last pass.
  - **Documentation:** [p-handoff-01-scope.md](p-handoff-01-scope.md) gives the decisions, the implementation result, the corrected figures on the synthetic referral pathway, and the limits. Its semantics and evidence rules are in [proposals.md](proposals.md) and in the handover, sections 2, 3 and 5.
- **Before that: P-COUPLE-01 is implemented** within the v0.3 resolutions. `runCoupled` feeds an account's eligible obligations back, step by step, into one load of its own part, and the existing rules do the rest. [p-couple-01-report.md](p-couple-01-report.md) covers what was built, the tests, the limitations, and what the engine can now demonstrate.
- **The workbench** (https://n-ought.com/nought-workbench/) is an engineering demonstration and does not show coupled runs. Engine work comes first.

## Questions for GPT

Please review the P-MULTIWORK-01 first release against its scope and James's three refinements ([proposals.md](proposals.md) and [decisions.md](decisions.md)), above all:
- whether the lower bound's conditions are complete: known claims and yields, known admissions and balance, no restart once refused;
- whether passing unused hours on once, in a stated order, and the whole-unit rule's "greatest whole number within the limits", are the least that the two first forms need.

Then the P-HANDOFF-01 first release against its approved decisions ([p-handoff-01-scope.md](p-handoff-01-scope.md), "Implementation result"), above all:
- whether the forward-only analysis covers every way a downstream account's admissions can reach its upstream. It follows generated loads, shared resource allocations, levels and the rules reading them, governor bands and switches, P-DEP-01 links and further handovers;
- the provenance limits it states:
  - the base stamp names the runner's own proposals, not P-HANDOFF-01;
  - the backlog records tag derived admissions `input`;
  - the handover trace is the authority on both;
- whether refusing a next-step handover between parts that influence each other, rather than computing it in-loop, is the right limit for a first release.

Points still worth a reviewer's eye, from the P-COUPLE-01 report's limitations:
1. Indivisible obligations meet fractional outputs often. The ledger refuses a fractional completion rather than rounding it, so many coupled loops stay known only for particular numbers.
2. Without P-LOAD-01, Q-016 refuses units after a shortfall, and that refusal now reaches the generated load.

## Reading list

- [p-handoff-01-scope.md](p-handoff-01-scope.md): P-HANDOFF-01, carryable cross-stage handovers: the scope as reviewed, James's decisions, and the first release's result.
- [p-couple-01-report.md](p-couple-01-report.md): the P-COUPLE-01 implementation report.
- [handover-for-gpt.md](handover-for-gpt.md): the engine as built. It has the exported types, verbatim from the compiler, plus the validation rules, step sequence, refusal categories, proposals and open questions. The coupled run is in sections 2, 3 and 5.
- [decisions.md](decisions.md): James's rulings, dated, with what the engine does, and the engine's own implementation choices (P-COUPLE-01's are in its 2026-10-20 entries "design recommendations approved" and "P-COUPLE-01 0.1, authorised and implemented").
- [proposals.md](proposals.md): every non-canonical rule, with its reason.
- [open-questions.md](open-questions.md): the question log, with statuses.
- Reviews: [work-contract-review.md](work-contract-review.md), [dynamic-arrangements-review.md](dynamic-arrangements-review.md), [coupled-feedback-review.md](coupled-feedback-review.md).
- [p-couple-01-scope.md](p-couple-01-scope.md): the coupling's scope, confirmed against the v0.3 resolutions.
- [workbench.md](workbench.md): how to use the workbench.

Not published here: CANON.md and APPLICATION.md (James shares them directly), and the rule register (it quotes CANON in full).
