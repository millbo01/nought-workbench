# P-COUPLE-01 0.1: implementation report

**Date:** 2026-10-20
**Repository:** millbo01/nought-engine. Commits bc82c3c (preparation), a943598 (the coupled run), eb1e747 (the browser-engine check), and the documentation commit that adds this report.
**Status:** implemented, within the approved scope ([p-couple-01-scope.md](p-couple-01-scope.md)) and the v0.3 resolutions CF-D01 to CF-D10. No escalation condition arose. CANON.md and APPLICATION.md are untouched. There is no Q-028 change and no new causal rule.

## What was built

- **`runCoupled(model, scenario, work, backlog, coupling, options)`** is a new export on `nought-engine/proposals`. For each step, and for each binding of an account to a load on the account's own part, it does four things:
  1. it computes G_t = D_t = B_t + N_t from the ledger;
  2. it runs one PAM step with G_t given for the bound load;
  3. it runs one P-WORK-01 step that reads G_t;
  4. it runs one P-LOAD-02 closure, which gives B_{t+1} and so G_{t+1}.

  It drives the existing cursors in that order and adds no rule.
- **The coupling attachment (format 0.1.0).** It binds the model and the backlog attachment by their digests, and opts in to P-COUPLE-01 0.1.
  - It rejects, before anything runs and with no fallback: a cross-part binding, an undeclared load, a unit mismatch, a load or account bound twice, an unknown active-workload claim, and a scenario that also states a bound load.
  - It flags: a conditional (assumed or estimated) claim; a reference rule outside the proven form R = b x G with b <= 1; the preflight impact (what reads the load); and a level sensing the load.
- **The coupling trace (0.1.0).** It holds G_t per step, tagged `computed`. Its stamp carries the base, work and backlog trace hashes, each binding's claim, evidence, conditions, guard and impact, and the digest of the derived replay scenario. For each refusal behind a refused G, it gives the refusal path: every field it refuses in the four traces, with the steps. The base stamp names P-COUPLE-01, and no trace names the coupling trace, so no fingerprint is circular.
- **`couplingReplayScenario`** states the generated loads as series in a derived scenario (id `….replay`), so the unchanged runners can replay any coupled run.
- **Fixtures, with golden hashes of all four traces:**
  - `two-step-coupled` reproduces CF-R03: G [10, 7], requirements [22, 16], completions [6, 6], closing [4, 1].
  - `organisation-caseload-unit-loss` runs the organisation model with P-LOAD-01 enabled. The service caseload is generated from open service cases, and a level that finance produces senses it.
- `npm run example:coupled` prints the two-step run with its evidence grade and conditions.
- **Versions.** The engine and schema stay 0.4.0, and every existing export is unchanged. The package moves to 0.2.0.

## Tests

257 pass: the 229 from before, plus 28 new ones covering CF-R01 to CF-R12.

- **Golden hashes.** Every historic golden hash is unchanged (base, work, backlog and the 0.3.0 history). The compiled browser engine gives all 14 golden hashes, the coupled ones included, so the publishing workflow checks coupling too.
- **Replay.** On both fixtures and on a refusal case, the replay through the unchanged `runBacklog` gives the same known figures and refuses the same fields. The expected differences are tested: the stamp's proposal, the scenario id and digest, the load level's tag, and refusal ids.
- **Refusals and guards.** A fractional closure refuses the next step's generated load, the requirement, the resource totals and the reference output, and nothing independent, with no rounding and no restart. An unproven reference rule runs, and the runtime guard still refuses R_t > D_t.
- **Independence and P-LOAD-01.** Independent accounts stay independent. With P-LOAD-01, each step has one draw and one rebuilding, and the units carry over exactly.

## Significant limitations

1. **Indivisible obligations often meet fractional outputs.** P-LOAD-02 refuses a fractional completion of indivisible obligations, and no rounding rule exists, rightly so. So a coupled loop with a fractional coefficient (the organisation's R = G/5) or a fractional yield (9/10) is fully known only for particular admission patterns. Otherwise the refusal follows the load for the rest of the run, as designed. Partial completion, or any rounding, would need its own approval.
2. **Q-016 now reaches the loop.** Without P-LOAD-01, units after a shortfall are refused. A per-unit capacity then refuses completions, and through them the generated load. In a trial on the organisation baseline, the coupled caseload was refused from step 2. Coupled runs on such models need P-LOAD-01 enabled to stay known after a shortfall.
3. **Scope limits, as approved:**
   - one load per account, on its own part;
   - same-step sensing only through a mapped level (no delayed reporting);
   - no partial, blocked or aged obligations, no withdrawals, no cross-part generation.
4. **The static guard is narrow by ruling.** It proves only R = b x G. A table that is in fact safe is still flagged; it is a flag only.
5. **The workbench does not show coupled runs**, per the priority on the engine. Coupled results are available through the API, the traces and the example script, and each carries its evidence grade and conditions.

## What the engine can now demonstrate that it could not before

- **A closed backlog loop, exact and auditable.** Obligations left unfinished in one step become the next step's load. Through the model's own requirement rules, that load changes the next step's resource requirements, shortfall and work reference output. Before, a backlog could only be tracked after the run, and every load had to be stated by the scenario. In the organisation fixture, a surge of admissions does the following:
  - it raises the service caseload from 125 to 150;
  - its staff-time requirement rises from 250 to 300, and its shortfall from 50 to 100, for four steps;
  - all of it recovers as the backlog clears;
  - all the while P-LOAD-01 loses and rebuilds units elsewhere.
- **The governor senses the backlog only through a mapped level.** The level's reading is marked `computed` and follows its producer and route, as any reading does.
- **Refusal followed across the feedback loop,** with a path showing exactly which fields of which traces a refusal reached, and at which steps.
- **Proof that coupling adds no hidden rule.** Every coupled run replays through the ordinary runners from a scenario labelled derived, and gives the same figures.
- **Conditional simulation, labelled.** Every coupled result carries the evidence grade of the claim it rests on.
