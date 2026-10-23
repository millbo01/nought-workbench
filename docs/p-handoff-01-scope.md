# P-HANDOFF-01: carryable cross-stage handovers (scope, approved; first release implemented)

**Date:** 2026-10-21
**Repository:** millbo01/nought-engine. The scope was written at f76f0bf (engine and schema 0.4.0, 368 tests). The first release follows it: 392 tests pass, and every historic golden hash is unchanged.
**Asked for by:** James, 2026-10-21: assess the smallest optional extension that lets completed upstream work create carryable obligations downstream.
**Status:** approved in principle by James on 2026-10-21, with four decisions, and its first release implemented the same day (below). CANON and APPLICATION are unchanged. The proposal below is kept as it was reviewed, except that passages about presentation were taken out of this published copy on 2026-10-23. Where the implementation differs, the result section says so.

## Decisions (James, 2026-10-21)

1. **Semantics and the forward-only rule: approved.**
   - Same-step execution needs the whole computational dependency to be forward-only, including indirect influence through shared allocations, governors and other model relationships.
   - There is no fixed-point iteration.
   - Where independence cannot be established, the handover is refused.
   - The composition also verifies upstream invariance across the run.
2. **Westbridge timing: same-step,** with the supporting evidence or explicit modelling assumption recorded, and never called documented just because it reproduces the baseline. Next-step stays a distinct, explicit declaration, with opening in-transit obligations.
3. **Composition for v1: approved,** on the unchanged runners.
   - Provenance identifies downstream admissions as generated, not independent inputs, in the explanation, the export and the replay record.
   - No same-week cap is applied to the same handover.
   - Refusals, conservation, unit checks and golden results are preserved.
   - There are no assumed zeros and no silent rounding.
4. **The overall waiting total: approved conditionally.** It is valid only where the accounts are mutually exclusive stages of the same obligations, the correspondence is declared, and in-transit work is counted once. It is never a generic addition of backlogs.

The full text and the engine's implementation choices are in [decisions.md](decisions.md).

## Implementation result (first release, 2026-10-21)

**Built:**
- **`runHandoff`** on `nought-engine/proposals` (src/proposals/handoff/), with the attachment, its validation and the forward-only analysis, the handover trace, fixtures and golden hashes. The package is at 0.3.0, and no existing export or runner changed.
- **The analysis** follows everything a downstream account's admissions can reach: generated loads, shared resource allocations, levels and the rules reading them, governor bands and switches (everything), P-DEP-01 links and further handovers.
- **Passes** are 1 + the longest chain of dependence, fixed in advance.
- **The safeguard:** the upstream must be identical in the last two passes, and each handover must conserve, or nothing is returned.

**Where it differs from the proposal above:**
- **A P-DEP-01 link beside a handover is rejected,** where the proposal flagged it (decision 3).
- **Same-step and next-step both require forward-only,** as proposed: refusing next-step between mutually influencing parts is a release limit, not a semantic one.
- **The Westbridge timing and the carrying-over are recorded as assumptions.** The note was not given the sentence "A booked first visit not carried out in its week stays booked until it is." Both are marked `assumed`, with the note's own sentences as support (decision 2). Only the count "Of these 18, 12 had been booked and were waiting for their first visit." was added, so the opening balance is documented.

**Tests:** 22 in tests/handoff.test.ts, H-01 to H-10, with these extensions:
- circular dependence: shared resources, a governor switch, and a cycle across two handovers;
- double counting: outside admissions added, never instead, and a split rejected;
- provenance: derived claim sources, derived digests and byte-for-byte replay;
- refusals across stages: a refused upstream completion, a fractional handover and an unknown opening in transit.

**The corrected Westbridge results** (same-step; weeks 1 to 12):

