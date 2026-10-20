# Review: P-LOAD-02 coupled feedback, read-only architecture review

**Date:** 2026-10-20
**Reviewed:** "Nought Engine: P-LOAD-02 Coupled Feedback, Approved Design Scope and Read-Only Review Handoff", v0.2 (its section D questions).
**Against:** millbo01/nought-engine at commit `d505bd3dc8cf9a88501c8459e2bdcbf5800c13f0`: engine 0.4.0, schema 0.4.0, 202 tests passing.
**Status:** a read-only architecture review, not an implementation. No code, golden hash, CANON.md, APPLICATION.md or existing proposal was changed to produce it, and it decides no theory. Section E's example was checked with a scratch run outside the repository.
**Outcome:** James approved the ten recommendations below on 2026-10-20; coupling is proposal P-COUPLE-01 (docs/decisions.md).

## Short answer

The tracking-only P-LOAD-02 is complete and exported. Coupled feedback can be built without changing what `run()`, `runWork()` or tracking-only P-LOAD-02 produce when coupling is off, and section E's two-step example holds on today's engine. But it needs five approvals that section B withholds, and three conflicts must be resolved first, mainly that P-WORK-01 reads loads only from the scenario document.

## D1. Baseline and completion status

**Repository**

- Commit `d505bd3dc8cf9a88501c8459e2bdcbf5800c13f0` on `main`, matching origin, with no uncommitted changes.
- 202 tests pass, 0 fail.
- CANON and APPLICATION fingerprints are unchanged.

**Versions**

| Component | Version |
|---|---|
| Engine | 0.4.0 |
| Schema | 0.4.0 |
| Work extension | 0.1.0 |
| Backlog extension | 0.1.0 |
| Backlog attachment format | 0.1.0 |
| P-LOAD-02 | 0.1 |

**Golden hashes**

- Base, unchanged since 0.4.0 (tests/golden/hashes.json): organisation-baseline `90ff8cc2…`, organisation-inflow-cut `4daeda21…`, organisation-unit-loss `d723f366…`, organism-baseline `8fd8dcad…`.
- Work, unchanged (tests/golden/work-hashes.json): availability-baseline `e7345e8e…`, availability-inflow-cut `e1a7da4c…`, availability-unit-loss `3b68cde4…`, shared-support-inflow-cut `6d49b240…`.
- Backlog, in its own file (tests/golden/backlog-hashes.json): two-step-casework `cadeb6e1…`, obligations-baseline `97d379b9…`, obligations-inflow-cut `aa3aecc5…`, obligations-unit-loss `13c27bd1…`.

**Completion:** tracking-only P-LOAD-02 is complete. Its acceptance tests T01 to T20 are covered, and it is exported from `nought-engine/proposals`, registered as a "tracking extension". The main signatures:

```ts
runBacklog(modelDoc, scenarioDoc, workAttachmentDoc, backlogAttachmentDoc, options?): { base: RunTrace; work: WorkTrace; backlog: BacklogTrace }
backlogFromTraces(base: RunTrace, work: WorkTrace, attachment: BacklogAttachment, attachmentSha256: string): BacklogTrace
validateBacklogAttachment(doc, model: T.Model, modelSha256, work: WorkAttachment, workSha256): BacklogValidation
backlogTraceHash(trace: BacklogTrace): string
```

## D2. How the contract maps onto the code

| Symbol | Implementation |
|---|---|
| B0 | `account.openingBalance.value` (a gap is refused) |
| Bt | `BacklogRecord.openingBalance`, carried forward at `src/proposals/backlog/ledger.ts:194` |
| Nt | `admissions`, read from `account.admissions.perStep` by the core's series rule (each value holds until the next entry) |
| Dt | `eligible` |
| Rt, Ot | `referenceOutput`, `actualOutput`, copied from the work record, with its `binding` kept as provenance |
| Ct | `completions`: equal to Ot only where every guard holds |
| Wt | `withdrawals`: the asserted 0 |
| Bt+1 | `closingBalance`, checked to reconcile exactly |

**Provenance**

