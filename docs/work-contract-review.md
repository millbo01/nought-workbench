# Review: Functional Work and Dependencies Contract v0.2

**Date:** 2026-10-20
**Reviewed:** "N-ought Engine: Functional Work and Dependencies Contract", v0.2, APPROVED (P-WORK-01 and P-DEP-01 approved by James as optional modelling proposals, not CANON laws).
**Against:** millbo01/nought-engine at commit 9efd916: engine 0.3.0, schema 0.3.0, 108 tests passing.
**Status:** review only. No code, CANON.md, APPLICATION.md or fixture was changed to produce it. No IPF behaviour, deterioration or allocation rule is introduced.
**Outcome:** the "Work Contract Review Resolution" v0.3 answered the thirteen decisions below, and James approved it with seven amendments from a further review; the rulings are in docs/decisions.md (2026-10-20, work extension).

Golden trace hashes at 9efd916 (tests/golden/hashes.json), which the extension must leave unchanged:

| Fixture run | traceHash |
|---|---|
| organisation-baseline | ec403bc722e03cd1c7cb41731dcf1fadf8a7faac09c5ed86bcd80206dfe09919 |
| organisation-inflow-cut | e8197594fa086c9e7e8511baa94b4d4f41d4aee4ba545fed16e4fda39fd6745a |
| organisation-unit-loss | 39e90c4c760bbbc3e5bcaef07f464ebfba8e3472496780f03eb1325750eea69d |
| organism-baseline | 2d37d21ef88f83eac6c34df59dbc576695a981f05d39bc4815d4eeabdb17f17e |

## Short answer

Yes. P-WORK-01 and P-DEP-01 can run as a step after an unchanged `run()`, reading only the RunTrace, the Model and the Scenario. Canonical results and the four golden hashes stay the same. There is one hard blocker, the word "target". There is one small, optional core change, exporting the lookup that reads load series.

The code itself prevents the extension from changing the base run:

- The core never imports proposals, and the layering test enforces this.
- `stamp.proposals` is built from `CORE_PROPOSALS` plus what the run used (`src/core/run.ts:1091`), not from the PROPOSALS registry. Registering P-WORK-01 and P-DEP-01 therefore moves no hash.
- `Scenario.enable` accepts only P-LOAD-01, so the work opt-in cannot get into a scenario.
- `Measure` has no work kind (`src/core/schema/types.ts:194`). Work output cannot become a sensed level without a core change, so contract test 8 passes by construction.
- Scenario events are only damage, intervention and signal. None changes parts or dependencies, so a link that is valid at step 0 stays valid for the whole run.

## 1. Contradictions with CANON or the implementation

**Blocking**

- **"target".**
  - CANON 2's note gives the reason bands replaced targets: "a target reads as something the system aims at". CANON 2.3 also says parts have no demand of their own.
  - The C3.14 test bans `target` anywhere in src/core, src/proposals and src/draft, including comments and string keys (`tests/static.test.ts:47`). So `targetRule` cannot be written where the extension has to live.
  - Suggested names: "reference output" for the target, and "work not done" for the output deficit. "Work not done" is CANON 3's own term and APPLICATION's.

**Out of date against the current repository** (the contract was written against the 0.3.0 handover)

- **P-LOAD-01 now exists.** The contract's scope and §9 exclude it, but it has since been approved and built, enabled per scenario (`"enable": ["P-LOAD-01"]`). The extension would not implement it, only read the units it produces. Those units can be fractional, so a per-unit capacity can be fractional too, which is fine with rationals.
- **Schema version.** It still says 0.3.0, although 9efd916 added `Scenario.enable` and the trace fields `lost`, `rebuilt` and `rebuilding`. A WorkRunStamp that copies `schemaVersion` cannot tell those traces apart. This predates the contract. Bumping it changes every golden hash once.

**Overlap**

