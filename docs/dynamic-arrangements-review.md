# Review: Dynamic Arrangements (Q-028) and Backlog Dynamics (P-LOAD-02), v0.3

**Date:** 2026-10-20
**Reviewed:** "Nought Engine: Dynamic Arrangements (Q-028) and Backlog Dynamics (P-LOAD-02)", v0.3 REVIEW.
**Against:** millbo01/nought-engine at commit `f99b9baf6fbd901acea95a5a772093be61d123cd`: engine 0.4.0, schema 0.4.0, 164 tests passing.
**Status:** a read-only design review, not an implementation. No code, golden hash, CANON.md or APPLICATION.md was changed to produce it, and it adds no theoretical rule. Two behaviours were confirmed with scratch runs outside the repository; they are marked below.
**Outcome:** James approved the tracking-only P-LOAD-02 handoff v0.1 on 2026-10-20, and it is implemented (docs/decisions.md, P-LOAD-02). Q-028 candidate C, the step-function extraction and coupled feedback remain unauthorised; the questions below on them stay open.

## Short answer

- **Snapshots** are already derived inside the run; nobody constructs them by hand. But the trace does not record what an arrangement contains, and bands sit outside the arrangement.
- **Tracking-only P-LOAD-02** can run on today's work traces with no core change.
- **Backlog feedback** needs a reusable per-step function. That means extracting it from one long function, which is feasible and provable by unchanged golden hashes.
- **Candidate C** is a versioned change of meaning. Its band-revision part would change computed results, not just labels.

## 1. Repository state

- **Commit:** `f99b9baf6fbd901acea95a5a772093be61d123cd` on `main`, matching origin, clean.
- **Versions:** engine 0.4.0 and schema 0.4.0; work extension 0.1.0.
- **Tests:** `npm run check` gives 164 passed, 0 failed.
- **Handover:** the 0.4.0 handover is current; its test checks the types section word for word and passes.

## 2. Are snapshots derived from execution?

Yes, in the sense the spec means: there is no snapshot input anywhere.

- **How:** the run keeps one arrangement: the declared mode, the held levels, the settings, and the rank positions (`src/core/run.ts:71`).
  - At each step boundary it applies interventions in the order the scenario lists them, then threshold switches.
  - It then compares the arrangement at the step's start with the result (`src/core/run.ts:487`, with the comparison in `classify` at `src/core/run.ts:85`).
  - Only the net change at a boundary produces a record. Intermediate arrangements within one step produce none, and changes that cancel each other produce no snapshot.
- **State changes never start a snapshot:** loads, inflow, stores, sensed values and the numbers a rule gives never enter `classify`. So Q28-01, Q28-02 and Q28-09 already hold.

There are three limits:

1. **The trace records only an arrangement id per step**, not what the arrangement contains, so snapshots can't be re-derived from a finished trace. The id is also unreliable. An intervention that changes nothing gives later steps the id `m0~step1`, while the snapshot keeps `m0`, and the stamp's `modesUsed` lists `m0~step1` (confirmed by a scratch run).
2. **Bands live outside the arrangement** (`src/core/run.ts:231`). Moving one only raises a `band-moved` flag and starts no snapshot (`src/core/run.ts:320`; Q-018, pinned by a test in tests/modes.test.ts).
3. **The model's declared "modes" are really arrangements.** In the organisation baseline, `pressure` differs from `normal` only in its settings. The engine correctly labels the move an arrangement revision, but still reports `pressure` as the snapshot's mode and in `modesUsed`.

## 3. What candidate C would require

**Arrangement identity**

- Bands, including any held value, become part of the arrangement.
- Each step records an arrangement digest. A snapshot is then simply a run of steps with the same digest, and can be re-derived from the trace.
- The mode's identity (held levels plus declared order) is reported separately from the declared mode or arrangement id.
- The id comes from the arrangement's content, which fixes the drift in limit 1.

**Band revisions**

- **Persistence:** bands are model-wide today, and a moved band survives a later mode change, because nothing resets it. If bands are part of the arrangement, switching mode would restore the model's bands, unless James rules that the revision carries over.
- **Results change:** an intervention that changes the arrangement suppresses threshold switches in its own step (PROP-STEP-01, `src/core/run.ts:444`).
  - A band-only move does not suppress them today: in a scratch run the switch still fired in the step where the band moved.
  - Under candidate C it would, unless that rule is narrowed. A switch could then fire a step later, so candidate C changes numbers, not only labels.

