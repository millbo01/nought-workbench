# Proposals

Every rule, default or convention in the engine that is not CANON, with the reason it is there. None of these is theory; each can be withdrawn or replaced by James. James's rulings on open questions are in [decisions.md](decisions.md); where a ruling is carried out by mapping data or a core check, it is named below. A run lists every proposal in force in its stamp (`stamp.proposals`), so no result can be read as canonical while a proposal shaped it.

**Ids.** P-ALLOC-01, P-LOAD-01 and P-IPF-01 to P-IPF-06 are the ids of the Unified Core Spec v0.2 catalogue (engine 0.2.0, 2026-10-20). P-WORK-01 and P-DEP-01 are the Functional Work and Dependencies Contract's (2026-10-20); P-LOAD-02 is the tracking-only backlog handoff's (2026-10-20); P-COUPLE-01 is the coupled-feedback v0.3 design resolutions' (2026-10-20); P-HANDOFF-01 is the carryable cross-stage handovers scope's (approved in principle 2026-10-21). A handover run's base stamp names the proposals of the runner it is composed from (P-COUPLE-01 where coupled), and its handover trace names P-HANDOFF-01. PROP- ids are the engine's own, kept until they can be matched to that catalogue (Q-030).

Kinds:
- **Policy:** passed in explicitly; the core never uses it by default.
- **Core loop or schema:** the engine cannot run at all without some choice here; the choice is made as narrowly as possible, written down, and listed in every run it affects.
- **Check:** a flag or validation drawn from APPLICATION.md, labelled as a proposal, never an error that CANON would not give.
- **Work extension:** computed only by `runWork`, after and apart from the base run, for a work attachment that enables it; the base run never sees it.
- **Tracking extension:** computed only by `runBacklog` or `backlogFromTraces`, from finished base and work traces, and never fed back into a run.
- **Coupling extension:** computed only by `runCoupled`, which takes the base run, the work and the ledger one step at a time and gives an account's eligible obligations to one load; never in `run()`, `runWork()` or `runBacklog()`.
- **Multiwork extension:** computed in the work layer of a work run given a multiwork attachment through its options (`runWork`, `runBacklog`, `runCoupled`, `runHandoff`), for the parts it arranges; never in `run()`, and never by the base run's modes.
- **Handover extension:** computed only by `runHandoff`, which runs the unchanged `runCoupled` or `runBacklog` on derived documents in which an account's completions become another account's admissions; never inside any other runner.
- **Disabled:** registered so its id is reserved, and refused if anyone tries to use it.

| ID | Kind | In force | Summary |
|---|---|---|---|
| P-ALLOC-01 | policy | only when passed; used by the fixtures | Graded overcommitment rule: James's working position, formalised (was PROP-DRAW-01) |
| P-LOAD-01 | opt-in | only where a scenario enables it | Per-part unit loss and rebuilding, form approved by James 2026-10-20; backlog and damage dials undefined |
| P-WORK-01 | work extension | only in runWork, for an attachment that enables it | Useful work from a part's own resources: reference output, recipe, capacity, yield, work not done (approved as optional 2026-10-20) |
| P-DEP-01 | work extension | only in runWork, for an attachment that maps links | A same-step, non-exclusive functional cap on an existing dependency (approved as optional 2026-10-20) |
| P-LOAD-02 | tracking extension | only in runBacklog, for a backlog attachment that enables it | Carryable obligations, tracking only: a ledger of eligible obligations from a finished run and its work, with no feedback (approved 2026-10-20) |
| P-COUPLE-01 | coupling extension | only in runCoupled, for a coupling attachment that enables it | Coupled backlog feedback: an account's eligible obligations generate one load on its own part, step by step (v0.3 design resolutions approved; implementation authorised 2026-10-20) |
| P-MULTIWORK-01 | multiwork extension | only in a work run given a multiwork attachment | Several works on one part, drawing on one finite productive balance under an explicitly mapped, dated arrangement: fixed shares or a strict order, with no default (approved 2026-10-21; first release) |
| P-HANDOFF-01 | handover extension | only in runHandoff, for a handover attachment that enables it | Carryable cross-stage handovers: an account's completions become admissions of an account on another part, same-step or next-step as declared, forward-only, by composition of the unchanged runners (approved in principle 2026-10-21; first release) |
| P-IPF-01 to P-IPF-06 | disabled | never | The IPF proposals of the Unified Core Spec catalogue; not defined in this repository |
| PROP-STEP-01 | core loop | every run | Step sequence, the timing of sensing, interventions before switches |
| PROP-FLOW-01 | core loop | every run | Only stores hold resource from one step to the next |
| PROP-RANK-01 | core loop | every run | Position within a layer as documented at mapping; parts with no path to the top in the bottom layer (decision Q-017) |
| PROP-SENSE-01 | schema | runs whose model sets a dial | A sending dial per level says what its producing part sends when short (decision Q-004) |
| PROP-ROUTE-01 | core loop | every run | Route capacity as a rule on sensed levels; routes from the shared flow only (decision Q-010); no route, no network cap |
| PROP-STORE-01 | schema | runs with a store | Store release and fill limits as rules on sensed levels |
| PROP-SILENCE-01 | schema | runs where a rule reads a level | A rule states its response to silence read as alarm |
| PROP-TOP-01 | core loop | runs whose top is an information gap, with a policy that declares it | Allocation under an unknown top (0.1.0): a resource's draw is stated only where the policy gives the same valid result under every candidate top (decision Q3, 2026-10-22) |
| APP-04 | check | scenario validation | A scenario is a load applied to a system, not a system |
| APP-08 | check | every run (flag) | A top short while another part is not is flagged |

## P-ALLOC-01: graded overcommitment rule

**Source:** James's working position, addendum of 2026-10-20: "When committed access exceeds what arrives, lower-ranked parts lose more, and the grading comes from the settings (access rules), not from a strict queue." Renamed from PROP-DRAW-01 to the catalogue id on 2026-10-20; the behaviour is unchanged.

**Why a proposal:** CANON does not say who takes what from the shared flow within a step (C3.4b, C4.2; Q-001, parked: the draw stays a proposal). Whether a part draws up to its access when that exceeds its requirement was Q-002, now decided: it does (decisions.md), and the core checks that of every policy. The core has only the allocation interface (`DrawPolicy`) and no default: without a policy every draw is refused ("unspecified allocation policy") and everything else is computed. The core checks any policy against the limits CANON does state (realised flow never above access or route capacity, C2.5n; nothing taken that did not enter, C1.1; stores within their room, C2.6), and refuses a result that breaks one rather than using it.

