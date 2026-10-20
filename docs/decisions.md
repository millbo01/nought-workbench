# Decisions

James's answers to the engine's open questions, and his rulings on its proposals, dated, with what the engine does. None of them changes CANON.md, and none is a CANON rule: each is a ruling on how the engine handles something CANON leaves open. Where a ruling is carried out by mapping data, the mechanism is registered as a proposal (docs/proposals.md). The questions themselves stay in docs/open-questions.md, marked answered.

## 2026-10-20

### Answered

- **Q-002. Drawing beyond requirement.**
  - *Decision:* a part draws up to its access, even where that exceeds its requirement.
  - *Engine:* the core checks every allocation policy: where the committed draws (access capped by route) fit within what entered, each part must receive its committed draw, or the result is refused (unspecified allocation policy). P-ALLOC-01 already did this.
- **Q-004. What a short producing part sends.**
  - *Decision:* each level gets a mapping dial for what its producing part sends when short: either "keeps sending", or "stops once the part's shortfall exceeds a stated amount", recorded as never sent. With no dial set, refuse that level rather than guess. Register this as a proposal and set the dial in both fixtures.
  - *Engine:* level field `whenProducerShort`, proposal PROP-SENSE-01. "Stops" states an amount for each resource the producing part requires, and stops when any shortfall in the step before exceeds its amount (PROP-STEP-01 timing). The dial also governs a producing part whose units are unknown only because of an earlier shortfall. With no dial, the level is refused whenever the dial would be needed (the producing part was short, or its units are unknown from a shortfall), and only then. Both fixtures set dials on every level.