- `Part.capacity` and `Part.efficiency` (`src/core/schema/types.ts:110`) are DRAFT dials for APPLICATION's capacity property, and nothing reads them. The attachment's capacity and yield would be a second home for the same property.

**Checked, no conflict**

- APPLICATION's capacity line says a part limited by capacity has no shortfall, only work not done. The contract matches.
- CANON 3 says work not done never lowers requirement. The last bullet of §5.3 matches.
- CANON 4's lag note is about the top being short while lower parts draw in full. It adds no rule, and a cap applied to work output in the same step does not touch it. Delayed links (deferred for now) should be checked against it, and Q-007 stays parked.
- CANON 3's sensing line: neither proposal creates a signal.

## 2. Minimal additional data contracts

The extension needs nothing that is not already there:

| Input | Where it is |
|---|---|
| Received, shortfall and `remainderForWork` per part and resource, with refusal ids | `StepRecord.parts[]` (PartRecord) |
| Units at the start of each step | `StepRecord.units[]` (UnitRecord) |
| Dependencies, each part's loads and required resources | Model |
| Load series | Scenario |

The rule that reads a load series is a private function, `seriesAt` (`src/core/run.ts:168`). It takes the latest entry at or before the step, and a missing entry or a gap is refused. The existing `evalPartRule` (`src/core/rules.ts:72`) already evaluates the rule forms.

Two facts shape the contract:

- `remainderForWork` is null, not refused, when the part states no upkeep for that resource (`src/core/run.ts:699`). So every resource in a recipe needs a stated upkeep, which may be 0. Every part in the organisation fixture states upkeep for both resources, so an attachment can run on it without editing the model.
- A part that sets its own access gets refused receipts (`src/core/run.ts:548`). Its work is then refused through the normal chain, with no special case.

**Attachment.** A new document in src/proposals/work/, with no change to Part, Dependency or RunTrace. `Id`, `Rational`, `OrGap`, `RequirementRule`, `TV` and `RefusalSummary` are the existing exported types.

```ts
interface WorkAttachment {
  attachmentVersion: string;
  id: Id;
  model: Id;                          // Model.id
  modelSha256: string;                // must equal the base RunStamp.mapping.sha256
  proposals: { id: 'P-WORK-01' | 'P-DEP-01'; version: string }[];   // the opt-in
  works: WorkMapping[];
  links: FunctionalLink[];            // must be empty unless P-DEP-01 is listed
}
interface WorkMapping {
  part: Id; work: Id; workUnit: string; definition: string;
  referenceOutput: OrGap<RequirementRule>;            // constant | linear | table, on this part's own loads
  recipe: { resource: Id; perWorkUnit: Rational }[];  // non-empty, each above 0
  capacity: OrGap<{ kind: 'constant'; value: Rational; rationale: string }
                | { kind: 'per-unit'; perUnit: Rational }>;
  yield: OrGap<Rational>;                             // in [0, 1]
}
interface FunctionalLink {
  part: Id; feeds: Id;                // an existing Dependency, same field names
  units: { part: string; feeds: string };  // must equal the two workUnits
  ratio: Rational;                    // above 0: upstream units per downstream unit
  lagSteps: number;                   // whole number, 0 or more; above 0 is accepted, then refused at run
  semantics: 'non-exclusive-enablement' | 'exhaustible-support';  // the second is accepted, then refused at run
  rationale: string;
}
```

Validation runs before any run. It rejects:

- an unknown part, resource or dependency;
- a mismatched model id or digest;
- a recipe resource the part does not require, or has no stated upkeep for;
- a recipe amount that is not above 0;
- a constant yield outside [0, 1];
- a negative capacity;
- a ratio that is not above 0;
- a lag that is not a whole number of 0 or more;
- a units pair on a link that does not match its two works;
- links when P-DEP-01 is not listed;
- an unknown proposal id or version.

**Output**