**What it does** (src/proposals/allocation-graded.ts):
1. A part's committed draw is its access, capped by its route.
2. Where the committed draws fit within what entered, each part receives its committed draw, even beyond its requirement. Stores fill from what is left, in proportion to their room.
3. Where they do not fit, the excess is taken from the parts other than the top, in proportion to committed draw times a **grading** declared with each part's setting (`proposalData["P-ALLOC-01"].grading`, a positive number), with no part taken below zero (proportional water-filling, exact). Lower-ranked parts carry larger gradings, so they lose more. A missing grading refuses the draw as an unknown prerequisite.
4. The top is lowered only once every other part's draw is at zero.

**Where this goes beyond James's words** (each a formalisation choice, for him to confirm or change):
- "Grading comes from the settings" is read as a number declared with each setting. An alternative that uses no new number: take the cut as if every setting were read at a common lower sensed level, so a setting that falls more steeply loses more. That needs settings that read a common level and is not implemented.
- The cut is proportional to committed draw times grading. A strict queue is the special case of very unequal gradings; the rule never reaches it exactly.
- Parts draw up to access, not up to requirement: no longer a formalisation choice, but decision Q-002, checked by the core for every policy. It is also what lets CANON 1's fourth exception (taking back what a part receives beyond its requirement) be expressed at all.
- Store filling (point 2) is part of the draw because a store taking from the shared flow is a draw on it; proportional to room is a placeholder (Q-003).
- Point 4 reads CANON 4's "limiting everyone else's access first" as "the top is lowered only after every other part is at zero".
- **No look-ahead** (alignment item 9): the rule divides what actually arrives in this step. That is the arithmetic of the shared flow, an arrangement declared in advance, not the governor responding to this step's arrival; the governor sees the consequence only through levels in a later step. If James reads the graded cut as the governor's response, it would be look-ahead and needs another form (Q-031).

**Checks:** `checkGradedAllocationData(model)` flags a missing or non-positive grading, and any mode where a lower-ranked part has a smaller grading than a higher-ranked one for the same resource. Both fixtures pass.

**Under an unknown top (2026-10-22):** P-ALLOC-01 declares PROP-TOP-01's evaluation (`unknownTop: 'evaluate-admissible-tops'`). Its `draw` is pure and reads nothing but its input, so with the top an information gap the core may call it once for each candidate top (PROP-TOP-01, below). The rule above is unchanged: under a known top, it is called once, exactly as before.

## P-LOAD-01: per-part unit loss and rebuild (approved form, off by default)

The per-part dials of the 2026-10-20 addendum, named by the catalogue: `loadDials` on a part, with `unitLossUnderShortfall`, `unitRebuilding`, `backlog` and `damage`, each a set of parameters or an explicit gap. The unit-loss and rebuild dials are read only in a run whose scenario enables P-LOAD-01, by the approved form below. The backlog and damage dials are never read (P-LOAD-02 does not read the backlog dial either), and damage stays refused (Q-015). Without P-LOAD-01, units after a shortfall are refused as an unsupported rule naming P-LOAD-01 (Q-016). P-LOAD-01 is not an allocation policy: a run given it as one stops at initialisation. Validation checks the dials whenever they are present (`load-dial`).

### The form for unit loss and rebuilding (approved by James, 2026-10-20)

Asked for under Q-016 and approved as written (decisions.md). It is off by default and enabled per run only when a scenario asks: `"enable": ["P-LOAD-01"]`. The parameters use the existing dial shape (a set of named numbers on the part).

- **Unit loss under shortfall** (`loadDials.unitLossUnderShortfall`): one rate per resource, `parameters: { <resource>: k }`, the units lost per unit of upkeep not covered. At the end of each step, the part loses `min(units, the largest of k x upkeep shortfall over its resources)`. It loses nothing for work shortfall alone: with its upkeep covered, its units are kept and the work is simply not done.
- **Rebuilding** (`loadDials.unitRebuilding`): `parameters: { perStep: m, <resource>: c }`, at most m units rebuilt per step, at a cost of c of each named resource per unit rebuilt. Only units lost under the rule above can be rebuilt. Rebuilding is paid from the unused amount left after every part has drawn and every store has filled (CANON 3: "paid from what is left once every part has drawn"): rebuilt = `min(units lost so far, m, the smallest of unused / c over the named resources)`. The cost is recorded in the reconciliation as a use of the unused amount, and the rebuilt units count from the next step.
- **Several parts rebuilding from one resource** share what is left in proportion to their claims (`c x min(units lost so far, m)`), as stores share what is left under P-ALLOC-01.
- **Units become unit equivalents** (exact rationals, not whole counts) for a part with these dials, so no rounding rule is needed.
- **Choices in this form, for James:**
  - loss driven by upkeep shortfall rather than all shortfall;
  - the largest rather than the sum across resources;
  - rebuilding after stores fill rather than sharing with them;
  - proportional sharing between parts;
  - fractional units.