- The stamp carries the base and work trace hashes, the model and attachment digests, the copied CANON fingerprint, and each account's claims with their evidence.
- Refusals the ledger creates have ids starting `backlog/` and name P-LOAD-02; refusals inherited from the work trace keep their ids.
- Each record lists its diagnostics.

**Where the code made choices the tracking-only handoff left open:**

- All five claims are treated as essential.
- Fractions in an indivisible account's inputs are rejected at validation, not refused at run time.
- Every failed guard is reported, so a positive output with nothing eligible is reported alongside the reference-output guard it always also breaks.
- The ledger has no known-zero rule.
- Versions are checked strictly.
- No per-run manifest exists.

None of these conflicts with section A, which restates the same ledger with no withdrawals.

## D3. Extracting a step function without changing behaviour

**Base run.** `runValidated` (`src/core/run.ts:169`) is one closure, with three parts:

- **Fixed per-run context** (lines 170 to 226): the policy, lookup tables, sorted lists, `modeFrom` and `readersOf`.
- **Carried state** (lines 229 to 276, plus `notes` at 171): `arrangement`, `unknownArrangement`, `bands`, `storeContent`, `units`, the `prev*` maps (received, entering, inflow, short, shortfall, access, delivered, rule values, requirement, loads), P-LOAD-01's `lostOutstanding`, `damaged`, `orderRefusals`, and the snapshot state (`snapshots`, `snapStart`, `snapInfo`, `modesUsed`). The step records accumulate in `steps`.
- **The step body** (`src/core/run.ts:284` to the carry-forward at `src/core/run.ts:1064`), then **finishing** (lines 1079 to 1108: the last snapshot, the proposals in force, the stamp).

**Smallest refactor**

- Split this into context, state, a step function and a finish function, in a new core module. `run()` then becomes set up, loop, finish.
- The step function takes one optional input: a per-step map of overridden loads. It is always empty in `run()`.
- The step function is not exported from `src/index.ts`. Because `package.json` `exports` publishes only `.`, `./proposals` and `./draft`, it stays non-public.

**Variables nothing outside may set:** all the carried state above, and `pLoad`. In particular:

- `units` and `lostOutstanding`, so P-LOAD-01 stays inside the step;
- `notes`, so refusal counts stay per run;
- the snapshot state, so Q-028 is untouched.

**Proof the refactor changes nothing:**

- every golden hash and the 0.3.0 history test unchanged;
- all 202 tests unchanged;
- a new test that steps each fixture through the internal step function and finishes, matching `run()` byte for byte.

**Work stepping.** `workFromTrace` (`src/proposals/work/run-work.ts:196`) carries nothing between steps except its refusal collector, so a per-step function is a small extraction.

- Its up-front checks and its stamp (`src/proposals/work/run-work.ts:363`, `traceHash(base)`) need the finished base trace, so in a coupled run they move to the finish.
- **Conflict:** it reads loads straight from the scenario document (`src/proposals/work/run-work.ts:227`). A reference output reading a generated load would find no series and be refused. The work step therefore needs a load-lookup parameter, defaulting to the scenario's series. That is a change to P-WORK-01's code, needing approval, though it would not change any result.

**Backlog stepping.** The per-step closure (`src/proposals/backlog/ledger.ts:156` to 194) should become one shared function, so tracking-only and coupled runs apply the same guards, with the backlog golden hashes unchanged.

## D4. Generated-load input

**Where a generated value enters.** Every load is read through `loadAt` (`src/core/run.ts:287`):

- for requirements (`src/core/run.ts:564`);
- for levels that measure a load (`src/core/run.ts:338`);
- for the check that a requirement only falls when an input it reads falls (`prevLoads`, `src/core/run.ts:1074`).

One override in `loadAt` therefore reaches all three with a single value.

- **Second conflict:** a level measuring a load tags its value `input` (`src/core/run.ts:345`). A generated value would then look like an external input. The override should carry the tag `computed`.
- Nothing else reads `scenario.loads` except validation and P-WORK-01 (D3).