```ts
interface WorkTrace { stamp: WorkRunStamp; steps: WorkStepRecord[]; refusals: RefusalSummary[] }  // core shape, ids prefixed work/
interface WorkRunStamp {
  workVersion: string;
  base: { engineVersion; schemaVersion; canonFingerprint; traceSha256; mapping; scenario; allocationPolicy; proposals };
  attachment: { id: Id; sha256: string; version: string };
  proposals: { id: string; version: string }[];
}
interface WorkStepRecord { step: number; mode: Id | null; works: WorkRecord[]; links: LinkRecord[] }
interface WorkRecord {
  part: Id; work: Id; workUnit: string;
  referenceOutput: TV; capacity: TV; yield: TV;
  resources: { resource: Id; available: TV; limit: TV }[];  // available copies remainderForWork, refusal ids kept
  resourceLimitedOutput: TV; preLinkOutput: TV; output: TV; workNotDone: TV;
  binding: string[];
}
interface LinkRecord { part: Id; feeds: Id; ratio: Rational; lagSteps: number; semantics: string; cap: TV }
```

The work hash is SHA-256 over `canonicalJson(workTrace)`, the same way `traceHash` works.

**Entry point:** `runWork(modelDoc, scenarioDoc, attachmentDoc, {drawPolicy?})`, returning `{base, work}`.

- It validates the attachment, calls `run()` once, and computes everything from that trace through a pure `workFromTrace`.
- Without an attachment you call `run()` as now. There is never an empty WorkTrace or a zero-work result.

## 3. Ambiguous or unsupported calculations

1. **Zero and refused values in a min.** §4.2 says a known zero reference output gives output 0 and work not done 0. It does not cover the case where another term is a known 0 (yield 0, nothing left for work, or a zero cap) and a third is refused.
   - Every term is 0 or more, so that min is also 0, and invariant 8 would allow reporting it.
   - §4.3 and §5.3 read as "refuse" instead. See decision 5.
2. **Ties in the binding limit.** The contract does not say. The proposal here is to list every term equal to the output in a fixed order: reference output, capacity, resources by id, links by id. The list would be empty when the output is refused.
3. **Bound by a resource with no shortfall.** If the reference output needs more than the requirement pays for, the binding limit is a resource although the PAM shortfall is 0.
   - Example: requirement 10, upkeep 2, recipe 2 per case, reference output 5. The part can do 4 cases even when fully supplied.
   - This is not wrong, but it is easy to misread. A flag is proposed rather than a validation error.
4. **Reference-output rule.** "A rule on explicitly mapped external scenario loads" leaves open which forms and whose loads.
   - The smallest reading is the existing requirement forms on the part's own loads, with the existing checks that values are not negative.
   - Still open: whether the Q-009 ban on negative coefficients applies. In CANON it is a rule for requirement, not for a reference output.
5. **Which unit count.** "Known Part.units" could mean the model's starting count. The trace records units at the start of step t, and only that reading avoids looking ahead.
   - Without P-LOAD-01, units are refused from the step after a part's first shortfall (Q-016). A per-unit capacity is then refused for most of a stress run.
   - That is what §4.3 asks for, but it means per-unit results exist only in runs with no shortfall, or runs with P-LOAD-01 enabled.
6. **More than one work type on a part.** §4.1 says at most one, which reads as a validation error. §4.3 says such work is refused, which is a refusal at run time.
7. **Shared, limited support.** The engine cannot detect that support is shared out between dependants. It can only refuse a link that is declared that way.
   - This matters for the obvious demonstration. In the organisation fixture, IT support feeds both finance and scheduling, and "tickets resolved" is work shared out between them.
   - A non-exclusive mapping would be something like "systems kept available". Choosing it is a mapping claim, not an engine choice.
8. **Matching units on a link.** §5.3 asks for ratios and work units to be "explicitly matched" without saying how. In the attachment above, each link carries both units and validation checks them against the two works, which also catches an out-of-date link.
9. **Refusal categories.** The core's seven categories are a closed list, and adding one changes core types. The seven are enough:
   - unsupported-rule for a cycle, a lag above 0, shared support, or a second work type;
   - unknown-prerequisite for anything that reads a refused value, including anything downstream of a cycle;
   - ids prefixed `work/`, each carrying its proposal id.

