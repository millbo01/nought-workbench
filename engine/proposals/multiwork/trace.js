// P-MULTIWORK-01 records. In a work run that uses an arrangement, each step of
// the work trace carries one allocation record per arranged part: the balance
// the works share (recorded once, on the part), what the arrangement made
// available to each work, what each used and produced, and what stayed unused,
// beside the quantities that hold under any arrangement. The outstanding-work
// trace gives, for each arranged part, a lower bound on the resource needed
// for the obligations owed to its works: established from known openings,
// admissions and balances, never from the arrangement. Quantities of
// different works are never added in their own units: only in the shared
// resource's unit, through each work's recipe and yield.
export const MULTIWORK_VERSION = '0.1.0';