**Naming generated loads exclusively.** A coupling attachment would hold a list of bindings, each with:

- an account, plus a part and load declared in the model;
- an active-workload claim, with its evidence.

Validation would reject any binding where:

- the load's unit isn't exactly the obligation unit;
- the scenario also supplies a series for that load;
- one load is bound twice, or one account binds two loads;
- the bound part is a separate case.

**Leaving `run()` untouched.** `validateScenario` gains an optional list of loads supplied from elsewhere. Plain `run()` passes nothing, so `[load-missing]` (`src/core/schema/validate.ts:532`) behaves exactly as now. A coupled run's scenario is then not runnable by plain `run()`, which is honest. This optional parameter is a "validation exception" under section B, so it needs approval.

**Identity of a coupled run:**

- the digests of the model, the scenario as supplied (without the generated series), the work, backlog and coupling attachments;
- the versions and the draw policy;
- the generated-load history, recorded in a coupling trace.

**Third conflict:** a coupled base trace must not look like a plain one. The recommendation is that its existing `stamp.proposals` list names the coupling proposal, which needs a finishing option in the refactor. The base trace's shape doesn't change.

## D5. Coordinating PAM, work and backlog within a step

For each step t, the coordinator does three things in order:

1. Takes Gt = Bt + Nt from the carried balance and the admissions series.
2. Runs one PAM step with Gt as the override.
3. Runs one work step on that step's record and Gt, then one backlog closure.

- **No second draw:** the draw and P-LOAD-01's rebuilding stay inside the core step, which runs once per step, and nothing calls `run()` again.
- **Ct never alters step t:** it reaches later steps only through Bt+1.
- **Accepted and refused quantities stay separate:** the PAM step records the requirement, the work record keeps Ot, the backlog keeps Ct (Ot or refused), and the coupling trace keeps Gt. The base trace records loads only through levels, so Gt must be kept in the coupling trace.

## D6. Indivisibility and refusal

**What happens in each case**

- **Fractional Ot (indivisible):** Ct is refused, so Bt+1 is refused, so Gt+1 and every later G are refused, with no restart. This is as section A approves.
- **What a refused G reaches:**
  - the bound part's requirement and its dependent fields, for each resource whose rule reads the load;
  - the reference output, if its rule reads the load;
  - any level measuring the load.
- **Rt > Dt:** refused, as in tracking. If the reference rule reads the generated load (Rt = per x Gt with per <= 1 and base 0), the guard always holds by construction. With per above 1 it always fails.
- **Known zeros:** the core has no zero rule, so a refused load refuses a linear requirement even when its coefficient is 0. P-WORK-01's zero rule still applies within work. The ledger has none.
- **Independent accounts:** stay independent, because each binds its own load.

**A refusal never halts the run.** Refusals stay local values, but they can reach further than the part:

- **Through the draw:** P-ALLOC-01 doesn't read requirement (`src/proposals/allocation-graded.ts:93`), so the draw survives. A policy that does read it would refuse that resource's draw (`src/core/run.ts:655`).
- **Through a setting:** if a level measuring the bound load drives a setting, a refused G refuses that setting's access, and with it the shared draw of that resource.
- **Through rank:** a built-in setting's order is refused whenever its requirement changes (Q-006, `src/core/run.ts:600`). A generated load that changes every step would keep the order refused.

## D7. Provenance and replay

**Registry and records**

- **Registry:** a coupling proposal id and version, plus a coupling attachment format version.
- **Coupling trace:** Gt per step (a value or a refusal), the binding, every source hash, and the base, work and backlog trace hashes, all in canonical JSON with its own golden file.

**Replay is possible.** Rebuild the effective scenario by inserting one entry per step for the bound load: the value, or `{gap}` where Gt was refused. Run it through the unchanged `run()`, `runWork()` and backlog ledger.

- The effective scenario's digest is recorded as derived, never treated as an external input.
- Equality should mean equal numbers and the same refused values. It can't be byte equality, by design: the stamps (scenario digest, proposals), the tags of load-measuring levels, and the refusal ids at refused steps all differ.

