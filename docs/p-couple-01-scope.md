# P-COUPLE-01: scope, confirmed against the v0.3 resolutions

**Date:** 2026-10-20
**Repository:** millbo01/nought-engine (engine and schema 0.4.0; 229 tests passing, the 202-test baseline among them; every historic golden hash unchanged).
**Status:** the scope is confirmed against "Nought_Engine_Coupled_Feedback_Review_Resolutions_v0.3_APPROVED.md" (rulings CF-D01 to CF-D10 and scope confirmations F.1 to F.5; docs/decisions.md). **Not implemented:** the coordinator, its attachment and its trace wait for the express authorisation of that document's third gate. Nothing below adds a causal rule.

## Already in place (each step left every existing result unchanged)

1. The core run as a cursor of steps, `startRun` (bc53732).
2. P-WORK-01 as a cursor of steps, `startWork`, with a load lookup that defaults to the scenario's series (b6331bb).
3. The P-LOAD-02 ledger as a cursor of steps, `startBacklog`, with each account's eligible obligations available before a step (0d55c03).
4. Core hooks: loads given for a step, generated readings tagged `computed`, proposals listed at finish, refusals described as they are noted (4fb6f5d). The coupling-only validation path is the internal `validateCoupledScenario`; the exported `validateScenario` keeps its signature (corrected after review against CF-D08).

None of these is on a package entry point; `run()`, `runWork()` and `runBacklog()` are unchanged.

## What P-COUPLE-01 0.1 would do

**A coupling attachment** (versioned, like the work and backlog attachments):

- the model by id and digest, and the backlog attachment by id, version and digest (which binds the work attachment in turn);
- the opt-in, P-COUPLE-01 at 0.1 (CF-D01);
- bindings, each naming an account, a part and a load, with an active-workload claim (a statement and an evidence label) that the account's whole eligible balance is active workload in every step of the run (F.2).

**Validation.** The attempted coupled run is invalid, and nothing is simulated, when a binding:

- names a part other than the account's own, or a load the part does not declare, or a load whose unit is not exactly the obligation unit (CF-D02);
- binds one load twice, or one account twice (CF-D02);
- rests on an unknown active-workload claim (CF-D03).

It is also invalid where the scenario also gives a bound load a series (`[load-supplied]`). There is no fallback to the scenario's loads (F.4).

Validation flags, without rejecting:

- an estimated or assumed claim: the results are a conditional simulation (CF-D03);
- a reference-output rule reading the bound load that is not provably within R_t <= D_t, which needs a = 0 and b <= 1 for R = a + b × G (CF-D07);
- **the preflight impact diagnostic**: everything that reads each bound load, namely requirement rules, reference-output rules, levels, and the settings and draws those levels reach (CF-D06).

**One coupled run** (`runCoupled`), for each step t in order (section D):

1. For each binding, G_t = D_t = B_t + N_t (G_0 = B_0 + N_0, F.3), from the ledger's carried balance and the admissions series.
2. One PAM step with G_t given for the bound load; the existing requirement, signal, access, draw, P-LOAD-01 and reconciliation rules apply unchanged.
3. One work step on that PAM step's state, with the same effective loads.
4. One ledger closure with the existing guards: C_t and B_{t+1} = D_t - C_t.

C_t never changes step t. A refused B_{t+1} refuses every later G of that binding, and whatever the mapped rules make depend on it; nothing else is refused, and there is no restart (CF-D06).

**Its records:**

- The base, work and backlog traces, the base stamp naming P-COUPLE-01 (CF-D04).
- A coupling trace of its own, holding:
  - G_t per step and binding, as a value or a refusal;
  - each binding's claim, evidence grade and condition (CF-D03);
  - the refusal path from a refused G to what it refused (CF-D06);
  - its stamp: P-COUPLE-01 0.1, the coupling attachment's digest, the base, work and backlog trace hashes, and the source digests;
  - its own golden hashes.
- No circular fingerprint: the base stamp names the proposal, not the coupling trace.
- A coupled base trace is always delivered with its coupling trace (section C.3).

**Replay** (CF-D05): the effective scenario carries the generated loads, and its digest is labelled derived. The unchanged runners give equal known figures and the same refused fields; the expected differences are tested.

**Presentation:** where the workbench or any export shows coupled results, it carries the binding's evidence grade and condition (CF-D03).

## Acceptance (CF-R01 to CF-R12)

- **CF-R01:** with coupling off, every old output and golden hash is byte identical, and `[load-missing]` is unchanged.
- **CF-R02:** collisions and unknown claims fail before simulation, with no fallback.
- **CF-R03:** G = [10, 7], requirements [22, 16], completions [6, 6], closing backlog [4, 1], with one draw per step. This has already been checked by replay on the unchanged engine.
- **CF-R04:** the reference output reads the generated load with the same values as PAM, with no external series.
- **CF-R05:** a fractional closure of indivisible obligations gives a local refusal, followed downstream, with no rounding and no restart.
- **CF-R06:** a mapped level on G is tagged `computed` and follows its producer, route and silence rules; without one, the governor observes nothing new.
- **CF-R07:** estimated or assumed claims give conditional results.
- **CF-R08:** the static flag never rejects an admissible intercept or constant rule; the runtime guard still applies.
- **CF-R09:** replay compares values and refused fields, records the expected differences, and never passes a derived input off as external.
- **CF-R10:** with P-LOAD-01, one draw and one rebuilding per step, correct carry-over and reconciliation.
- **CF-R11:** independent accounts stay independent, except through dependencies PAM actually maps.
- **CF-R12:** no Q-028, CANON, APPLICATION or IPF change; no new damage, expiry, withdrawal, scheduling, cross-part or adaptive-setting law.

## Not in scope

Partial, blocked or scheduled obligations; ageing, expiry, withdrawals; cross-account or cross-part bindings; prioritisation; damage or degradation; inferred demand; any extra resource draw for work; delayed sensing of a backlog load; Q-028; any CANON or APPLICATION change; IPF.

## Needed before implementation

1. **Express authorisation** for the P-COUPLE-01 coordinator, attachment, derived-scenario provenance, run stamps and coupling trace (the v0.3 document's third gate).
2. **Confirmation that the four preparations satisfy its second gate.** They were made under the instruction of 2026-10-20 to proceed in staged, test-preserving increments, and they pass all its halts once the validator correction is in.
3. **An API decision.** `runCoupled` would be a new public entry point on `nought-engine/proposals`. CF-D08 asks for a semver and API assessment first. The recommendation: add it as a new, separately versioned proposal export, with no change to any existing export, so existing callers are unaffected. The package version (0.1.0 in package.json, not yet published to any registry) moves to 0.2.0 when it lands.