| Scenario | Before (same-week cap) | With P-HANDOFF-01 |
|---|---|---|
| Baseline | 40 booked and visited a week; 18 waiting for a first visit | The same, split: 6 to be booked + 12 booked and waiting = 18. Visits are held by Care Delivery's hours |
| Booking hours 30 from week 2 | 106 waiting for a first visit by week 12 | Visits 40, 40, 36, then 32. By week 12: 94 to be booked, 0 booked and waiting, 94 in all |
| Visiting hours 71 from week 2 | No change | Visits 44 in weeks 2 to 4. Booked and waiting 12, 8, 4, then 0. In all: 18, 14, 10, then 6 |
| Booking 60 and visiting 70 hours from week 2 | Refused from week 2 (43⅓ visits) | Refused from week 2, the same refusal, with the same question |

**Limits of this release:**
- **Forward-only only.** Any handover whose downstream can reach its upstream is refused, next-step ones included.
- **The base stamp** names the runner's proposals (P-COUPLE-01), not P-HANDOFF-01.
- **The backlog records** tag the derived admissions `input`. The handover trace, always delivered with them, is the authority on both points. The derived claim's source names P-HANDOFF-01 in the backlog stamp.
- **The analysis is conservative:** it may refuse a handover that would in fact be independent. For example, it treats every level on a reached resource as reached.
- **Not covered:** splits, duplication, rework loops and priority (HQ-01, HQ-03, HQ-04), and the in-loop coordinator for interacting parts (HQ-02).

## The problem

Take a two-stage workflow: a booking stage, then a first-visit stage. Each completed booking creates a first visit owed. A visit owed may stay outstanding for several steps until the visiting stage has time.

P-DEP-01 cannot express this. Its cap holds the visiting stage's output in a step to the booking stage's output in the same step, and it keeps no stock. So a visit booked earlier and not yet carried out can never be cleared by spare visiting time.

## The answer in brief

1. **Not expressible by composing the existing mechanisms as they stand.** Nothing carries one account's completions into another account:
   - P-LOAD-02's admissions are an external, evidence-labelled input series.
   - P-COUPLE-01 binds an account only to a load of its own part; a cross-part binding is rejected (CF-D02).
   - P-DEP-01 is a same-step cap with no stock, and a lagged cap would still hold no stock.

   In the synthetic referral pathway (below), every available combination is wrong:
   - **With the cap,** more visiting hours change nothing, because the 12 referrals booked earlier are stuck behind this week's bookings.
   - **Without the cap,** the visiting stage's list reaches 0 by week 6 while 6 referrals are still waiting to be booked. It has visited referrals no one booked.
2. **It needs one new, versioned attachment and a small coordinator.** The coordinator adds one term to a downstream account's admissions: the upstream account's completions, at a declared time. Every other value is computed by the unchanged P-WORK-01, P-LOAD-02 and P-COUPLE-01 (and P-DEP-01, where a link is still mapped).
3. **The first release can be built entirely from the unchanged runners.** The coordinator runs them on derived documents: a first pass gives the upstream completions, and a second gives them to the downstream account. A scratch check did exactly this on the referral pathway, with the unchanged `runCoupled`. In every case tried, the upstream figures were identical in both passes. No existing code path would change.

## Established mathematics (literature before formula)

Stated without PAM's vocabulary, this is items moving between stages, each with its own buffer, where a transfer is available either in the same period or after a transit time. It is a standard problem class, and its standard results answer the two hard questions here.

| Field | What corresponds | What P-HANDOFF-01 takes from it |
|---|---|---|
| Flows over time (Ford and Fulkerson 1958; Skutella 2009, *Research Trends in Combinatorial Optimization*) | Arcs with transit times; flow on an arc is in transit | Conservation counts what is in transit, so a next-step handover keeps an explicit in-transit term, including at the end of the run |
| Timed event graphs and marked graphs (Commoner, Holt, Even and Pnueli 1971; Baccelli, Cohen, Olsder and Quadrat 1992, *Synchronization and Linearity*) | A place with no initial token is a same-period precedence; one token is a one-period delay | Same-period precedences must contain no cycle. Then each period is evaluated explicitly, in topological order; otherwise the system is not well defined (a circuit with no token deadlocks) |
| Synchronous languages and simulation (Lustre: Halbwachs, Caspi, Raymond and Pilaud 1991; algebraic loops in block-diagram simulators) | Instantaneous dependency against a unit delay (`pre`) | An instantaneous dependency cycle is rejected rather than solved; a delay breaks it. That gives the refusal rule for same-step handovers below |
| Supply-chain and stock-flow models (Forrester 1961; Sterman 2000, *Business Dynamics*) | Stock on hand against stock in the pipeline | The downstream balance and the in-transit amount are reported apart, never merged silently |