- **Not covered:** the backlog and damage dials stay undefined; damage remains Q-015 (parked).
- **How the engine runs it** (engineering, within the approved form):
  - A part needs both dials. With one, its units are refused (unknown prerequisite); with neither, they are refused after a shortfall as before (Q-016's refusal names P-LOAD-01).
  - "Units lost so far" includes this step's loss, so a unit lost in a step can be rebuilt in the same step if something is left.
  - What is left for rebuilding is the unused amount after every part drew and every store filled. A part's share that one resource cannot use (because another named resource binds) stays unused; it is not shared again.
  - The spend appears in the reconciliation as `rebuilding`; `unused` is what is left after it. CANON 1's ledger still reads "fully used" as nothing left after parts and stores.
  - Each part's unit record shows `lost` and `rebuilt` for the step; both count from the next step.
  - The fixture variant `organisation-unit-loss` enables it. IT support and scheduling lose units while their upkeep goes uncovered, and rebuild them from the money left once income recovers.

## P-WORK-01: useful work from a part's own resources (optional, approved 2026-10-20)

**Source:** the "N-ought Functional Work and Dependencies Contract" v0.2, as resolved by the "Work Contract Review Resolution" v0.3 with the review's seven amendments ([work-contract-review.md](work-contract-review.md)), approved by James on 2026-10-20 as an optional modelling proposal, not a CANON law. The rulings are in [decisions.md](decisions.md) (work extension). The contract revision this engine computes is 0.3.

**Why a proposal:** CANON says what parts are (C2.3) and that work not done never lowers requirement (C3.12c). APPLICATION's capacity line says how much work a part gets from what it draws is a property of the part, fixed at mapping, and that a part limited by its capacity, not its access, has no shortfall: what it does not do is work not done. Neither gives a rule for counting work. The base run counts resources only: requirement, what is received, shortfall, and what is left for work after upkeep (`remainderForWork`).

**Where it runs:** only in `runWork(modelDoc, scenarioDoc, attachmentDoc, options)` (src/proposals/work/). It validates a work attachment against the model and the model's exact digest, runs the unchanged `run()` once, and computes a separate, versioned work trace from that trace alone (`workFromTrace`, pure). `run()` never computes work, a scenario cannot enable P-WORK-01, and without an attachment there is no work result, not a result of 0.

**The attachment** (a separate document; examples in fixtures/work/): its version, id, the model's id and digest (`RunStamp.mapping.sha256`; decision 10), the proposals it enables with their versions, and per part at most one work:
- the work's id, its unit (`workUnit`, never a resource unit) and a definition of what is counted;
- `referenceOutputRule`: the reference output, a documented work benchmark or externally given workload, never a governor band, a part's demand or a PAM requirement (decision 1). Constant, linear or table on the part's own declared loads, non-negative and non-decreasing in this release (decision 6);
- `recipe`: resource per work unit, above 0, for resources the part requires and states upkeep for, 0 allowed (decision 4);
- `capacity`: a constant with a rationale for why it does not depend on the unit count, or a per-unit amount times the units at the start of the step (decision 3);
- `yield`: a fraction in [0, 1] of the mapped recipe, not a physical efficiency.

Any of the last four may be an explicit gap, refused where used and never read as 0 or 1.

**The calculation** (per part p, step t and recipe resource r):
- available = the base trace's `remainderForWork[p, r, t]`, as it stands there (with its refusal ids);
- recipe limit = available / recipe amount; resource-limited output = the least recipe limit;
- yielded resource output = yield x resource-limited output;
- pre-dependency output = the least of reference output, capacity and yielded resource output;
- actual output = the least of pre-dependency output and each enabled P-DEP-01 cap into p;
- work not done = reference output less actual output, never below 0.

**Known zeros** (decision 5): every term is 0 or more, so a known 0 settles a minimum, or the product with yield, even where another term is refused. The binding report then lists the terms equal to the output and, apart, the refused (unresolved) terms; it is refused where the output is. A known 0 never settles an unsupported rule on the record's own work or its own incoming links (several works on the part, a same-step cycle through it, a lag, finite shared support).

**Refused, not computed:** several works on one part (decision 8: how one recipe is shared is not given); a part that sets its own access, which has no receipt or unit count in the base trace (Q-014); a per-unit capacity where the base trace refuses the unit count (Q-016 without P-LOAD-01); a computed reference output below 0 (a guard: with loads non-negative from schema 0.4.0, no valid document gives one). Refusal ids it creates start `work/`; refusals carried from the base trace keep their ids (decision 9).

**What it never changes:** the base trace. No work value changes a governor, setting, mode, sensed level, requirement, access, receipt, rank, store, unit count or shortfall, and no work value becomes a level (a level cannot measure work). A part may receive more than it uses productively: the receipt, excess and reconciliation stand, with no refund.

**Checks:** validation codes `work-*` (handover section 2), with flags for what is accepted and refused when computed (`work-several-on-part`, `work-link-lag`, `work-link-exhaustible`, `work-separate-case`).

**Fixtures:** `organisation-availability` and `organisation-shared-support` over the organisation model (decision 13, numbers hypothetical, for James to review), with golden work hashes in tests/golden/work-hashes.json (`npm run golden:work`). In the availability example IT support's work is keeping the shared systems up; in the income cut it has no money left for work from step 2, its systems are down, and its links hold finance and scheduling at 0.

## P-DEP-01: a functional cap on an existing dependency (optional, approved 2026-10-20)

**Source and status:** as P-WORK-01. An ordinary dependency stays rank-only: P-DEP-01 adds a cap only where an attachment that enables it maps a link.

**A link:** `part` (upstream, A) and `feeds` (downstream, B), matching an existing dependency in which A feeds B; the two works' units (`workUnits`), checked against the works; `ratio`, A's work units per one of B's, above 0; `lagSteps`; `semantics`; a rationale.

**The cap:** B's actual output is at most A's actual output / ratio, in the same step. Nothing is deducted from A, and A's output is not divided between its dependants: the link is a limit on B, not a supply to it, and never a resource route.

**First-release scope** (D-3, D-4, accepted 2026-10-20):
- `non-exclusive-enablement` only: A's work enables B without being used up by it (for example, systems kept available that several parts use at once). A link declared `exhaustible-support` (finite support shared between recipients) is accepted and refused when computed, as an unsupported rule: how A's output would be divided is not given.
- Same step only: a lag above 0 is accepted and refused when computed.
- Acyclic only: the parts of a same-step cycle among enabled links have their actual output refused (no evaluation order is given, and none is chosen); their own pre-dependency output stands, and parts outside the cycle are computed.
- Links are evaluated in dependency order, upstream first, ties by id. A refused upstream output refuses the downstream output (unless a known 0 settles it), and the downstream part keeps its reference output, pre-dependency output, resource limits and every PAM value.

### Not yet given for P-WORK-01 and P-DEP-01 (later, not blocking)

Logged in [open-questions.md](open-questions.md) and set out with options in the handover (section 6).

- WQ-01: how finite, shared support is divided between several recipients (D-4): a distinct proposal, never a part-to-part resource transfer.
- WQ-02: lagged links (D-3); they need output history and temporal rules, and should be checked against CANON 4's lag note (C4.4n2) and Q-007.
- WQ-03: how work done or not done affects backlog, physical state, future loads or recovery: a state-transition proposal.
- WQ-04: under which evidence standards a work quantity may become a level the governor senses; sensing would take the producing part's own access (C3.1b).
- WQ-05: which mapping decisions need higher-confidence documentary evidence in paid organisational diagnostics.
- WQ-06: widening the reference-output rule family beyond non-negative, non-decreasing forms (decision 6).
- WQ-07: the deprecation of `Part.capacity` and `Part.efficiency` (decision 7), kept in schema 0.4.0.

## P-LOAD-02: carryable obligations, tracking only (approved 2026-10-20)

**Source:** "Nought_Engine_P-LOAD-02_Tracking_Only_Implementation_Handoff_v0.1_APPROVED.md", approved by James on 2026-10-20, after the read-only review of the Q-028 and P-LOAD-02 design ([dynamic-arrangements-review.md](dynamic-arrangements-review.md)). The rulings are in [decisions.md](decisions.md) (P-LOAD-02). An optional, application-level proposal: not CANON, and not an eighth component.

**Why a proposal:** CANON has no backlog. P-WORK-01's work not done is a difference within one step, not a stock. The ledger counts eligible, carryable obligations from declared inputs and modelled work: a modelled quantity, never an observed count.

**Where it runs:** only in `runBacklog(model, scenario, workAttachment, backlogAttachment, options)`, which validates and calls `runWork` once, or in the pure `backlogFromTraces(baseTrace, workTrace, attachment, digest)` (src/proposals/backlog/). `run()` and `runWork()` never compute it, a scenario cannot enable it, and nothing it computes reaches a load, a requirement, a reference output, a draw, a unit count, P-LOAD-01 or a level.

**The attachment** (a separate document; examples in fixtures/backlog/): its version and id; the model by id and exact digest, and the work attachment by id, version and exact digest, so one mapping serves every scenario of that model; the opt-in (`P-LOAD-02` at 0.1); and per part and work at most one account:
- an obligation unit, exactly the work's unit (no conversion);
- `indivisible` or `divisible`, stated; an indivisible account takes whole counts only;
- the eligibility claim (what an eligible, unfinished obligation is, why it carries, the boundary), the one-to-one closure claim (`oneToOne: true`: one unit of actual output is one completed eligible obligation) and the zero-withdrawal claim (`zeroEveryStep: true`, the only withdrawal allowed);
- the opening balance (before step 0's admissions) and the new admissions per step (an entry holds until the next; never earlier backlog), each may be a gap;
- an evidence label on each of these five claims: `documented`, `estimated`, `assumed` or `unknown`, with its source.

**The ledger** (per account p and step t, in the obligation unit):
- B_t: the opening balance; D_t = B_t + N_t, the eligible obligations;
- R_t, O_t: the work record's reference and actual output, unchanged;
- C_t = O_t, only where every guard holds; W_t = 0, as asserted;
- B_{t+1} = D_t - C_t - W_t, so that B_t + N_t = C_t + W_t + B_{t+1}, exactly.

**Guards:** the eligibility, closure and withdrawal claims are not unknown; D_t, R_t and O_t are known; R_t <= D_t (R_t below D_t is fine); not D_t = 0 with O_t above 0; and, for an indivisible account, O_t is a whole number. A failed guard refuses C_t and B_{t+1}; nothing is clamped, rounded or invented. There is no known-zero rule in the ledger: an output of 0 never stands in for an unknown balance or claim. A refused balance refuses every later balance of the account, with no restart from an observed count; later admissions and the work's values stay known, and other accounts are unaffected.

**Evidence:** an assumed or estimated claim makes every result of its account conditional, listed on each record (`conditionalOn`) and in the stamp. An unknown claim refuses what depends on it: an unknown eligibility, closure or withdrawal claim refuses completions and so the balance; an unknown opening balance or admissions claim refuses that count.

**Trace:** a separate `BacklogTrace`, bound to the base and work traces by their hashes, and to the model, work attachment and backlog attachment by their digests, with the CANON fingerprint copied from the base run. Each record carries its diagnostics: a refusal inherited from the work trace, a missing or unknown ledger input, a closure guard, a fractional closure of indivisible obligations, conditional evidence. Refusal ids it creates start `backlog/` and name P-LOAD-02; ids from the work trace are kept.

**Fixtures:** `two-step-casework` (a model, scenario, work and backlog attachment that reproduce acceptance test T01; `npm run example:backlog` prints its ledger) and `organisation-obligations` over the organisation model and the availability work (numbers hypothetical, every claim assumed). Golden backlog hashes are in tests/golden/backlog-hashes.json (`npm run golden:backlog`).

**Not in this release:** feedback from the backlog into any load or later step; that is P-COUPLE-01's, on its own entry point (below), and P-LOAD-02 itself stays tracking only (CF-D01). Also: withdrawals other than 0; expiry, ageing, priority, partial completion; a restart from an observed count; more than one account per part and work. P-LOAD-01's backlog dial stays dormant: P-LOAD-02 never reads it.

## P-COUPLE-01: coupled backlog feedback (v0.3 resolutions approved; implementation authorised 2026-10-20)

**Source:** "Nought_Engine_Coupled_Feedback_Review_Resolutions_v0.3_APPROVED.md" (rulings CF-D01 to CF-D10, scope confirmations F.1 to F.5), with the v0.2 coupled-feedback handoff and its review ([coupled-feedback-review.md](coupled-feedback-review.md)). The scope as confirmed is [p-couple-01-scope.md](p-couple-01-scope.md), and James's authorisation of 2026-10-20 is in [decisions.md](decisions.md). An optional proposal, at contract version 0.1: not CANON, and no new law.

**Why a proposal:** CANON has no backlog, and P-LOAD-02 only tracks one. The approved active-workload rule says when a ledger's eligible obligations may stand for a load: when the account's whole eligible balance is substantiated as active workload of that load. The existing requirement rule then turns the load into a resource requirement, as it turns any load.

**Where it runs:** only in `runCoupled(model, scenario, workAttachment, backlogAttachment, couplingAttachment, options)` (src/proposals/couple/). `run()`, `runWork()` and `runBacklog()` never couple, and a scenario cannot enable it.

**The attachment** (a separate document; examples in fixtures/couple/) holds:
- its version and id;
- the model by id and exact digest, and the backlog attachment by id, version and exact digest (which binds its work attachment in turn);
- the opt-in (`P-COUPLE-01` at 0.1);
- one or more bindings, each naming an account, the account's own part, and a load that part declares in exactly the account's obligation unit, with the active-workload claim (a statement and its evidence label). The claim holds in every step of the run (F.2).

A load has one source, and an account generates one load (CF-D02).

**Validation** rejects these before anything is computed, with no fallback to the scenario's loads (F.4):
- a cross-part binding, an undeclared load or a unit mismatch;
- a load or an account bound twice;
- an unknown active-workload claim (CF-D03);
- a scenario that also gives a bound load a series.

It flags these without rejecting them:
- an assumed or estimated claim: a conditional simulation (CF-D03);
- a reference-output rule not of the proven form R = b x G with b <= 1 (CF-D07); the ledger's runtime guard R_t <= D_t decides;
- what reads each bound load: the preflight impact diagnostic (CF-D06);
- a level measuring a bound load (CF-D10).

**The coupled run**, for each step t and each binding:
1. G_t = D_t = B_t + N_t (G_0 = B_0 + N_0, F.3);
2. one PAM step with G_t given for the bound load;
3. one work step reading it;
4. one ledger closure, giving B_{t+1} and so G_{t+1}.

Nothing else is added. A level's reading of G_t is tagged `computed`, and what it sends and delivers follows its producing part and route (CF-D04, CF-D10). A refused G refuses what the mapped rules make depend on it, and nothing else. A refused balance refuses every later G of its binding, with no restart (CF-D06).

**Records:**
- The base trace's stamp names P-COUPLE-01 (CF-D04).
- The work and backlog traces are as their runners make them.
- A coupling trace of its own is always delivered with them. It carries G_t per step; each binding's claim, evidence, conditions, static guard and impact; the base, work and backlog trace hashes; the refusal path of every refusal behind a refused G; and the digest of the replay scenario, labelled derived (CF-D05).
- `couplingReplayScenario` gives that scenario. The unchanged `runBacklog` on it gives the same known figures and refuses the same fields.

**Fixtures:**
- `two-step-coupled`: acceptance check CF-R03. `npm run example:coupled` prints it with its evidence and conditions.
- `organisation-caseload-unit-loss`: the organisation model with P-LOAD-01 enabled. Its service caseload is generated from an account of open service cases, and sensed by a level that finance produces.

Golden hashes of all four traces are in tests/golden/couple-hashes.json (`npm run golden:couple`).

**Not in this release:** partial, blocked or scheduled obligations; ageing, expiry, withdrawals; cross-account or cross-part bindings; prioritisation; damage or degradation; inferred demand; any extra resource draw for work; delayed sensing of a generated load; Q-028; IPF.

## P-HANDOFF-01: carryable cross-stage handovers (approved in principle 2026-10-21; first release)

**Source:** [p-handoff-01-scope.md](p-handoff-01-scope.md), reviewed by James on 2026-10-21. It is approved in principle, with four decisions, and its first release is authorised ([decisions.md](decisions.md)). It is an optional work-accounting proposal at contract version 0.1: not CANON, not a PAM resource transfer, and no new law.

**Why a proposal:** nothing else carries one account's completions into another account:
- P-LOAD-02's admissions are an external input series;
- P-COUPLE-01 binds an account only to a load of its own part;
- P-DEP-01 is a same-step cap that keeps no stock.

So a two-stage workflow (a booking, then a first visit) could not let the second stage complete work admitted in earlier steps.

**Where it runs:** only in `runHandoff(model, scenario, workAttachment, backlogAttachment, couplingAttachment | null, handoffAttachment, options)` (src/proposals/handoff/). It runs the unchanged `runCoupled`, or `runBacklog` where nothing is coupled, on derived documents. No runner was changed.

**The attachment** (a separate document; examples in fixtures/handoff/) holds:
- its version and id;
- the model, the backlog attachment and, where the run is coupled, the coupling attachment, each by id, version and exact digest (`null` for no coupling, stated);
- the opt-in, `P-HANDOFF-01` at 0.1;
- handovers, each with:
  - `from` and `to` accounts on different parts;
  - a correspondence: k per completion, above 0, with `fromUnit` and `toUnit` exactly the accounts' obligation units;
  - timing: `same-step` or `next-step`, declared, with no default;
  - an eligibility claim;
  - for next-step, the opening in transit (a value or an explicit gap).

  Each claim carries evidence: `documented`, `estimated`, `assumed` or `unknown`.

**The calculation**, for handover h from U to V in step t:
- H_t = k x C^U_t, refused where C^U_t is refused, or where it is fractional and V is indivisible;
- A_t = H_t (same-step), or H_{t-1} (next-step; A_0 is the opening in transit);
- N^V_t = V's own series + A_t;
- then P-LOAD-02's ledger and, where V is bound, P-COUPLE-01, unchanged.

V therefore completes from D^V_t = B^V_t + N^V_t, including obligations admitted in earlier steps.

**Forward-only, and passes:**
- **The analysis.** A conservative static analysis (`handoffAnalysis`) finds what each downstream account's admissions can reach. It covers its generated load, shared resource allocations, levels and the rules reading them, governor bands and mode switches (which reach everything), P-DEP-01 links and further handovers.
- **Refusal.** A handover on a cycle of dependence is refused when computed (`handoff/unsupported-rule not forward-only <h>`).
- **Passes.** The rest are computed in a number of passes fixed in advance: 1 + the longest chain of dependence. Pass 0 holds explicit gaps; no pass repeats to converge.
- **The safeguard.** Every upstream must be identical in the last two passes, and each handover must conserve. A failure throws, with nothing returned.

**Rejected before anything is computed:**
- an unknown account, the same account at both ends, or both accounts on one part;
- units that are not the accounts' own, or a ratio of 0 or less;
- a missing or unknown timing;
- a missing or misplaced opening in transit;
- an unknown claim;
- two handovers out of one account, or a cycle of handovers;
- a P-DEP-01 link mapped beside the handover;
- digests that do not match.

**Flagged:** assumed or estimated claims, a downstream account with admissions of its own (double counting), k not whole into an indivisible account, an unknown opening in transit, the reach of each handover, and a handover that is not forward-only.

**Records:** the handover trace and the derived documents are delivered with the last pass's traces.
- **The handover trace's stamp** holds the passes, the trace hashes, the derived attachments' digests labelled derived beside the mapped ones, and per handover its claims, conditions and analysis.
- **Per step and handover** it records completions, the amount handed over, the amount admitted, and what is in transit.
- **The derived admissions claim** says it is generated from upstream completions.
- **Replay.** The unchanged runner on the derived documents reproduces the traces byte for byte.

**Fixtures:**
- `two-stage-carry-over`: service clears its earlier balance once its hours rise;
- `referral-pathway-baseline` and `referral-pathway-more-visiting`: the synthetic Westbridge referral pathway, where 71 visiting hours clear the 12 visits booked earlier by week 4.

Golden hashes of all five traces are in tests/golden/handoff-hashes.json (`npm run golden:handoff`).

**Not in this release:** handovers between parts that influence each other (refused, even next-step, where an in-loop coordinator would compute them); one account's completions divided or duplicated between accounts (HQ-01); rework loops (HQ-03); priority between carried and new obligations (HQ-04); withdrawals, ageing or expiry; any resource moved by a handover.

## P-MULTIWORK-01: several works on one part (approved 2026-10-21; first release)

**Source:** `wq-08-scope.md`, approved by James on 2026-10-21 with three refinements ([decisions.md](decisions.md)). It is an optional work-layer proposal at contract version 0.1: not CANON, and no change to PAM.

**Why a proposal:** P-WORK-01 refuses several works on one part (its decision 8: how one recipe is shared is not given). A part that does several kinds of productive work from one finite balance (James's framing of 2026-10-21) needs that division given, and only an organisation's documented arrangement can give it.

**Where it runs:** in the work layer of `runWork`, `runBacklog`, `runCoupled` and `runHandoff`, when `options.multiwork` gives an attachment (src/proposals/multiwork/). Without one, every runner and trace is exactly as before. P-LOAD-02, P-COUPLE-01 and P-HANDOFF-01 are reused unchanged.

**The attachment** (format 0.1.0) holds:
- its version and id;
- the model and the work attachment by id, version and exact digest;
- the opt-in, `P-MULTIWORK-01` at 0.1;
- for each arranged part:
  - the shared resource;
  - every work on the part, with its divisibility (`indivisible`, `divisible` or a gap) and, for indivisible work, an optional declared rule `most-whole-units-within-allocation` with its evidence;
  - a dated schedule from step 0 of arrangements: fixed shares (amounts, with `whenBalanceBelow` `refuse` or `scale-down`, or fractions summing to at most 1; unused `idle` or `passed-on` in a stated order), strict priority (an order), or a gap. Each arrangement carries its evidence.

**The calculation** (part p, shared resource r, step t):
- **The balance** W is p's remainder for work on r, read once.
- **The arrangement** in force gives each work an amount: its share; or, under a strict order, what those before it left; plus, where unused hours are passed on, what no work used, offered once in order.
- **Each work's output** is P-WORK-01's least of reference output, capacity and yield x recipe limit on that amount. A fractional output is:
  - kept for divisible work;
  - completed in the most whole units for indivisible work with the declared rule;
  - refused otherwise.
- **Used** is output x recipe / yield, and **unused** is W less the sum used. A breach of either is a defect.
- **Unknown arrangement:** each work's output is refused. The balance, the works' demand and shortfall and each work's upper bound are kept, and a known 0 still settles.

**The outstanding-work trace,** returned by the runners with a ledger:
- **The bound:** the hours owed to each arranged part's accounts are at least the opening, plus the admissions, less the balance, never below 0, each account converted at its work's recipe / yield.
- **When it holds:** only where every counted account's claims, every counted yield (above 0), and each step's admissions and balance are known.
- **When it stops:** once refused, it stays refused.
- **The check:** a known amount owed below the bound is a defect.

**Rejected before anything is computed:**
- digests or versions that do not match;
- a part with fewer than two works;
- a works list that is not exactly the part's works;
- a work not using the shared resource, or a second resource shared by two works;
- a schedule that does not start at 0 or does not increase;
- shares that do not name every work, negative shares, or fractions above 1;
- a missing `whenBalanceBelow` or `unused`;
- an order that is not every work once;
- a whole-unit rule on work that is not indivisible;
- an account whose divisibility disagrees with its work's.

**Flagged:** an unknown or conditional arrangement, unknown divisibility, an unknown whole-unit rule, a per-unit capacity and a P-DEP-01 link (both refused when computed).

**Records:**
- **Each work step** of a run that uses it has an `allocations` record per arranged part, holding:
  - the balance, once;
  - per work, what it was given, used and produced, its upper bound, its ceiling and what the ceiling would need;
  - the used and unused hours;
  - the demand and the shortfall.
- **The work stamp** names the attachment and P-MULTIWORK-01.

**Not in this release:**
- other arrangement forms: proportional, weighted, by age, by queue length, or reading a sensed level;
- a second shared resource, partly interchangeable skills, or a shared finite constraint (WQ-01);
- a per-unit capacity, or a P-DEP-01 link, on an arranged part;
- a hand-over between two works of one part (P-HANDOFF-01 runs between parts).

## PROP-SENSE-01: the sending dial (decision Q-004)

James's ruling (2026-10-20): each level gets a mapping dial for what its producing part sends when short, either "keeps sending", or "stops once the part's shortfall exceeds a stated amount", recorded as never sent. With no dial set, refuse that level rather than guess.

- **Schema:** `whenProducerShort` on a level: `{ "kind": "keeps-sending" }` or `{ "kind": "stops-when-short", "above": [{ "resource", "amount" }] }`. Optional, or an explicit gap.
- **Stopping dial:** it states an amount for every resource the producing part requires (validation rejects a missing or extra resource). It stops the level when any of the part's shortfalls in the step before exceeds its amount (strictly), recorded as "never sent" with the mapping as its basis.
- **When it applies:** when the producing part was short in the step before (PROP-STEP-01 timing), or when its units are unknown only because of an earlier shortfall (Q-016). In both cases, "keeps sending" sends the measured value, and a part known to have no units still sends nothing.
- **No dial:** in exactly those cases, the level is refused (unknown prerequisite, Q-004). While the producing part has not been short, no dial is needed.
- **Fixtures:**
  - organisation: the reserve-balance report stops above 2 of money or 5 hours; the caseload report keeps sending;
  - organism: glycogen content keeps sending; the intake reading stops above 10.
- **In force:** listed in the stamp whenever any level sets a dial.

## P-IPF-01 to P-IPF-06 (disabled)

The IPF proposals of the Unified Core Spec catalogue. Their definitions are not in this repository and nothing implements them. The ids are reserved and disabled: a run given any of them stops at initialisation with a ConfigurationError. The draft IPF types (src/draft/) carry no behaviour.

## PROP-STEP-01: step sequence, the timing of sensing, interventions before switches

**Why:** a step loop must evaluate things in some order. CANON's dependencies fix most of it (access is given by a setting from a sensed level, C3.6b; realised flow follows access, C2.5n; shortfall follows what is received, C3.4c). These choices are not fixed by CANON (Q-005):
- **What sensing reads:** the true state as at the start of the step (store content after the step before, loads applied this step; for "received", "entering" and "inflow" measures, the step before, with scenario readings at step 0). This is also what keeps the governor free of look-ahead (alignment item 9).
- **When a producing part's shortfall matters:** sensing work for the reading used in step t belongs to step t-1. If the producing part was short in step t-1, its sending dial (PROP-SENSE-01, decision Q-004) says what it sends; with no dial the reading is refused. This avoids a circularity (the reading sets access, which decides whether the producer goes short in the same step) and matches CANON 4's own step language ("went short in the step before").
- **Interventions before switches:** where an intervention changes the arrangement in a step, threshold switches are not evaluated in that step; they resume from the next step. Without this, an intervention restoring a declared mode after an unmapped transition could be undone in the same step by a switch reading the earlier unknown reading, and the arrangement would stay unknown for good. It also means an intervention and a switch never contend in one step (which would itself be unmapped).

**Sequence:** events (damage, interventions, signal conditions, in the order the scenario lists them); sensing; threshold switches, unless an intervention changed the arrangement (then delivery is recomputed under the new mode's held levels); settings, route capacities and store rules; requirement and upkeep; the recorded order; the draw per resource; accounting, the reconciliation, CANON 1's ledger and flags. A threshold switch needs a reading in the step before and in this step, so none can cross at step 0.

**Also here:** units change only where CANON names a cause (shortfall, damage, rebuilding). Damage is refused (Q-015); shortfall and rebuilding are refused (Q-016) unless the run enables P-LOAD-01 and the part has its dials. So without P-LOAD-01 a part's unit count is carried unchanged only through steps in which it was not short and not damaged.

## PROP-FLOW-01: only stores hold resource from one step to the next

**Why:** what enters the shared flow and is neither received nor stored (the unused amount) has to go somewhere in the next step's accounting. Components are roles (C3.2) and holding resource is the store's role (C2.6), so anything that holds resource across steps is a store and must be mapped as one. The unused amount is therefore reported and not carried. Since 0.2.0 each resource also states whether it can be held across steps at all (alignment item 5), and only a storable resource can have a store. This is close to a derivation but is listed so James can confirm it (Q-019).

## PROP-RANK-01: position within a layer as documented at mapping

**Why:** CANON 4 says rank within a layer "comes from access and, where access is built in, from requirement" (C4.3b), but gives no rule for computing a position from them (Q-006). APPLICATION.md (Applying CANON 4) says "Rank within a layer comes from access as documented at mapping". The engine takes the position declared on the part (or on the mode) and never derives one. Layers themselves are derived from dependencies (C4.3a). A part with no dependency path to the top sits in the bottom layer, the deepest layer reached from the top and at least layer 1 (decision Q-017); the trace flags it (`unreached-part-kept-access`) in a step where it receives its full committed draw with its access not lowered while a part ranked above it is cut (receives less than its committed draw, or has its access lowered). Where a built-in part's requirement changes, the place may move by CANON 3 (C3.7), so the recorded order is refused from that step until the next snapshot; the top is excluded because it never changes within a boundary (C4.4a). The declared order is also what tells a mode change from an arrangement revision (alignment item 7).

**With the top an information gap (2026-10-22):**
- **No layers:** none is derived (`Layers.derived` is false), no part is placed in a layer or called unreached, and validation gives one `rank-underived` flag instead of a `rank-unreached` flag on every part. Nothing stands in for the top, and Q-017 applies only under a known top.
- **The order:** refused because of the top.
- **The Q-006 flag:** a built-in part whose requirement changes is still flagged, noting that it may be the top, whose place never moves.

## PROP-ROUTE-01: route capacity as a rule; no route, no network cap

**Why:** CANON 2 says the routes can hold realised flow below access (C2.5n) but not how a route's capacity is given. A route carries a capacity rule of the same declarative kind as a setting (constant, step or piecewise-linear on a sensed level), governor-set or built-in (C3.6a: access is set by the governor "or built into the part or route"). Routes run from the one shared flow of their resource to parts only (decision Q-010): store releases and outside input enter the shared flow, and a ring-fenced allocation is a built-in access setting on the receiving part, not a route. A part with no declared route has no network cap ("use the fewest components that do the job", APPLICATION 5). Whether a route's capacity rule is a setting, and whether changing it is a mode change, is Q-021. This phase computes one route per part per resource (an engineering limit; a second route is rejected).

## PROP-STORE-01: store release and fill limits as rules

**Why:** CANON says stores "hold resource and release it" (C2.6) and that the governor's regulation works through stores (C3.8n), but not how much is released or what fills a store (Q-003). Each store declares a release rule and a fill-limit rule on sensed levels (governor-set or built-in). Release is bounded by content (physical, not the governor reading the true state); fill by the fill limit and the room left after this step's release; the fill itself comes from the allocation policy.

## PROP-SILENCE-01: a rule states its response to silence read as alarm

**Why:** a missing signal never produces a value (alignment item 2). Each level states how its silence is read: `no-intervention` or `alarm` (the 0.1.0 reading `normal` is now `no-intervention`). A rule that reads a silent level:
- **read as no intervention:** the governor does not act, so the value the rule gave in the step before stands. With no earlier value (step 0) it is refused as an unknown prerequisite. A rule cannot state a value for this case. Formalising "does not act" as "the earlier value stands" is Q-029.
- **read as alarm:** the rule's stated response (`whenSilent.alarm`) applies, or it is refused as an unknown prerequisite.
- **a built-in rule:** refused as an unsupported rule (Q-012).

No delivered value, healthy reading or zero is ever recorded for a silent level, and its true value and every shortfall are still recorded. A threshold switch on a silent level read as no intervention does not cross; read as alarm, the transition is unmapped and refused (Q-013).

## PROP-TOP-01: allocation under an unknown top (0.1.0; decision Q3, 2026-10-22)

**What it is:** an engine proposal for evaluating with partial information. It is not a CANON rule and adds no theory. It states a draw only where the draw does not depend on the unknown, and establishes nothing about which part is the top.

**What each source contributes:**
- **CANON:** the governor protects the top by limiting everyone else's access first (C4.2, CANON 4 line 53). Rank runs from the top down by dependency (C4.3a). The protected flow is the flow to the top (C2.4). So who is cut, where committed draws exceed what entered, depends on the top.
- **Approved decisions:**
  - **Q-002:** where the committed draws fit what entered, each part receives its committed draw, whatever the policy. The core checks this of every policy.
  - **Q3 (22 October 2026):** with the top unknown, a resource's draw in a step is calculated only where its whole result is identical under every admissible top. A top elsewhere in the boundary is admissible. No policy is assumed top-independent. A policy that needs rank keeps refusing. A missing policy keeps its refusal. The order, the protected flow and the other top-dependent records stay refused.
  - **Q1 and Q2:** an institution's whole organisation is its boundary, and its top stays unknown until evidence establishes it. These are the cases this proposal serves.
- **P-ALLOC-01:** the optional allocation policy. Its rule is unchanged. It declares the evaluation, because its `draw` is pure.
- **PROP-TOP-01:** the evaluation itself, below.

**What it does** (`drawUnknownTop` in src/core/draw.ts, called from the core loop only while the top is an information gap):
1. **Prerequisites first:** everything the draw needs is checked first, in the existing order:
   - a resource that cannot be computed;
   - the arrangement;
   - the policy (none: the existing Q-001 refusal);
   - the order, for a policy that reads rank (refused: the order needs the top);
   - access, route capacity, requirement if read, fill room, and what entered.
2. **The declaration:** a policy that does not declare `unknownTop: 'evaluate-admissible-tops'` is not called. Its draw is refused for the top (`unknown-prerequisite $.boundary.top`), as before. Nothing outside a policy can declare it on its behalf, and there is no per-run override.
3. **The candidate tops:** each part claiming the resource (a ranked part with a setting in force for it), in id order, and then a top elsewhere in the boundary. The last is a part that does not claim the resource, or one the mapping does not contain: no claiming part is marked as the top. It is one candidate among the others, never an assumption or a default.
4. **One call per candidate:** the policy is called once for each candidate, with nothing but `isTop` varying, and each result is checked as any draw is (`checkDraw`: access, route capacity, room, what entered, and Q-002).
5. **The outcome:**
   - **Stated:** the draw is stated only where every candidate gives a valid result and all are identical: every receipt, every fill and the unused amount.
   - **Refused for the top:** where the valid results differ, or where the policy refused or broke a limit under some candidates. Any refusals the policy raised are carried with it.
   - **Refused alike:** where the policy refused alike under every candidate, its refusals stand alone, because they do not depend on the top.

**What it records:**
- **`ResourceRecord.unknownTop`:** present only while the top is a gap. It holds the proposal and its version (`UNKNOWN_TOP_VERSION`, 0.1.0), `top: 'unknown'`, the policy, the candidates with whether each gave a valid result, whether the valid results are identical, and whether the committed draws fit (so that Q-002 fixed the receipts whatever the top). It also holds the result and, for a refusal, the reason: `results-differ`, `candidate-refused`, `refused-alike`, `policy-not-declared` or `prerequisite-refused`.
- **`stamp.proposals`:** lists PROP-TOP-01 in every run whose top is an information gap and whose policy declares the evaluation.

**What it does not do:**
- It never chooses, infers or ranks a top.
- The order, the protected flow and its indicators, and the `top-short-another-not` and Q-017 flags stay refused or absent while the top is unknown. So a stated draw is never a protected-top allocation.
- A known top takes the existing path, with one call and no new record or stamp entry. Its traces are unchanged byte for byte, and so is every golden hash.

**Where it makes a difference (P-ALLOC-01):**
- **Committed draws that fit:** stated. Q-002 fixes the receipts, and P-ALLOC-01 fills stores by room without reading the top.
- **One claimant:** stated, since it receives all that entered whether it is the top or not. A part without a grading is refused, because a top elsewhere needs its grading.
- **Two or more claimants whose committed draws exceed what entered:** refused, even where what entered covers every requirement.

**Known limits:**
- **Purity:** the declaration is the policy's own statement of purity, as determinism is today. The core cannot detect an impure policy.
- **The candidate set:** it is always the claimants and a top elsewhere. A mapping cannot narrow it, for example to a few possible tops (not proposed).
- **The draw as a whole:** a draw is stated or refused as a whole. Totals that would be the same under every top (for example what the parts receive between them, where all that entered is taken) are not stated separately.
- **The undeclared case:** a policy without the declaration stays refused, even where Q-002 alone would fix its result.

**Tests:** tests/top-unknown.test.ts, cases T1 to T8 and N1 to N8, with the unknown-top traces pinned by hash. The package's outside consumer (N9) reproduces two cases from the installed tarball.

## APP-04: a scenario is a load applied to a system (APPLICATION 5)

A scenario document that declares components (parts, stores, routes and so on) is rejected with code `scenario-not-system`. It can only supply series, initial content, readings and events.

## APP-08: a top short while another part is not (APPLICATION, Applying CANON 4)

APPLICATION says a mapped top sacrificed before another part counts against the model. CANON does not define "sacrificed" operationally (C4.1b), so the engine only flags a step where the top is short of the protected resource while another part is not, and says whether a support part was short in the step before (the case CANON 4's lag note describes). The flag never changes a result.

## Proposed, not implemented

Validation checks drawn from APPLICATION.md that could be added later, each as a labelled proposal:
- **Resource named, not carrier or route** (APPLICATION 5): a resource id that equals a store's or route's id is suspicious. Weak; not added.
- **Requirement rule fixed in advance** (Applying CANON 3): already structural, since no scenario event can change a requirement rule.
- **Capacity versus shortfall** (Applying CANON 3): "A part limited by its capacity, not its access, has no shortfall". Capacity now has a home at the level of work (P-WORK-01, approved 2026-10-20): it limits work done, never requirement or shortfall, and what a capacity-limited part does not do is reported as work not done. `Part.capacity` and `Part.efficiency` stay unread (decision 7).
- **Lags count only if observed** (Applying CANON 7): the trace tags every value computed or sensed, so a later analysis can separate observed from unobserved shortfall. No check yet.

## Engineering conventions (not model rules)

Listed for completeness; none of these changes what a model means.
- **Refusals, not exceptions:** a calculation the engine cannot make is a typed refusal in the result, with one of seven stable categories (unknown prerequisite, invalid resource topology, unsupported rule, unspecified allocation policy, scarcity precondition not met, invalid settings change, unmapped transition). Exceptions are kept for a model, scenario or configuration that cannot be initialised, and for the engine's own invariant failures.
- **Exact rational arithmetic** on BigInt for every quantity: the identities hold exactly, and no rounding rule (which would allocate leftover units) is ever needed.
- **Scenario series** hold each value from its step until the next entry, and every series starts at step 0. A missing series is an error, never zero.
- **Linear tables** are not extrapolated: a reading outside the declared range is refused.
- **Undeclared means absent, not zero, except by explicit statement:** a setting for a resource the part has no requirement for is rejected; write requirement 0. A part with no upkeep stated has no upkeep/work split in the trace (decision Q-023 applies where upkeep is stated).
- **Mapped outflows** are always empty in this schema, so the reconciliation's outflow total is the sum over none (Q-027).
- **Deterministic order:** every list in a trace is sorted by id (code-unit order); scenario events apply in the order listed.
