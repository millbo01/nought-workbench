# Open questions (backlog log)

Questions the engine cannot answer from CANON, logged as they arose. Each calculation that needs an answer is refused inside the result with a typed refusal carrying the question id (src/core/unspecified.ts), or rests on a named proposal (docs/proposals.md). Live questions are asked in the build reports, in full, with their context; this file is the log. Nothing here is decided until James decides it, and an answer goes into CANON or a proposal, never into this file.

Format: the status; the question; the case that raised it; what it blocks; how the engine handled it meanwhile. Statuses (2026-10-20): answered Q-002, Q-004, Q-008, Q-010, Q-016, Q-017, Q-023; kept open Q-005, Q-006, Q-009, Q-011, Q-012, Q-013, Q-018, Q-019, Q-020, Q-021, Q-022, Q-025, Q-026; parked Q-001, Q-003, Q-007, Q-014, Q-015, Q-024; open, not yet ruled on, Q-027 to Q-031; raised by the work extension, open, WQ-01 to WQ-07 (below).

## Raised in Phase 1 (2026-10-20)

### Q-001. The within-step draw
- **Status:** parked for a later phase 2026-10-20: the draw stays a proposal (P-ALLOC-01).
- **Question:** when the access committed to parts in a step (each part's access, capped by its route) exceeds what enters the shared flow, who takes what? A queue by rank, part by part; a cut graded by the settings; or something else? If graded, how is the grading read from the settings?
- **Case:** organisation, inflow-cut scenario, step 2 (93 committed, 75 arrives); organism, step 3 (85 committed, 60 arrives).
- **Blocks:** every such step, unless a policy is passed. The core has none: without a policy every draw is refused (unspecified allocation policy) and everything else is computed.
- **Meanwhile:** `DrawPolicy` interface; fixtures use P-ALLOC-01 (James's working position, formalised).

### Q-002. Drawing beyond requirement
- **Status:** answered 2026-10-20 (docs/decisions.md): a part draws up to its access, even where that exceeds its requirement. The core checks this of every allocation policy.
- **Question:** does a part draw up to its access where that exceeds its requirement, or only up to its requirement?
- **Case:** CANON 1's fourth exception (test C1.4d) can only arise if a part can receive more than it requires.
- **Blocks:** nothing in the core; a policy declares whether it reads requirement.
- **Meanwhile:** P-ALLOC-01 draws up to access.

### Q-003. Store release and filling
- **Status:** parked for a later phase 2026-10-20: no change.
- **Question:** how much does a store release in a step, and what fills it? A rule on a sensed level (governor-set or built in), a response to the gap, or something else? Is filling a draw on the shared flow like a part's, and in what relation to the parts' draws?
- **Case:** the organisation's reserve releases 15 each step and refills from what is left in the same step.
- **Blocks:** store dynamics without PROP-STORE-01 and P-ALLOC-01.

### Q-004. What a short producing part sends
- **Status:** answered 2026-10-20 (docs/decisions.md): each level gets a mapping dial for what its producing part sends when short ("keeps sending", or "stops once the shortfall exceeds a stated amount", recorded as never sent); with no dial, the level is refused. PROP-SENSE-01; set in both fixtures.
- **Question:** when the part that produces a level is short, what does it send: the same reading, a different one, nothing, or something that depends on the signal's route (in the shared flow, or on a route of its own)?
- **Case:** organisation, inflow-cut scenario: finance goes short at step 2 and produces the reserve-balance level.
- **Blocks:** from step 3, the reading, the settings and store rule that read it, and every money result. Staff time is still computed.

### Q-005. When sensing happens within a step
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** confirm or replace PROP-STEP-01: sensing reads the definite state at the start of the step, and the producing part's shortfall that matters is in the step before.
- **Case:** organism, step 3: intake falls, and the store responds only at step 4 because the governor reads the last step's intake. That lag comes from PROP-STEP-01, not from CANON.
- **Blocks:** nothing; every run depends on it and lists it.

### Q-006. Position within a layer; a built-in part's place
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** what rule gives a part's position within its layer from its access and, where access is built in, its requirement (C4.3b)? When a built-in part's requirement changes within a mode, how does its place move (C3.7)?
- **Case:** test Q-006 (a built-in part's requirement rises with its load).
- **Blocks:** the recorded order from that step to the end of the snapshot, and any policy that reads rank then.
- **Meanwhile:** PROP-RANK-01 (position as documented at mapping).

### Q-007. What a dependency does
- **Status:** parked for a later phase 2026-10-20: no change.
- **Question:** "this part's work feeds that part": what does a feeding part's shortfall do to the part it feeds (its delivery, its requirement, its capacity)? CANON 4's lag note implies an effect but states no mechanism.
- **Case:** organisation, step 6: the top is short while scheduling, a support part, was short in the step before.
- **Blocks:** dependency lags; any dependency effect. Dependencies are used only to derive layers.

### Q-008. The top's need and its requirement
- **Status:** answered 2026-10-20 (docs/decisions.md): the top's need is its requirement. The protected-flow record reports `need` and the top's `shortfall`.
- **Question:** CANON 2 measures the protected flow "against the top's need"; CANON 3 speaks of requirement. Are they the same quantity? If not, how is need given?
- **Case:** the protected-flow record in both fixtures.
- **Blocks:** calling the comparison "against need"; the trace reports the top's requirement and shortfall beside what it receives.

### Q-009. Requirement rules that fall while an input rises
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** the engine reads "it falls only when an input the rule reads falls" (C3.12b) as: every requirement rule is non-decreasing in every input. A rule in which a rising input lowers requirement is rejected unless the input is defined the other way round. Is that the intended reading?
- **Case:** validation test with a negative coefficient (a warmer day lowering a heating requirement).
- **Blocks:** models with such rules (rejected).

### Q-010. Routes from a store or outside input to a part
- **Status:** answered 2026-10-20 (docs/decisions.md): store releases and outside input enter the one shared flow; routes run from the shared flow to parts only; a ring-fenced allocation is a built-in access setting on the receiving part. Validation rejects any other route.
- **Question:** how does a route from a store or an outside input to a part relate to the one shared flow of each resource (C3.4b)? Is the store's release still in the shared flow but capped for that part, does the part draw the store directly, or is the route really from the store to the shared flow?
- **Case:** test Q-010.
- **Blocks:** every result for that resource in a model with such a route.

### Q-011. What a gate is
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** CANON 1's third exception is "opening a gate that holds resource back", and CANON 3's note lists gates among the governor's means, but neither defines a gate. Is it any access or route limit that leaves resource undrawn while a part is short, a store's fill, an intake limit, or a component of its own? Should the trace split the residual into held back and unused?
- **Case:** organisation, steps 0 to 3: 2 is left in the flow and the reserve fills while scheduling is short with its route bound.
- **Blocks:** a held-back and unused split. The trace reports one unused amount, flags it, and records which limit bound each part.

### Q-012. How a built-in setting reads a level
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** does a built-in setting read a level through the governor (so bands and silence apply) or directly from its producing part? How does it read a silent one?
- **Case:** test Q-012: a built-in setting reads a level that has no band in the mode.
- **Blocks:** a built-in setting's access whenever the level it reads is silent at the governor.

### Q-013. What a threshold switch reads
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** does a threshold switch read a sensed level or the definite state? How does it read silence read as alarm? What happens when two switches cross in one step towards different modes? (Silence read as no intervention is settled by the alignment: the governor does not act, so there is no crossing.)
- **Case:** test Q-013: the switch's level is filtered on its route.
- **Blocks:** the mode (and so every access) from that step until an intervention sets a mode.

### Q-014. Computing a separate case
- **Status:** parked for a later phase 2026-10-20: no change.
- **Question:** how is a part that sets its own access computed beside the others (C3.5)?
- **Case:** test Q-014.
- **Blocks:** every result for each resource it draws.

### Q-015. Damage
- **Status:** parked for a later phase 2026-10-20: no change.
- **Question:** how does damage enter a part's physical state, how much does it raise the part's requirement, how does repair lower it, and does damage remove units or route capacity?
- **Case:** test Q-015 (a damage event).
- **Blocks:** the damaged part's requirement and units from the damage on.

### Q-016. Unit loss and rebuilding
- **Status:** answered 2026-10-20 (docs/decisions.md): the P-LOAD-01 form is approved (loss from uncovered upkeep; the largest loss across resources; rebuilding after stores fill; shared in proportion; fractional units), off by default and enabled per run by a scenario.
- **Question:** what form do the per-part dials for unit loss under shortfall, unit rebuilding, backlog and damage take (addendum, 2026-10-20; now P-LOAD-01, disabled), and how do they act? (Schema only in this phase.)
- **Case:** every fixture: a part short in a step has unknown units afterwards.
- **Blocks:** unit counts after any shortfall, and anything that reads them (per-unit upkeep, "never sent" for a producing part).

### Q-017. A part with no dependency path to the top
- **Status:** answered 2026-10-20 (docs/decisions.md): a part with no dependency path to the top sits in the bottom layer, flagged where it keeps its access while higher-ranked parts are cut.
- **Question:** what is the layer of a part whose work feeds no chain to the top?
- **Case:** test Q-017.
- **Blocks:** the recorded order (not the draw under P-ALLOC-01).

### Q-018. A band moved within a mode
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** by CANON 3's definition a moved band (a fever, a reset) is not a mode change; APPLICATION makes where to cut snapshots a mapping decision. Should the engine offer the mapper an explicit cut at a band move?
- **Case:** test "a band moved within a mode".
- **Blocks:** nothing; the move is flagged.

### Q-019. Is the unused amount carried?
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** confirm PROP-FLOW-01: what enters and is neither received nor stored is not carried to the next step (holding resource is a store's role).
- **Case:** organism, step 8: 35 left in the flow.
- **Blocks:** nothing; every run depends on it.

### Q-020. "Another's" in CANON 1
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** in "raising one part's access lowers another's", is "another's" another part's access or what it receives?
- **Case:** test C1.2 (the engine checks what is received).
- **Blocks:** nothing.

### Q-021. Kinds of route capacity and store rules
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** are a route's capacity rule and a store's release and fill rules settings in CANON's sense? Is changing one a mode change?
- **Case:** PROP-ROUTE-01, PROP-STORE-01; no scenario event can change them in this phase.
- **Blocks:** interventions on routes and stores.

### Q-022. Silence read as alarm in settings
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** confirm PROP-SILENCE-01: a rule that reads a level states its response to silence read as alarm. (Silence read as no intervention needs no value since the alignment: see Q-029.)
- **Case:** sensing tests.
- **Blocks:** a setting under alarm silence with no stated response (refused as an unknown prerequisite).

### Q-023. Upkeep and requirement
- **Status:** answered 2026-10-20 (docs/decisions.md): upkeep is part of requirement: requirement is upkeep plus work, and what reaches a part covers upkeep first. Part records add the work requirement and the upkeep and work shortfalls.
- **Question:** is upkeep part of a part's requirement (covered first within it), or separate?
- **Case:** the trace reports upkeep covered and the remainder for work without comparing the remainder with a work requirement.
- **Blocks:** a work shortfall separate from the shortfall against requirement.

### Q-024. Intake
- **Status:** parked for a later phase 2026-10-20: no change.
- **Question:** CANON 3's note names intake among the governor's means. The engine takes inflow as a scenario input. Is intake a part whose work brings resource into the flow, a gate, or a setting on inflow?
- **Blocks:** modelling inflow that depends on a part's work.

### Q-025. A built-in setting reading its own part's level
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** is a built-in setting that reads a level produced by the same part (autoregulation) the part setting its own access (a separate case), or built-in access?
- **Blocks:** nothing yet; such models run as built-in.

### Q-026. "A level the governor holds" for indicators
- **Status:** kept open 2026-10-20: the current handling and proposals stay.
- **Question:** is an indicator of kind "held level" one held in the current mode, or in any mode?
- **Blocks:** nothing; validation requires it to be held in at least one mode.

## Raised in the alignment with the Unified Core Spec v0.2 (2026-10-20)

### Q-027. Mapped outflows or losses
- **Status:** open: raised in the alignment, not yet ruled on.
- **Question:** the reconciliation records "mapped outflows or losses", but CANON's components include outside input and no outflow, and "everything else is a mapping aid". Should resource leaving other than to parts or stores (a store's spill, a loss on a route, an export across the boundary) be mapped, and as what?
- **Case:** every reconciliation: the outflow total is always the sum over none.
- **Blocks:** nothing yet; any model with real outflows cannot express them.

### Q-028. Arrangement revisions beside CANON 4
- **Status:** open: raised in the alignment, not yet ruled on.
- **Question:** CANON 4 says "Access settings are fixed within a governor mode and change only when the mode changes", and CANON 3 defines a mode change as a change in the order or in the levels held. The alignment adds the arrangement revision: a change to a fixed setting that leaves the order and the held levels as they were, which starts a new snapshot but is not a mode change. Is an arrangement revision a mode change after all (so CANON 4 holds as worded), something CANON 4 should allow for, or a case that cannot arise (because a change of access always changes the order, C4.3b)?
- **Case:** the organisation baseline, step 7: the move to pressure settings changes only settings, under the declared order (PROP-RANK-01).
- **Blocks:** nothing computational (a new snapshot starts either way); only the label.

### Q-029. "The governor does not act"
- **Status:** open: raised in the alignment, not yet ruled on.
- **Question:** the alignment says that where silence means no intervention, the governor simply does not act. The engine reads that as: each rule that reads the silent level keeps the value it gave in the step before (an access, a store's release or fill limit, a route's capacity), and with no earlier value (step 0) the result is refused. Is that the intended reading?
- **Case:** sensing test "silence read as no intervention".
- **Blocks:** rules reading a silent level at step 0, or after their earlier value was refused.

### Q-030. Matching the engine's proposals to the catalogue
- **Status:** open: raised in the alignment, not yet ruled on.
- **Question:** P-ALLOC-01, P-LOAD-01 and P-IPF-01 to P-IPF-06 now carry the catalogue's ids. Does the Unified Core Spec catalogue have equivalents for PROP-STEP-01, PROP-FLOW-01, PROP-RANK-01, PROP-ROUTE-01, PROP-STORE-01 and PROP-SILENCE-01, and what do P-IPF-01 to P-IPF-06 say? The catalogue is not in this repository.
- **Blocks:** nothing; ids only.

### Q-031. P-ALLOC-01 and look-ahead
- **Status:** open: raised in the alignment, not yet ruled on.
- **Question:** P-ALLOC-01 divides what actually arrives in a step. The engine treats that as the arithmetic of the shared flow (an arrangement declared in advance), not the governor responding to this step's arrival, so it is not look-ahead under alignment item 9. Is that the intended reading of "the grading comes from the settings"? If the graded cut is the governor's response, it needs a form that reads only levels.
- **Case:** organism, step 3: intake falls in the step, and the cut is graded by what arrives.
- **Blocks:** nothing yet; every fixture uses P-ALLOC-01.

## Raised by the work extension (2026-10-20)

Questions about the optional proposals P-WORK-01 and P-DEP-01 (docs/proposals.md), not about CANON, so none is behind a core refusal and their ids are WQ-, apart from the Q- list. Each is set out in full, with options and a recommendation, in the handover (section 6, "Questions awaiting James's decision").

### WQ-01. Dividing finite support shared by several parts
- **Status:** open: raised by the work extension (contract D-4), not yet ruled on.
- **Question:** when one part's work is finite support shared by several parts, should P-DEP-01 divide that output between them, and by what rule?
- **Case:** organisation-shared-support: IT tickets used by finance and scheduling.
- **Blocks:** any mapping of finite, shared support.
- **Meanwhile:** a link declared `exhaustible-support` is accepted, and its recipients' outputs are refused (unsupported rule).

### WQ-02. Lagged functional links
- **Status:** open: raised by the work extension (contract D-3), not yet ruled on.
- **Question:** should a link act with a delay, so that a supporting part's output caps the dependent part in a later step, and what caps it before the first lagged output exists?
- **Case:** maintenance done in one week enabling the next week's work.
- **Blocks:** support whose effect arrives in a later step.
- **Meanwhile:** a lag above 0 is accepted and refused (unsupported rule).

### WQ-03. Whether work changes later steps
- **Status:** open: raised by the work extension (contract section 10), not yet ruled on.
- **Question:** should work done or not done change anything in a later step (a backlog carried into a load, a part's physical state, recovery), and through which named rule?
- **Case:** IT support's tickets not resolved in a week of the income cut.
- **Blocks:** backlog and deterioration scenarios; any answer ends the separation of work from the base run for the runs that enable it.
- **Meanwhile:** work not done is counted each step and nothing carries. Since 2026-10-20 P-LOAD-02 tracks eligible obligations from step to step in a ledger of its own, with no feedback (tracking only). P-COUPLE-01 (the v0.3 design resolutions, approved, implementation authorised 2026-10-20) feeds an account's eligible obligations back into one load of its own part, in `runCoupled` only. Any other feedback (a part's physical state, deterioration, recovery) stays open.

### WQ-04. Work as a level the governor senses
- **Status:** open: raised by the work extension (contract section 10), not yet ruled on.
- **Question:** under what evidence standard, if any, may a work quantity become a level the governor senses and holds in a band?
- **Case:** a governor that responds to payments completed.
- **Blocks:** a governor that responds to output.
- **Meanwhile:** a level cannot measure work (validation).

### WQ-05. Evidence standards for mapping in paid diagnostics
- **Status:** open: raised by the work extension (contract section 10), not yet ruled on.
- **Question:** which mapped values need documentary evidence before a result is shown to a client, and how should each value's evidence be recorded?
- **Case:** the work fixtures' recipes, yields, capacities and ratios, all hypothetical.
- **Blocks:** nothing computational; what may be reported.
- **Meanwhile:** rationale text only.

### WQ-06. Wider reference-output rules
- **Status:** open: raised by decision 6 (2026-10-20), not yet ruled on.
- **Question:** should a reference output be allowed to read another part's loads, or to fall as a load rises?
- **Case:** finance's payments following the service's caseload.
- **Blocks:** reference outputs driven by another part's workload.
- **Meanwhile:** constant, linear or table rules on the part's own loads, non-negative and non-decreasing.

### WQ-07. Deprecating Part.capacity and Part.efficiency
- **Status:** open: raised by decision 7 (2026-10-20), not yet ruled on.
- **Question:** should the DRAFT fields `Part.capacity` and `Part.efficiency`, superseded by the work attachment, be removed from the model schema, and when?
- **Case:** no fixture uses them.
- **Blocks:** nothing.
- **Meanwhile:** kept in schema 0.4.0, never read, marked superseded.