The bibliographic details were checked. The specific results are standard, and I did not re-read them for this note.

**What is left for N-ought:** the evidence labels, the refusals, and the one feature these fields do not have. A PAM step computes all parts' draws jointly, so a same-step handover into a downstream account that generates a load (P-COUPLE-01) is an instantaneous dependency unless that downstream part cannot reach the upstream part (the forward-only condition below).

## Proposed contract: P-HANDOFF-01 0.1

**Kind:** a work-accounting extension, optional and off unless an attachment enables it. It moves counts of obligations between accounts. It never moves a resource, so it is not a PAM resource transfer, and it changes no CANON or APPLICATION rule.

### The attachment (separate and versioned, like the others)

- Its version and id. The model by id and exact digest; the backlog attachment by id, version and digest; the coupling attachment likewise, where there is one.
- The opt-in, `P-HANDOFF-01` at 0.1.
- One or more handovers, each with:
  - `from` and `to`: an upstream and a downstream P-LOAD-02 account, on different parts;
  - **correspondence:** `perCompletion` (k > 0), downstream obligations created per upstream completion, with `fromUnit` and `toUnit`, which must be exactly the two accounts' obligation units (no other conversion), and a claim (statement and evidence);
  - **timing:** `availability`, either `same-step` or `next-step`, required, with no default, and with a claim;
  - **eligibility:** a claim that a handed-over obligation is eligible downstream from the step it arrives in, and carries until completed;
  - **opening in transit:** for `next-step` only, the obligations completed upstream before step 0 that arrive at step 0 (a value or an explicit gap, with evidence);
  - a rationale.

Evidence labels are P-LOAD-02's: `documented`, `estimated`, `assumed` or `unknown`.

### The calculation (handover h from account U to account V, step t)

- **Handed over:** H_t = k × C^U_t, where C^U_t is U's completions after P-LOAD-02's guards.
- **Admitted to V:** A_t = H_t for `same-step`, or H_{t-1} for `next-step` (H_{-1} is the opening in transit).
- **V's admissions:** N^V_t = E^V_t + Σ over the handovers into V of A_t, where E^V_t is V's own admissions series as mapped. It keeps its meaning: obligations arriving from outside the chain.
- **Then P-LOAD-02, unchanged:** D^V_t = B^V_t + N^V_t; its guards; C^V_t; B^V_{t+1} = D^V_t − C^V_t. Where V is bound, P-COUPLE-01 is also unchanged: G^V_t = D^V_t.
- **In transit at the end of step t:** H_t for `next-step`, 0 for `same-step`.

### Scope of the first release

- **Computed:**
  - every handover into a tracking-only account (one no binding couples; it feeds nothing, so it can never reach upstream);
  - a handover into a coupled account where the downstream part is **forward-only**: it draws no resource that any part upstream of it in the handover graph draws, and no level measures a load, flow or store of it.

  This is a conservative static condition, checked before simulation. Both timings are computed in these cases.
- **Accepted and refused when computed** (an unsupported rule, as P-DEP-01 does for cycles and lags): a handover into a coupled account that is not forward-only. The handover admissions are refused, so V's balances and whatever reads V's generated load are refused too, through the existing chains. U is unaffected.
  - For `same-step` this is an instantaneous cycle through the joint PAM step. No within-step order is given, and none is chosen.
  - For `next-step` it is well defined (causal), but needs the in-loop coordinator, which is a later release (HQ-02).
- **Rejected before simulation** (no fallback):
  - an account not in the backlog attachment, or U equal to V;
  - units that are not the accounts' obligation units, or k ≤ 0;
  - a missing or unknown `availability`;
  - a `next-step` handover without an opening in transit (a gap is allowed, and refused where used);
  - an unknown correspondence, timing or eligibility claim (as CF-D03);
  - two handovers out of one account: dividing or duplicating completions is not given (HQ-01);
  - a cycle of handovers;
  - digests that do not match.