**Section E's example checks out.** Run as a replay through the unchanged engine, it gives:

| Step | Load fed in | Requirement | Completions | Closing backlog |
|---|---|---|---|---|
| 0 | 10 | 22 | 6 | 4 |
| 1 | 7 | 16 | 6 | 1 |

At each step Dt equals the load that was fed in, so these are exactly the loads a coupled run would generate. The example's rules are a requirement of 2 + 2 per case, upkeep 2, inflow 14 each step, 2 hours per case, and a reference output equal to the load.

## D8. Adversarial checks

- **Circularity:** none within a step, because Gt is fixed before step t and Ct only reaches t+1. A loop would need admissions defined from output, which the input series rules out.
- **A reference output reading its own generated load:**
  - safe with per <= 1 and base 0, and refused for ever otherwise;
  - worth a validation flag;
  - P-WORK-01 must read the generated value (the D3 conflict).
- **Admissions:** each entry holds until the next, unchanged. Admissions never include earlier backlog; that is a mapping claim the engine can't verify.
- **Units:** the load's declared unit must equal the obligation unit exactly.
- **Unavailable work output:** refuses the balance and every later generated load, as in D6.
- **Units lost and rebuilt under P-LOAD-01:** they still change only inside the core step, from the next step on. Requirement can't read units (C3.12c). Per-unit capacity reads units at the start of the step.
- **No level measures the load:** the governor never sees the backlog, as section A intends.
- **A level does measure the load:** it senses Gt in the same step. Load measures aren't a "step before" kind, but Gt is known at the start of the step, so this is not look-ahead.
  - Missing reporting uses the existing signal events and sending dial.
  - Delayed reporting of a load can't be expressed today.

## D9. Smallest safe sequence

1. James's rulings on the decisions below.
2. Internal step function in a new core module, behaviour-preserving, with the equivalence test. No version change.
3. Per-step work function with a load lookup, behaviour-preserving, work golden hashes unchanged.
4. Per-step backlog closure shared by both modes, backlog golden hashes unchanged.
5. The optional exclusive-load parameter on `validateScenario`, and the load override's `computed` tag. Plain behaviour unchanged.
6. The coupling attachment, the coordinator and the coupling trace in the proposals layer, with section E's gates, the replay test and their own golden file.
7. Registry, docs and handover.

Steps 2 to 5 must leave every existing hash unchanged, and each is its own commit. No model, scenario or trace schema change is needed. Steps 2, 3 and 5 are among what section B still withholds.

## Decisions for James before implementation

1. **Proposal identity:** is coupling a new version of P-LOAD-02 (0.2, for instance), or a separate proposal id?
2. **Which load may be bound:** only a load on the account's own part, or any part's? Recommendation: own part only, which matches P-WORK-01's own-loads rule and the earlier "never alter another part's load".
3. **An unknown or unsupported active-workload claim:** reject the binding at validation, leaving the load supplied by the scenario and the account tracking only, or refuse the generated load step by step? Recommendation: reject at validation.
4. **Marking coupled base traces:** name the coupling proposal in `stamp.proposals`, and tag generated load readings `computed`? Recommendation: both.
5. **Replay equality:** equal numbers and refused values, as opposed to byte equality?
6. **How far a refusal may reach:** accept that a refused balance can, through mapped rules, refuse a part's requirement for the rest of the run, and a resource's whole draw where a setting reads a level of the load? Or should validation flag or forbid levels on bound loads? Recommendation: accept it, with a flag.
7. **A static guard check:** should a reference rule reading the bound load have to give Rt <= Dt (per <= 1, base 0), as a flag or as an error?
8. **Engine version:** keep 0.4.0 through the hash-preserving steps (2 to 5), since plain outputs stay identical byte for byte and coupled outputs carry the coupling proposal's version? Recommendation: keep 0.4.0.
9. **Authorisations section B withholds:** the internal step function, the P-WORK-01 per-step adaptation, and the validation option.
10. **Timing of sensing:** is same-step sensing of a backlog load acceptable, or should the governor see it only from the step after? The latter has no existing measure.