These are already settled by the contract and need no ruling:

- Yield scales only the resource term, not capacity (test D).
- A receipt beyond requirement counts towards what is left for work (test F gives 10, not 8).
- A missing yield must be written as a `{gap}`, because an absent field is a validation error (test E).
- A resource the part requires but the recipe leaves out never limits work.

## 4. Smallest implementation sequence

Each step is its own commit and builds on its own. Each ends with `npm run check` passing and tests/golden/hashes.json unchanged byte for byte.

1. Record James's rulings on section 5 in docs/decisions.md.
2. Optional, and the only core change: move `seriesAt` unchanged into an exported core module that run.ts imports.
   - Confirm the four golden hashes, and regenerate the handover if declarations moved.
   - The alternative is a copy in the extension. That leaves the core untouched but can drift from it.
3. Write src/proposals/work/attachment.ts: the types and validator, with validation tests.
4. Write src/proposals/work/run-work.ts. For each step:
   - compute reference output, capacity, recipe limits and pre-link output;
   - then go through the enabled links only, in dependency order, with ties broken by id;
   - refuse cycle members, then apply caps and compute output, work not done and the binding limit.

   `runWork` wraps this.
5. Write the tests:
   - tests A to K and the eight extras;
   - the base trace from `runWork` equals `run()` and the golden hash, for all four fixture runs;
   - the base trace is deep-frozen before `workFromTrace`, which proves it is never changed;
   - the work hash is deterministic.
6. Add a fixture: an attachment over the existing organisation model, with no model edit. It gets its own golden file, tests/golden/work-hashes.json, so hashes.json is never touched.
7. Register P-WORK-01 and P-DEP-01 and regenerate the handover.
   - Add them to PROPOSALS, opted in by attachment and not through `Scenario.enable`.
   - Add them to docs/proposals.md, docs/decisions.md and docs/rule-register.md.
   - Regenerate the handover; its test needs the `| P-WORK-01 |` rows.
   - The wording must avoid the movement words that tests/static.test.ts bans in docs, especially when describing refusals that follow a refused upstream value.
8. Run `npm run check`, check a fresh clone, then push.

## 5. Decisions for James before implementation

The last column says whether implementation can start without that answer.

| # | Decision | Recommendation | Blocks |
|---|---|---|---|
| 1 | Replace "target" | "Reference output", and "work not done" for the deficit | Yes |
| 2 | Accept the D-3 restriction | Accept. Lag and shared support are accepted by the schema and refused at run, so tests K and 3 can run | Yes |
| 3 | Work over P-LOAD-01 runs | Allow. Use start-of-step units. Without P-LOAD-01, per-unit capacity is refused after a part's first shortfall | Yes |
| 4 | Stated upkeep for recipe resources | Require it, 0 allowed. This is what the contract's "can be read" implies | Yes |
| 5 | Zero rule | As written: only a known zero reference output settles the result. Everything else is strict, like the core | Yes |
| 6 | Reference-output forms | Requirement forms on the part's own loads, with all the existing checks including Q-009 | Yes |
| 7 | Part.capacity and Part.efficiency | Leave them unread, mark them replaced by the attachment, and drop them at the next schema bump | No |
| 8 | Several work types on one part | Refuse at run (unsupported-rule), as §4.3 says | No |
| 9 | Refusal categories | Reuse the seven, with `work/` ids | No |
| 10 | Binding the attachment to the model | The exact mapping digest, so any model edit invalidates the attachment | No |
| 11 | Core change | Move `seriesAt` (step 2) | No |
| 12 | Schema version | Bump it in its own commit, separate from this work, regenerating the golden hashes once | No |
| 13 | Fixture mapping | IT support's work defined as non-exclusive, or a fixture that shows the refusal | No |
