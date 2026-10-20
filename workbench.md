# N-ought Analyst Workbench

A browser screen over the engine: the mapped system, an editable scenario, a baseline and an intervention run side by side, and what the engine computed for both. Every number is the engine's own, computed on this machine from the mapped model and the scenario values shown. Nothing on the screen is estimated by AI, and the browser calculates nothing: it sends the scenario to a small local server, which runs `run`, `runWork` and `runBacklog` and returns the exact traces.

## Setting it up

You need Node.js 22.18 or later (tested on 24.20). Nothing else needs installing to run the workbench: the engine has no runtime dependencies.

1. Get the repository, if you have not: `git clone https://github.com/millbo01/nought-engine.git`, then open a terminal in the `nought-engine` folder.
2. Start the workbench:

   ```bash
   npm run workbench
   ```

   It prints `N-ought Analyst Workbench: http://localhost:4173`. To use another port: `node src/adapters/node/workbench.ts --port 5000`.
3. Open http://localhost:4173 in a browser.
4. Stop it with Ctrl+C in the terminal.

The server listens on this machine only (127.0.0.1), and it only reads the repository's fixtures; it never writes a file.

## Using it

- **Example** (top bar): the organisation (four parts, money and staff time, a reserve, work, backlog), the two-step casework office, or the organism. Each is a fixture in the repository; its model, work and backlog mappings are fixed.
- **Mapped system** (left): the parts in the layers the engine derived (the top first), what each requires, the governor's bands, the declared arrangements and switches, levels, stores, and the work and backlog mappings, with their stated assumptions.
- **Scenario** (centre): pick the baseline scenario, and the scenario the intervention starts from. The intervention is a copy you can edit:
  - every series as values per step (inflow, outside input, loads); an entry holds until the next, as in the engine;
  - a blank cell is an explicit gap: the engine refuses what depends on it and says why, never reading it as 0;
  - store contents at the start, the number of steps, P-LOAD-01 (unit loss and rebuilding) on or off;
  - events: move, remove, or add a switch to a declared arrangement at a step.
  Changed cells are highlighted. Press **Run comparison** to run both.
- **Results**: totals for both runs, then tabs:
  - **Allocation**: each resource's shared flow per step, by where it went (each part, stored, rebuilding, unused), against the total requirement;
  - **Shortfall**: by part and step, with the intervention's change from the baseline;
  - **Functional output**: each work's actual and reference output (P-WORK-01), and work not done;
  - **Backlog**: each obligation account's closing balance (P-LOAD-02, tracking only), labelled conditional where its claims are assumed;
  - **Refusals and assumptions**: the proposals in force (none of them CANON), the flags, and every refusal with its reason;
  - **Provenance**: versions, the mapping and scenario digests, the trace hashes, and the snapshots the engine derived.
- Hover any bar, point or cell for the exact value (an exact fraction such as `336/5`) or the reason it was refused.

## What it is not, yet

- It edits scenario values only; the mapped model and attachments are fixed by the example. Editing a mapping would need its attachments reviewed against it (their digests bind them).
- A refused value is shown as refused; the screen never fills it in.
- Backlog feedback into later loads (P-COUPLE-01) is not in it: the backlog is tracked only.
