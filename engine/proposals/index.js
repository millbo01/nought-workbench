// Configurable assumptions and proposals. Nothing here is CANON, and nothing
// here is a default: the core never imports this layer. Each proposal is
// described, with its reason, in docs/proposals.md.
//
// Ids: P-ALLOC-01, P-LOAD-01 and P-IPF-01 to P-IPF-06 are the Unified Core Spec
// v0.2 catalogue's; P-WORK-01 and P-DEP-01 are the Functional Work and
// Dependencies Contract's; P-LOAD-02 is the tracking-only backlog handoff's;
// P-COUPLE-01 is the coupled-feedback v0.3 design resolutions'.
// PROP- ids are the engine's own, pending a match to that catalogue (Q-030).
export { checkGradedAllocationData, gradedAllocation, P_ALLOC_01 } from "./allocation-graded.js";
export { BACKLOG_ATTACHMENT_VERSION, BACKLOG_PROPOSAL, checkBacklogAttachment, claimsOf, parseBacklogAttachment, validateBacklogAttachment } from "./backlog/attachment.js";
export { backlogFromTraces, runBacklog } from "./backlog/ledger.js";
export { BACKLOG_VERSION, backlogTraceHash } from "./backlog/trace.js";
export { checkCouplingAttachment, conditionsOf, COUPLING_ATTACHMENT_VERSION, COUPLING_PROPOSAL, couplingImpact, parseCouplingAttachment, staticGuard, validateCouplingAttachment } from "./couple/attachment.js";
export { couplingReplayScenario, runCoupled } from "./couple/run-coupled.js";
export { COUPLE_VERSION, couplingTraceHash } from "./couple/trace.js";
export { checkWorkAttachment, parseWorkAttachment, validateWorkAttachment, WORK_ATTACHMENT_VERSION, WORK_PROPOSALS } from "./work/attachment.js";
export { runWork, workFromTrace } from "./work/run-work.js";
export { WORK_VERSION, workTraceHash } from "./work/trace.js";
const IPF = [1, 2, 3, 4, 5, 6].map((n) => ({
    id: `P-IPF-0${n}`,
    title: 'IPF proposal (defined in the Unified Core Spec v0.2 catalogue, not in this repository)',
    where: 'policy',
    enabled: false,
    inForce: 'never: disabled',
}));
/** The register of proposals; docs/proposals.md gives each reason in full. */
export const PROPOSALS = [
    { id: 'P-ALLOC-01', title: 'Graded overcommitment rule (James\'s working position, 2026-10-20)', where: 'policy', enabled: true, inForce: 'only when passed as the allocation policy; used by the fixtures' },
    { id: 'P-WORK-01', title: 'Useful work from a part\'s own resources: reference output, recipe, capacity and yield (approved as an optional proposal 2026-10-20)', where: 'work extension', enabled: true, inForce: 'only in runWork, for a work attachment that enables it; never through a scenario, and never in run()' },
    { id: 'P-DEP-01', title: 'A functional cap on an existing dependency: same-step, acyclic, non-exclusive enablement only (approved as an optional proposal 2026-10-20)', where: 'work extension', enabled: true, inForce: 'only in runWork, for a work attachment that enables it and maps links' },
    { id: 'P-LOAD-02', title: 'Carryable obligations, tracking only: a ledger of eligible obligations over a finished run and its work (approved 2026-10-20)', where: 'tracking extension', enabled: true, inForce: 'only in runBacklog or backlogFromTraces, for a backlog attachment that enables it; never in run() or runWork(), never through a scenario, and never fed back into a run' },
    { id: 'P-COUPLE-01', title: 'Coupled backlog feedback: the eligible obligations of an account generate one load on its own part, step by step (v0.3 design resolutions approved; implementation authorised 2026-10-20)', where: 'coupling extension', enabled: true, inForce: 'only in runCoupled, for a coupling attachment that enables it; never in run(), runWork() or runBacklog(), and never through a scenario' },
    { id: 'P-LOAD-01', title: 'Per-part unit loss and rebuild (form approved 2026-10-20); backlog and damage dials undefined', where: 'policy', enabled: true, inForce: 'off by default: only in a run whose scenario enables it ("enable": ["P-LOAD-01"]), for parts with both dials' },
    ...IPF,
    { id: 'PROP-FLOW-01', title: 'Only stores hold resource from one step to the next', where: 'core loop', enabled: true, inForce: 'every run' },
    { id: 'PROP-RANK-01', title: 'Position within a layer as documented at mapping; parts with no path to the top in the bottom layer (decision Q-017)', where: 'core loop', enabled: true, inForce: 'every run' },
    { id: 'PROP-SENSE-01', title: 'A sending dial per level says what its producing part sends when short (decision Q-004)', where: 'schema', enabled: true, inForce: 'runs whose model sets a dial on any level' },
    { id: 'PROP-ROUTE-01', title: 'Route capacity as a rule on sensed levels; routes from the shared flow only (decision Q-010); no route, no network cap', where: 'core loop', enabled: true, inForce: 'every run' },
    { id: 'PROP-SILENCE-01', title: 'A rule states its response to silence read as alarm', where: 'schema', enabled: true, inForce: 'runs where a rule reads a level' },
    { id: 'PROP-STEP-01', title: 'Step sequence and the timing of sensing', where: 'core loop', enabled: true, inForce: 'every run' },
    { id: 'PROP-STORE-01', title: 'Store release and fill limits as rules on sensed levels', where: 'schema', enabled: true, inForce: 'runs whose model has a store' },
    { id: 'APP-04', title: 'A scenario is a load applied to a system, not a system (APPLICATION 5)', where: 'check', enabled: true, inForce: 'scenario validation' },
    { id: 'APP-08', title: 'A top short while another part is not is flagged (APPLICATION, Applying CANON 4)', where: 'check', enabled: true, inForce: 'every run (flag only)' },
];