**Mode classification: what the engine knows, and what it would refuse**

- **Known:** the held-level set and the rank positions (both declared, under PROP-RANK-01), the setting ids, and the bands.
- **Never computed:** rank from access (CANON's C4.3b). A settings replacement copies the positions unchanged (`src/core/run.ts:313`). So it is always an arrangement revision unless the held levels change.
- **Q28-04 can't be expressed:** a replacement that changes rank would need the new order declared with it, either by switching to a mode with a different order or through a new intervention field. That is a schema change.
- **Q28-05 needs a refusal the engine doesn't make:**
  - Two unknown (gap) positions currently compare as equal (`src/core/run.ts:89`), so an unknown order is reported as unchanged.
  - Replacing a built-in setting, whose place may move (C3.7, Q-006), isn't checked at all.
- **Equality:** settings are compared by id. Two different settings with identical rules count as a revision (this is D-04).
- **Causes:** a snapshot record has one `startedBy` and one `change` (`src/core/trace.ts:51`). "Record both causes" needs a list of causes.

**Trace versioning**

- Every trace's shape changes, and band moves change results, so this needs a new engine and trace version (0.5.0) in a commit of its own.
- It should be audited against a kept copy of the 0.4.0 hashes, as the 0.3.0 migration was. More than the stamp would change this time, so the audit test has to map the new fields back.
- The schema version also changes if a new intervention field is added.
- No fixture moves a band, so no fixture's numbers would change, only shapes and versions.

## 4. Can tracking-only P-LOAD-02 run on existing traces?

Yes, as a pure post-processor over `runWork`'s output, with no core change.

- **Already there:** each step's reference output (R) and actual output (O), with refusal ids and binding provenance (`src/proposals/work/trace.ts:57`). The work unit and definition are in the attachment.
- **Missing:** a backlog attachment, bound to the work attachment's digest and the base trace hash. Per work it would hold:
  - the obligation unit, which must equal the work unit;
  - the one-to-one completion claim, with its provenance;
  - the opening backlog B0 and the admissions series Nt;
  - the assertion that withdrawals are 0;
  - whether the obligation can be divided.
- **Output:** a separate backlog trace with its own golden file. Base and work hashes stay untouched.

Edge cases:

- **Fractions are already routine:** the availability fixture gives finance 336/5 payments at baseline step 7. D-01 decides what happens.
- **An output settled by a known 0** beside refused terms still gives provable completions. The work record's unresolved binding list carries the provenance the spec asks for.
- **A refusal stops the ledger for good:** next step's backlog needs this step's, so one refused step refuses every later balance. Restarting from an observed count would be a new rule.
- **Admissions under the core's series rule hold their last value:** an entry of 10 at step 0 admits 10 every step, as inflow does.
- **The guard R <= D refuses wherever the reference output doesn't depend on admissions:** the organisation fixtures' constant reference outputs would be refused unless admissions are large enough.
- **P-LOAD-01's reserved backlog dial** (`src/core/schema/types.ts:93`) would become a second home for backlog.

## 5. A reusable per-step operation

There isn't one today. The whole run is `runValidated` (`src/core/run.ts:169`), about 940 lines. The step body is a loop (`src/core/run.ts:284`) that reads about two dozen variables carried from step to step: the arrangement, bands, stores, units, the previous step's figures, P-LOAD-01's outstanding losses, damage, snapshot state and the refusal collector.

It can be extracted without changing any result:

- **Shape:** a fixed per-run context, the carried state, a step function that runs today's step body once, and a closing function for the last snapshot and the stamp. `run()` then sets up, loops and closes.
- **Proof:** a commit that changes nothing else, and leaves the four golden hashes, the 0.3.0 history test and all 164 tests unchanged.
- **One hook is enough for generated loads.** Every load is read through `loadAt` (`src/core/run.ts:287`), both for requirements (`src/core/run.ts:564`) and for levels that measure a load. An optional per-step load override, always empty in `run()`, is the only opening needed. The existing check that a requirement only falls when an input falls already compares loads step to step (`src/core/run.ts:1074`), so it would treat generated loads correctly.
- **One draw and one P-LOAD-01 rebuilding per step are kept,** because a coordinator would call the step function once per step and never call `run()` repeatedly.
- **The work side is simpler:** `workFromTrace` carries nothing between steps except its refusal collector (`src/proposals/work/run-work.ts:259`).
- **Risks:**
  - the refusal collector's counts must stay per run;
  - mutable state must not leak between runs;
  - the step function shouldn't be exported publicly before a coupled proposal is approved.

## 6. Generated loads and the strict scenario validation

Validation requires exactly one series for every declared load (`src/core/schema/validate.ts:532`). There are three ways to make room:

- **(a) A scenario field naming each load's source.** This is a schema change, and plain `run()` would have to refuse such scenarios.
- **(b) The coupling attachment declares the load as generated, and nothing else may supply it.** Validation takes an optional list of loads supplied from elsewhere and requires the scenario to have no series for them.
- **(c) A mark on the model's load.** This puts a proposal into the mapping.

Recommendation: (b).

- There's no schema change, and plain `run()` passes an empty list, so it behaves exactly as now: a scenario missing that series still fails with `[load-missing]`.
- No load can have two sources.
- A level that measures the load would sense the generated value through its producing part and route, as for any load, so nothing new reaches the governor.

## 7. Contradictions, unsupported assumptions, decisions needed

- **APPLICATION line 30** says where to cut snapshots, including at a moving band, is a mapping decision stated at mapping. Candidate C cuts at every band revision automatically.
- **APPLICATION line 29** ("a mode change ends the snapshot") already differs from the engine, which also cuts at arrangement revisions. The spec acknowledges this.
- **The spec assumes things a settings replacement can't do today:** change rank (Q28-04) or have an unknown effect on rank (Q28-05).
- **The spec treats band revisions as labels only,** but they move switch timing (section 3).
- **Nothing conflicts on Q-021:** no event can change a route or store rule (an intervention can only set a mode, replace settings, set held levels or set a band, `src/core/schema/types.ts:358`).
- **No conflict with CANON 3:** under coupled feedback, completed work lowers a load and so lets the requirement fall. That is a fall in an input the rule reads, which CANON 3 allows, and work not done only ever raises it.

## 8. Smallest safe sequence

1. James's rulings on the questions below.
2. Tests that pin today's behaviour: Q28-01, -02, -03, -07, -09, and Q28-08's check that earlier steps are unaffected. No code or hash change.
3. Tracking-only P-LOAD-02, if authorised: proposals layer only, with its own attachment, trace and golden file.
4. The step-function extraction, alone, preserving hashes, not exported.
5. Candidate C, if authorised: the 0.5.0 migration in its own commit, audited against the kept 0.4.0 hashes, with tests Q28-03 to Q28-07 and Q28-10.
6. Coupled feedback last: the generated-load validation option, plus a coordinator in the proposals layer, with `run()` and `runWork()` unchanged byte for byte.

A refactor that preserves hashes and a migration that changes them should never share a commit.

## Questions for James's decision

1. **D-01, fractional closures:** should completion be refused when the output is fractional and the obligation can't be divided? Recommendation: refuse; the fixtures already produce fractions.
2. **Admissions series:** should admissions follow the core's rule, where a value holds until the next entry, or must every step be stated?
3. **Restarting the ledger:** after a refused step, may an observed backlog count restart it? Recommendation: not in the restricted version.
4. **Bands under candidate C:**
   - (a) Do only held levels' bands count?
   - (b) Does a band revision survive a later mode change?
   - (c) Does a band-only revision suppress threshold switches in its step, which changes results?
5. **Cutting at band moves:** should the cut be automatic at every band revision, or the mapper's stated choice, as APPLICATION says?
6. **Mode identity:** should the trace report the CANON mode (held levels plus order) separately from the declared mode or arrangement id?
7. **Rank after a replacement:**
   - Should the order stay declared, with a new intervention field for declaring a new order (a schema change)?
   - Should classification be refused where positions are unknown or a built-in setting is replaced?
8. **D-04, equality:** should rules be compared by setting id, as now, or by their content? And should changes within one step be judged by the net result, as now?
9. **P-LOAD-01's reserved backlog dial:** retire it in favour of P-LOAD-02, or build P-LOAD-02 through it?
10. **Generated loads:** is option (b), with the coupling attachment declaring the load as generated, acceptable?
11. **The id drift:** should the no-op id drift be fixed inside the candidate C migration? It changes the trace of any run with an intervention that changes nothing; no fixture has one.

D-02 (authorising coupled feedback) and D-03 (CANON's wording) stand as the spec gives them.
