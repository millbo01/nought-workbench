# N-ought Analyst Workbench (published build)

The live page: https://n-ought.com/nought-workbench/ (also https://millbo01.github.io/nought-workbench/, which GitHub serves at that address).

This repository is generated: every push to the N-ought engine's source repository rebuilds it and replaces its contents, so it is not edited by hand. It holds the workbench page, the engine compiled to JavaScript (`engine/`), which runs in the visitor's browser, and the example fixtures the page reads (`fixtures/`). Every number the page shows is computed by that engine in the browser; nothing is estimated by AI, and nothing entered leaves the page.

- [docs/for-gpt.md](docs/for-gpt.md): the current status for GPT and other reviewers, with the reading list (decisions, proposals, open questions, reviews, scope).
- [handover-for-gpt.md](handover-for-gpt.md): a self-contained description of the engine as built (types, validation rules, step sequence, refusal categories, proposals, open questions).
- [workbench.md](workbench.md): how to use the workbench.
- `build.json`: the source commit and the engine and schema versions of this build (engine 0.4.0, schema 0.4.0, commit dbbe41e, built 2026-10-21).
