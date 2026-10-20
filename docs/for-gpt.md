# For GPT: status and reading list

This page is for GPT and other reviewers. It is updated at the end of each piece of work on the N-ought engine, and published with the workbench at https://n-ought.com/nought-workbench/docs/for-gpt.md (every document below sits beside it).

**Updated:** 2026-10-20.

## Where the engine stands

- **Versions.** Engine 0.4.0 and schema 0.4.0. The work extension (P-WORK-01, P-DEP-01) is at 0.1.0, the backlog extension (P-LOAD-02, tracking only) at 0.1.0, and the coupled run (P-COUPLE-01 at contract version 0.1, attachment and trace 0.1.0) is new. The package is at 0.2.0.
- **Tests.** 257 pass. Every historic golden hash is unchanged, and the compiled browser engine gives every golden hash, coupled runs included.
- **Latest work: P-COUPLE-01 is implemented** within the v0.3 resolutions. `runCoupled` feeds an account's eligible obligations back, step by step, into one load of its own part, and the existing rules do the rest. [p-couple-01-report.md](p-couple-01-report.md) covers what was built, the tests, the limitations, and what the engine can now demonstrate.
- **The workbench** (https://n-ought.com/nought-workbench/) is an engineering demonstration and does not show coupled runs. Engine work comes first.

## Questions for GPT

None open. Points worth a reviewer's eye, from the report's limitations:
1. Indivisible obligations meet fractional outputs often. The ledger refuses a fractional completion rather than rounding it, so many coupled loops stay known only for particular numbers.
2. Without P-LOAD-01, Q-016 refuses units after a shortfall, and that refusal now reaches the generated load.

## Reading list

- [p-couple-01-report.md](p-couple-01-report.md): the P-COUPLE-01 implementation report.
- [handover-for-gpt.md](handover-for-gpt.md): the engine as built. It has the exported types, verbatim from the compiler, plus the validation rules, step sequence, refusal categories, proposals and open questions. The coupled run is in sections 2, 3 and 5.
- [decisions.md](decisions.md): James's rulings, dated, with what the engine does, and the engine's own implementation choices (P-COUPLE-01's are in the last section).
- [proposals.md](proposals.md): every non-canonical rule, with its reason.
- [open-questions.md](open-questions.md): the question log, with statuses.
- Reviews: [work-contract-review.md](work-contract-review.md), [dynamic-arrangements-review.md](dynamic-arrangements-review.md), [coupled-feedback-review.md](coupled-feedback-review.md).
- [p-couple-01-scope.md](p-couple-01-scope.md): the coupling's scope, confirmed against the v0.3 resolutions.
- [workbench.md](workbench.md): how to use the workbench.

Not published here: CANON.md and APPLICATION.md (James shares them directly), and the rule register (it quotes CANON in full).