- **Q-008. The top's need.**
  - *Decision:* the top's need is its requirement.
  - *Engine:* the protected-flow record reports `need` (the top's requirement for the protected resource) and the top's `shortfall` against it.
- **Q-023. Upkeep and requirement.**
  - *Decision:* upkeep is part of requirement. Requirement is upkeep plus work, and what reaches a part covers upkeep first.
  - *Engine:* each part record adds `workRequirement` (requirement minus upkeep), `upkeepShortfall` and `workShortfall`, which sum to the shortfall. Validation rejects a constant upkeep above a constant requirement. Where rules give an upkeep above the requirement in a step, the split for that step is refused (unknown prerequisite) and the shortfall itself still stands.
- **Q-010. Routes, stores and outside input.**
  - *Decision:* store releases and outside input enter the one shared flow of their resource. Routes run from the shared flow to parts only. A ring-fenced allocation is a built-in access setting on the receiving part. Update the schema and validation to match.
  - *Engine:* a route has no source field other than the shared flow (`"from": "shared-flow"` is accepted and is the only value). A route from a store or an outside input is rejected at validation with that guidance; a route from a part still is (C3.4a). The run-time refusal for such routes is gone.
- **Q-017. Parts with no dependency path to the top.**
  - *Decision:* a part with no dependency path to the top sits in the bottom layer. If such a part keeps its access while higher-ranked parts are cut, flag it in the trace.
  - *Engine:* the bottom layer is the deepest layer reached from the top (at least layer 1); its position within it is as documented at mapping (PROP-RANK-01). Flag `unreached-part-kept-access`, per resource per step: the part receives its full committed draw and its access is not lower than in the step before, while a part ranked above it is cut (receives less than its committed draw, or has lower access than in the step before).

- **Q-016. Unit loss and rebuilding: the P-LOAD-01 form.**
  - *Decision:* James approves the form as written in proposals.md: loss from uncovered upkeep; the largest loss across resources; rebuilding paid after stores fill; shared in proportion; fractional units. It stays disabled by default and is enabled per run only when a scenario asks for it.
  - *Engine:* a scenario enables it with `"enable": ["P-LOAD-01"]`, and only P-LOAD-01 can be enabled that way. In such a run, a part with both dials (unit loss and rebuild) loses and rebuilds units by the approved form. A part with one dial has its units refused (unknown prerequisite). A part with neither is refused after a shortfall, as before. Damage is still refused (its dial is undefined). The fixture variant `organisation-unit-loss` enables it.

### Keep current handling (stay open)

Q-005, Q-006, Q-009, Q-011, Q-012, Q-013, Q-018, Q-019, Q-020, Q-021, Q-022, Q-025, Q-026: the current handling and proposals stay as they are.

### Parked for later phases

- Q-001 (the draw proposal stays a proposal), Q-003, Q-007, Q-014, Q-015, Q-024: no change.
- Q-016: a simplest form for the unit-loss and rebuild dials was proposed under P-LOAD-01 for James to approve; approved later the same day (above).

## 2026-10-20: work extension (P-WORK-01, P-DEP-01)

Sources: "N-ought Functional Work and Dependencies Contract" v0.2 (approved), the review of it against commit 9efd916 (docs/work-contract-review.md), and the "Work Contract Review Resolution" v0.3, which James approved with the review's seven amendments. Together they are the contract at revision 0.3, the version the two proposals carry. The approved texts are "N-ought_Work_Contract_Review_Resolution_v0.3_APPROVED.md", which records James's approval of all 13 resolutions, and "N-ought_Functional_Work_and_Dependencies_Contract_v0.2_APPROVED.md" (2026-10-20). James's approval in the project conversation added the review's seven amendments and non-negative loads; where the v0.3 wording leaves a choice, the amendments are what was built (handover, section 3, "The work extension against its approved documents"). Both are optional modelling proposals, not CANON laws. An ordinary dependency stays rank-only. IPF stays disabled, and nothing here adds backlog, deterioration or an allocation rule.

### Approved by James

- **The proposals.** P-WORK-01 (useful-work conversion) and P-DEP-01 (a functional cap on an existing dependency) are approved as optional proposals (contract decisions D-1 and D-2).
- **First-release scope (D-3, D-4).** One work type per part; links that are same-step, acyclic and non-exclusive only; each link matches an existing dependency. The attachment may declare a lag above 0 or finite shared support ("exhaustible support"), and the calculation refuses them explicitly (unsupported rule); it never runs them as a lag of 0 or as non-exclusive.
- **1. Terms.** `referenceOutput`, `referenceOutputRule` and `workNotDone` replace the contract's target, target rule and output deficit, everywhere: proposal, types, tests and text. A reference output is a documented work benchmark or an externally given workload reference. It is not a governor band, a part's demand or a PAM requirement, and it never defaults from reported output or from available resource.
- **2. Unsupported features.** As in the scope above.
- **3. P-LOAD-01.** The work extension may run over a base run that enables P-LOAD-01. It reads the units at the start of each step from the trace (`StepRecord.units`), never the model's starting count, and does not compute or adjust unit loss or rebuilding. Refused units refuse a per-unit capacity, and not the independent resource readings. Fractional units are carried as the already-modelled quantity (unit equivalents under P-LOAD-01), not read as a fraction of a person.
- **4. Upkeep.** Every recipe resource needs a stated upkeep rule for that part, 0 where that is the case. The work extension reads `PartRecord.remainderForWork` and never treats a missing upkeep as 0.
- **5. Known zeros.** In a structurally valid attachment every term that limits output is 0 or more. A known 0 among the terms of a minimum, or a known 0 factor in yield times resource-limited output, proves the result is 0 even when another term is refused. Dividing by a positive recipe amount or ratio keeps a 0.
  - A known 0 overrides a refused *value*: a gap, a refused base value, or a refused upstream output, whatever refused it upstream. It never overrides an unsupported rule on the record's own work or its own incoming links: several work types on the part, the part in a same-step cycle, or an incoming link with a lag above 0 or declared as exhaustible support. An invalid attachment never runs at all.
  - So a part downstream of a cycle, whose own capacity is a known 0, has output 0: its own link is supported and only that link's value is missing.
  - `workNotDone` is computed only where the reference output is known: it is the reference output less the output, where both are known; where the output is proven 0, it is the reference output.
  - The binding report is refused where the output is refused. Where the output is known, it lists the terms known to equal it, and separately the terms that are refused (unresolved).
  - Tests: a known 0 reference output, capacity, yield, available resource and enabling cap, each beside a refused independent term.
  - This is a rule of P-WORK-01 and P-DEP-01, not of CANON.
- **6. Reference-output rules.** The data forms of the existing constant, linear and table rules, on the mapped part's own declared loads. For this release they must be non-negative and non-decreasing. That restriction belongs to P-WORK-01 only, not to Q-009 or to the definition of a part's requirement, and is to be reviewed separately before the rule family is widened. A computed reference output below 0 is refused (unsupported rule); with loads required to be non-negative (below), a valid document cannot produce one, and the refusal stays as a guard.
- **7. Capacity and efficiency dials.** In a work run the attachment is the only source of capacity and yield. `Part.capacity` and `Part.efficiency` (DRAFT) stay unread and are marked superseded in the comment above them, in the 0.4.0 migration commit. They stay in schema 0.4.0; any removal is a separate, explicit deprecation, never a silent deletion.
- **8. Several work types on one part.** The affected work calculations are refused (unsupported rule, P-WORK-01); other parts' work and every PAM value are kept. This is a scope refusal of the first release, not a claim that a part does one kind of work.
- **9. Refusals.** The core's seven categories are reused, with no new category. Refusal ids the work extension creates start `work/`. Refusals carried from the base trace keep their ids, as provenance, and proposal-specific reasons name their proposal.
- **10. Binding.** An attachment names `Model.id` and the exact `RunStamp.mapping.sha256` of the model it was mapped against. Any change to the model needs a review of the attachment; it never attaches to another revision.
- **11. The series lookup.** `seriesAt` moves unchanged into a small exported pure core module, used by both the core run and the work extension, in its own commit after the migration and before any work code, with the golden hashes confirmed unchanged by it.
- **12. Version 0.4.0.** The mismatch is confirmed: 9efd916 added `Scenario.enable` (a scenario using it is rejected by the engine before 9efd916, which also read schema 0.3.0), added the trace fields `lost`, `rebuilt` and `rebuilding`, and made P-LOAD-01 run, without a version change.
  - One migration commit, before any work code, sets the engine and the schema to 0.4.0, so the golden hashes change once. The fixtures' `schemaVersion` fields change with it, so the model and scenario digests in each stamp change too. The engine reads only 0.4.0 documents, since 0.3.0 now has two meanings.
  - The 0.3.0 hashes are kept in tests/golden/history/0.3.0.json with the four stamp fields that change (engine version, schema version, model digest, scenario digest). A permanent test puts those fields back to their 0.3.0 values and gets the 0.3.0 hashes exactly: the before-and-after comparison, showing nothing else moved. After that, the work extension leaves the 0.4.0 baseline unchanged, and no golden file is rewritten to make a failing test pass.
- **13. Fixtures.** Finite IT tickets used by both finance and scheduling are not mapped as non-exclusive. One fixture gives a justified non-exclusive enabling example (a quantified availability of IT support's systems, with its work units and ratios explained). A separate fixture declares finite shared support and shows the unsupported-rule refusal. Neither relationship becomes a resource route. The fixture numbers are illustrative, for James to review.
- **Loads are non-negative.** A load value in a scenario below 0 is rejected at validation (`[negative]`), as inflow and outside input already are; an explicit gap stays allowed. This applies to every run, not only to work runs, and is part of schema 0.4.0. It closes a gap the review found: a linear requirement rule on a negative load gave a negative requirement, checked neither at validation nor in the run.

### Proposal details (P-WORK-01 and P-DEP-01, contract revision 0.3)

- Per part `p`, step `t` and recipe resource `r`: available = `remainderForWork[p, r, t]`; recipe limit = available / recipe amount; resource-limited output = the least recipe limit; pre-dependency output = the least of reference output, capacity, and yield × resource-limited output; actual output = the least of pre-dependency output and every enabled link's cap; work not done = reference output less actual output, never below 0.
- A link from A to B caps B at A's actual output / ratio, where the ratio is A's work units per B's work unit. Nothing is deducted from A, and A's output is not divided between its dependants.
- Capacity is a constant (with a rationale saying why it does not depend on the unit count) or a per-unit amount times the units at the start of the step. Yield is a stated fraction in [0, 1] of the mapped recipe. A missing value is a stated gap, refused, never 0 or 1.
- Work quantities are in each work's own unit, never a resource unit. No work value changes the base trace, and no work value becomes a sensed level.

### Implementation choices (the engine's, not rulings)

- `runWork(modelDoc, scenarioDoc, attachmentDoc, options)` validates the attachment against the model and its digest, runs the unchanged `run()` once, and computes the work trace from that trace alone through the pure `workFromTrace`. It returns both traces. Without an attachment nothing is computed.
- Links are evaluated in dependency order, ties by id; the members of a same-step cycle are found first and refused, and the rest are ordered without them.
- A work run's own versions: the work extension 0.1.0, the attachment format 0.1.0, both proposals at 0.3.
- A part that sets its own access has no part or unit record in the base trace, so its resource term and any per-unit capacity are refused as a separate case (Q-014).
- Work fixtures have their own golden file (tests/golden/work-hashes.json), so the base golden file is never touched by work changes.

## 2026-10-20: P-LOAD-02, tracking only

Source: "Nought_Engine_P-LOAD-02_Tracking_Only_Implementation_Handoff_v0.1_APPROVED.md", approved by James on 2026-10-20, after the read-only review of the Q-028 and P-LOAD-02 design (docs/dynamic-arrangements-review.md). P-LOAD-02 is an optional, application-level proposal, not a CANON law and not an eighth component. IPF stays disabled; Q-028 and the snapshot semantics are unchanged.

### Approved by James

- **Scope.** One tracked account per part and work, of eligible, carryable obligations; completions read one to one from P-WORK-01's actual output, behind the reference-output guard; withdrawals of 0 only, asserted; tracking only, with no feedback into any load, requirement, reference output, draw, unit count, P-LOAD-01 or level.
- **No fractional closures (D-01).** A fractional modelled completion never closes indivisible obligations: it is refused, never rounded.
- **Input integrality.** An indivisible account's opening balance and admissions are whole counts.
- **Admissions** follow the engine's series rule: an entry holds in every step until replaced. They are new admissions per step, never earlier backlog.
- **No restart.** A refused balance refuses every later balance; no observed count restarts it.
- **Source binding.** The attachment names the model and the work attachment by ids, version and digests, so one mapping serves every scenario of that model; each run's base and work trace hashes are checked and recorded in the backlog trace, not in the attachment.
- **Evidence labels** per central claim (documented, estimated, assumed or unknown): an assumed or estimated claim gives a labelled, conditional result; an unknown essential claim refuses what depends on it.
- **The acceptance tests T01 to T20 and the stop conditions** of the handoff.
- **P-LOAD-01's backlog dial** stays a dormant legacy field, never read.

### Proposal details (P-LOAD-02 0.1)

- Per account and step: B_t the opening balance (B_0 as mapped), N_t the new admissions, D_t = B_t + N_t, R_t and O_t the work record's reference and actual output unchanged, C_t = O_t where every guard holds, W_t = 0, B_{t+1} = D_t - C_t - W_t, so that B_t + N_t = C_t + W_t + B_{t+1} in exact rationals.
- Guards: the essential claims are known; D_t, R_t and O_t are known; R_t <= D_t; not D_t = 0 with O_t above 0; a whole O_t for an indivisible account.

### Implementation choices (the engine's, within the handoff)

- **The five central claims** are eligibility, closure, withdrawals, the opening balance and admissions, all treated as essential. An unknown eligibility, closure or withdrawal claim refuses completions (and so the closing balance), while the opening balance, admissions and eligible obligations stand. An unknown opening-balance or admissions claim refuses that count, as a gap would.
- **Integrality** is checked at validation: an indivisible account with a fractional opening balance or admission is rejected before any run (the handoff allows a rejection or a refusal).
- **Every guard is evaluated**, and every failure is reported. A positive output with nothing eligible always also breaks the reference guard (the output never exceeds the reference output), so both are reported.
- **No known-zero rule in the ledger:** decision 5 of the work extension covers work output only.
- **Belonging together:** `backlogFromTraces` checks the engine and schema (0.4.0) and work (0.1.0) versions, that the work trace's recorded base hash is the base trace's hash, the model and work-attachment bindings, the step counts and the units. A mismatch is a ConfigurationError, never a silently accepted ledger.
- **No conflict with the existing stamps:** the work stamp already records its base trace's hash, and the backlog stamp adds the work trace's hash, so no per-run manifest is needed.
- **Diagnostics** per record from a fixed list: inherited-work-refusal, unknown-ledger-input, closure-guard, indivisible-fractional-closure, conditional-evidence.
- **Refusal ids** created by the ledger are `backlog/<category> <subject>`, naming P-LOAD-02; the core's categories are reused (unknown-prerequisite for unknown inputs and claims, unsupported-rule for the closure guards).
- **Versions:** backlog extension 0.1.0, attachment format 0.1.0, P-LOAD-02 0.1; engine and schema stay 0.4.0, and the base and work golden hashes are unchanged. Backlog golden hashes have their own file.

## 2026-10-20: P-COUPLE-01 (coupled backlog feedback), design recommendations approved

Source: the read-only architecture review of "Nought Engine: P-LOAD-02 Coupled Feedback, Approved Design Scope and Read-Only Review Handoff" v0.2 (docs/coupled-feedback-review.md), whose ten recommendations James approved. The handoff's approved active-workload rule (its section A) stands: an account whose whole eligible balance is substantiated as active workload may supply G_t = D_t = B_t + N_t to exactly one declared load of matching unit, which then has that one source; the existing requirement rule turns it into any resource requirement. Nothing here changes CANON, and coupling is a proposal, not a law. The work goes in steps that leave every existing result unchanged; the coupling itself waits until its scope is confirmed against the approved v0.3 design resolutions.

### Approved by James

1. **Identity.** Coupling is a proposal of its own, P-COUPLE-01.
2. **Own part only.** A binding names a load declared on the account's own part.
3. **Unsupported claims.** A binding whose active-workload claim is unknown or unsupported is rejected at validation. (The original wording added "the load then stays the scenario's, and the account is tracked only"; the v0.3 resolutions withdraw that as a fallback: the attempted coupled run is invalid. See below.)
4. **Marking coupled runs.** A coupled base trace names P-COUPLE-01 in `stamp.proposals`, and a reading of a generated load is tagged `computed`, never `input`.
5. **Replay.** A coupled run replayed through the unchanged runner, with its generated loads stated in an effective scenario, gives equal numbers and the same refused values; byte equality is not expected (stamps, tags and refusal ids differ by design).
6. **Reach of a refusal.** A refused balance may, through mapped rules, refuse a part's load-dependent requirement for the rest of the run, and a resource's draw where a setting reads a level of the bound load. Validation flags a level on a bound load.
7. **Static guard.** A reference-output rule reading the bound load that cannot keep R_t <= D_t (a linear rule needs base 0 and a coefficient of at most 1) is flagged at validation. (The review asked whether as a flag or an error and called it worth a flag; recorded as a flag.)
8. **Versions.** The engine stays 0.4.0 through the steps that leave existing results unchanged.
9. **Authorised:** the internal step function of the core run, the per-step adaptation of P-WORK-01 with a load lookup, and the optional exclusive-load parameter of scenario validation.
10. **Sensing.** A level measuring a bound load senses that step's generated load, as for any load (the generated load is fixed before the step). (The review asked this as a question; recorded as the existing timing.)

### Implementation choices (the engine's)

- **The step function** is `startRun` in src/core/run.ts: a cursor whose `step(t)` computes step t (in order, each once) and whose `finish()` returns the trace; `runValidated` drives it. It is exported from its module for the proposals layer, not from src/index.ts, so the package's entry points do not offer it.
- **The work step function** is `startWork` in src/proposals/work/run-work.ts: a cursor taking base steps in order (`step`), describing the refusals it has noted (`describe`), and finishing against the finished base trace (`finish`). It reads refusal descriptions through a lookup rather than a finished base trace, and a load through an optional load source before the scenario series. `workFromTrace` drives it, so its results are unchanged. Exported from its module, not from the proposals entry point.
- **The ledger step function** is `startBacklog` in src/proposals/backlog/ledger.ts: a cursor with `eligible(account)` (D_t = B_t + N_t for the step about to be taken, before its work is known, recording nothing), `step(workStep)` (the closure, unchanged) and `finish(base, work)`. It reads inherited refusals through a lookup. `backlogFromTraces` keeps its checks and drives it, so its results are unchanged. Exported from its module, not from the proposals entry point.
- **Core hooks**, inert unless used and never used by `run()`: `step(t, { loads })` reads a given load before the scenario series (requirements and load-measuring levels alike), and a level reading of a given load is tagged `computed`; `finish({ proposals })` lists proposals that shaped the run from outside it; `describe(id)` gives a refusal noted so far; `validateCoupledScenario(doc, model, suppliedLoads)` (internal; the public `validateScenario` is unchanged) requires a supplied load to have no series (`[load-supplied]`) and skips `[load-missing]` for it.

## 2026-10-20: P-COUPLE-01, the v0.3 design resolutions

Source: "Nought_Engine_Coupled_Feedback_Review_Resolutions_v0.3_APPROVED.md", whose ten design rulings (CF-D01 to CF-D10) James approved, with its scope confirmations (its section F). They govern P-COUPLE-01 alongside the v0.2 coupled-feedback handoff; CANON prevails. They are design rulings, not authorisation: the coupled coordinator, its attachment and its trace need a separate, express authorisation (its section E, third gate). Where they differ from the recorded readings above, they govern.

### Approved by James (CF-D01 to CF-D10)

- **CF-D01.** P-COUPLE-01 at contract version 0.1, depending on P-LOAD-02 0.1 and the work extension, enabled only by its own coupled-run entry point; P-LOAD-02 keeps meaning tracking only.
- **CF-D02.** One load on the account's own part; exact unit; no load with two owners, no account with two loads; no cross-part generation.
- **CF-D03.** An unknown active-workload claim makes the attempted coupled run invalid at validation: no fallback to the scenario's loads, no zero, no claim that coupling happened (see F.4 below). An estimated or assumed claim is allowed as a conditional simulation, its evidence grade carried in the coupling stamp and trace and in any presentation of results; if that cannot be shown in the exported results, implementation stops.
- **CF-D04.** A coupled base trace names P-COUPLE-01 in `stamp.proposals`; a level's reading of a generated load is tagged `computed`, while what it sends and what is delivered still follow the producing part's and the route's rules. `computed` names the value's origin, not knowledge by the governor.
- **CF-D05.** Replay through the unchanged runners is judged on equal known figures and the same refused fields; the effective scenario's digest is labelled derived, never presented as an external input; expected differences (stamps, tags, hashes, some refusal ids) are explained and tested.
- **CF-D06.** A refused generated load may refuse what the mapped rules make depend on it (a requirement, a reference output, a sensed load, a draw through a setting or policy); nothing independent is refused. **New:** an explicit preflight impact diagnostic (what reads the bound load) and a refusal-path trace. A level measuring the bound load is allowed, not forbidden. An unknown balance stays unknown; no restart.
- **CF-D07.** The runtime guard R_t <= D_t stays authoritative. A validation flag, never an error, where a rule can be shown to exceed eligible demand; R = a + b × G with a = 0 and b <= 1 is proven safe, and anything else is flagged without being rejected.
- **CF-D08.** Engine and schema stay 0.4.0 through preparations that leave every output byte identical; the proposal, attachment and trace carry their own versions; a semver and API assessment comes before any new public entry point or any change to an exported validator's signature.
- **CF-D09.** Three bounded preparations: an internal one-step PAM extraction, private to the package; a P-WORK-01 step evaluator with a supplied load lookup; a shared one-step ledger closure with a narrowly scoped, coupling-only exclusive-source validation path. The ordinary run still requires every declared load.
- **CF-D10.** Same-step sensing of a generated load only through an already-mapped level, with its producing part, route and sending behaviour; without one, the governor observes no backlog; delayed reporting is unsupported in this version.

### Scope confirmations (section F)

1. This is the v0.3 resolutions document.
2. An active-workload claim applies across every step of the coupled run; it is never re-inferred step by step.
3. G_0 = B_0 + N_0; step-0 completions affect B_1 only.
4. Rejection at validation means the attempted coupled run is invalid; a tracking-only run is a separate, user-invoked operation with its own complete scenario. The earlier wording "the load then stays the scenario's" (recommendation 3 above) is withdrawn: it is not an automatic fallback.
5. A generated load is computed under a mapped assertion, not sensed.

### Reconciliation of the preparations already made

The four preparations (startRun, startWork, startBacklog and the core hooks) were made under the instruction of 2026-10-20 to proceed in staged, test-preserving increments. Against the v0.3 gates: every historic golden hash is unchanged; the ordinary run is unchanged; no step function is on a package entry point (`package.json` exports only `.`, `./proposals` and `./draft`, and none of them re-exports the cursors); no rule was added; Q-028 is untouched. One departure from CF-D08 was found and corrected: the core-hooks step had given the exported `validateScenario` an optional third parameter. Its public signature is restored exactly, and the coupling-only path is now the internal `validateCoupledScenario`, so no exported signature changes and no semver assessment is needed.