- **Flagged, not rejected:**
  - an assumed or estimated claim (a conditional result);
  - a P-DEP-01 link mapped between the same two works: both then apply, and the cap still holds V to U's same-step output;
  - V's own admissions series not 0 everywhere: outside arrivals add to the handovers, so check for double counting;
  - k not a whole number where V is indivisible.

### Guards and refusals

Only two are new. Everything else is P-LOAD-02's, applied to V as to any account.

- **A refused upstream completion** refuses its handover, keeping the refusal ids. V's balance is then refused from that step on, with no restart (P-LOAD-02's rule). Other accounts are unaffected.
- **A fractional handover into an indivisible account** (k × C^U_t not a whole number) is refused, with its own id (`handoff/unsupported-rule fractional handover into indivisible obligations <h>`). Nothing is rounded.

### Evidence and provenance

- Handover admissions are computed values, never inputs. The handover trace names, for each one, its handover, the upstream step and the completions it came from.
- V's results are conditional on any assumed or estimated handover claim, and on U's own conditions, since the counts handed over rest on them. P-LOAD-02's `conditionalOn` carries these, as it carries any account's.
- **In a build by composition,** the second pass reads a derived backlog attachment (V's admissions = E + A). It is labelled `derived` in the handover stamp, as CF-D05 labels the replay scenario. The handover trace is always delivered with the traces it explains.
  - **Trade-off, for review:** the backlog trace of that pass tags V's admissions `input`, as P-LOAD-02 tags any series. The handover trace is what marks them derived.

### Conservation

- **Each account:** P-LOAD-02's identity, unchanged: B_t + N_t = C_t + W_t + B_{t+1}.
- **Each handover:** k × Σ_t C^U_t + (opening in transit) = Σ_t A_t + (in transit at the end). Nothing is created or lost at a handover.
- **Along a chain with k = 1:** what is outstanding (every balance plus what is in transit) changes only by outside admissions and the last stage's completions.

### Records

A handover trace, version 0.1.0, holds:

- **its stamp:**
  - P-HANDOFF-01 0.1 and the attachment's digest;
  - the hashes of the base, work, backlog and coupling traces delivered;
  - the derived backlog attachment's digest, labelled derived;
  - each handover's claims, evidence, conditions and forward-only result;
- **per step and handover:** the completions read (a value or a refusal), the amount handed over, the amount admitted, and what is in transit at the end;
- **its refusals,** with their paths.

The base stamp names P-HANDOFF-01, as it names P-COUPLE-01.

### What it never does

- It moves no resource and changes no requirement, except through P-COUPLE-01's existing binding of V's own account.
- It changes neither P-WORK-01's rules nor P-DEP-01's cap.
- It adds no priority, ageing, expiry, withdrawal, partial completion, routing split or rework loop.
- It changes nothing in CANON or APPLICATION.

### Implementation (first release, by composition)

1. Validate the attachment.
2. Order the handovers topologically.
3. Run the unchanged `runCoupled` (or `runBacklog`, where nothing is coupled) once per level of the handover graph, plus once. Each pass gives every handover the completions of the pass before.
4. Check, as a defect assertion, that every upstream account's figures in the last pass equal those that generated its handovers. The static forward-only condition promises this.

`runHandoff` would be a new, separately versioned export on `nought-engine/proposals`, and no existing export would change. The package moves to 0.3.0 when it lands.

## Minimum tests

| Test | What it checks |
|---|---|
| H-01 Off | With no handover attachment, every output and golden hash is byte-identical (all existing suites) |
| H-02 Rejections | Each rejection above fails before simulation, with no fallback |
| H-03 Carry-over | Two parts. U completes 3 a step; V can complete 2, so its balance grows by 1 a step. Raising V's capacity to 4 clears the earlier balance: V completes previously outstanding work. Exact rationals |
| H-04 Timing | The same inputs give the stated different results for `same-step` and `next-step`. The opening in transit arrives at step 0, and what is in transit at the end is reported |
| H-05 Conservation | Each account's identity and each handover's identity hold exactly, on every fixture |
| H-06 Refusals | A refused upstream completion refuses V's balances from then on, with no restart, and nothing else. A fractional handover into an indivisible account gives a local refusal |
| H-07 Forward-only | A coupled `same-step` handover in a forward-only arrangement matches the composition oracle. With a shared resource, V's handover admissions are refused and U is unaffected |
| H-08 Evidence | Assumed claims give conditional results; unknown claims are rejected |
| H-09 Neighbours untouched | With a P-DEP-01 link also mapped, both apply and the flag is raised. Work records equal `runCoupled`'s for the same effective loads |
| H-10 Golden | The referral pathway's figures below, as golden hashes |

## The expected change to the Westbridge example

The synthetic referral pathway (Westbridge Community Services; every number invented) books first visits in Referrals & Scheduling and carries them out in Care Delivery:

- 40 new referrals a week;
- booking time: (36 − 6) hours ÷ 0.75 = 40 bookings a week;
- visiting time: (65 − 5) hours ÷ 1.5 = 40 visits a week;
- on 5 October 2026, 18 referrals were waiting for a first visit, 6 of them not yet booked.

**What changes in its mapping:**

- **The P-DEP-01 link is removed.** One handover replaces it: from "waiting to be booked" to a new account, "booked, waiting for a first visit". It creates 1 visit owed per booking, `same-step`. That account opens at 12, has no outside admissions, and is coupled to Care Delivery's load.
- **The capacity note gains two sentences,** so that both claims are documented rather than derived:
  - "Of these, 12 were booked and waiting for their first visit."
  - "A booked first visit not carried out in its week stays booked until it is."

**Figures** (computed by the composition oracle on the unchanged engine; weeks 1 to 12):

| Scenario | Today (P-DEP-01 cap) | With P-HANDOFF-01, same-step |
|---|---|---|
| Baseline | 40 booked and 40 visited a week; 6 waiting to be booked, 18 waiting for a first visit | The same figures, now split: 6 to be booked, 12 booked and waiting, 18 in all. Visits are held by Care Delivery's hours: the 12 are a real queue, no longer stuck |
| Booking hours 30 from week 2 | Visits 32 from week 2; by week 12, 94 to be booked and 106 waiting for a first visit | Visits 40, 40, 36, then 32: the spare visiting time clears the 12 booked earlier. By week 12, 94 to be booked and none booked and waiting: **94 in all, 12 fewer** |
| Visiting hours 71 from week 2 | No change: visits held by bookings | Visits 44 in weeks 2 to 4, and the booked list goes 12, 8, 4, 0: **6 in all from week 4, down from 18** |
| Booking 60 and visiting 70 hours from week 2 | Refused from week 2 (43⅓ visits) | The same refusal, from week 2 |

**Why `same-step`, not `next-step`:** the note says a booked visit can be carried out in its own week. Its snapshot fits only that reading. With `next-step` the baseline would change: 12 visits in week 1, and 40 bookings always in transit, giving 46 waiting in all against the documented 18.

## For review (answered: see Decisions, at the top)

1. The semantics above: approve or amend. In particular, the forward-only condition and the refusal of non-forward-only coupled handovers.
2. `same-step` for the referral pathway, on the note's own wording and snapshot.
3. The first release by composition, with the provenance trade-off stated above. The alternative is an in-loop coordinator, which needs a ledger admissions hook and also covers `next-step` with shared resources (HQ-02).
4. A total "waiting for a first visit in all" is the sum of the chain's balances and what is in transit. It is valid only where k = 1 says they are the same referrals. It is never an engine value.

**Later questions (not in 0.1):**

- **HQ-01:** one completion creating obligations in several accounts, or divided between them (routing).
- **HQ-02:** `next-step` handovers between parts that influence each other, in-loop.
- **HQ-03:** rework loops (a cycle of handovers through a delay).
- **HQ-04:** priority between carried and new obligations.

Related: WQ-02 (lagged links) and WQ-03 (whether work changes later steps) in [open-questions.md](open-questions.md).
