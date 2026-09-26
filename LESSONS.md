# Lessons

Evidence-backed rules learned from real work. Read the relevant section before
non-trivial work; append a new rule only when a check, a user correction, or a
reproduced bug proves it. Every entry names its evidence.

Some entries mention tooling that was later retired (the former `gear_*` MCP brain).
They are kept as history: the reasoning and the failure modes still apply, the tool
names do not.

## decision

### Index-to-2D mapping: row = floor(index / COLS), not / ROWS

Mapping a linear tile index into a COLS x ROWS atlas must divide by COLS (row = floor(i / COLS), col = i % COLS) in EVERY consumer (draw, UV, CSS icon position). Using ROWS as the divisor silently puts tiles 4+ off-canvas in a 4x3 atlas. Add a bounds assertion (tc<COLS, tr<ROWS) per consumer to catch it.
*tags: atlas, uv, indexing, off-by-one | evidence: vuiton: 3 sites used (tile / ATLAS_ROWS); T16 quickly flagged tile 11 -> row 3 out of bounds; UV/icon/draw all fixed to / ATLAS_COLS. | recorded 2026-09-25 | confidence high*

### Diorama layout 64x48 with the castle at the back and the interactive garden in front

Proposed main grid: row z0-20 split 9 + 46 + 9 studs; z21-25 split 8 + 48 + 8 studs for the pond; z26-47 split 27 + 10 + 27 studs for the garden, the movement axis, and the props store. The castle sits at the back so the camera keeps a clear view, while interaction stays concentrated in the front half.
*tags: vuiton, lego, diorama, layout | evidence: Every row totals 64 studs across; total depth 22 + 6 + 22 = 48 studs; the zones do not overlap. | recorded 2026-09-25 | confidence high*

### bot-logic is pure logic and navigation is pure data â€” no mixed responsibilities

bot-logic.mjs neither imports the grid nor knows about Three.js; it only consumes plan.waypoints and interpolates by arc length. navigation.mjs builds the clearance grid from the pieces and is the only place that decides which cells are walkable. This boundary lets the clearance tests run without a renderer and makes the bug 'the plan was fine yet the bot still clipped through a wall' impossible whenever the plan comes from findPath.
*tags: architecture, navigation, separation, testing | evidence: tests/navigation.test.mjs (9 tests) and tests/bot-logic.test.mjs (12 tests) pass without a DOM; tools/bot-walk.mjs simulates 1720 frames with 0 violations. | recorded 2026-09-25 | confidence high*

## lesson

### Verify MCP server changes with a spawn-based JSON-RPC harness

When changing gear-mcp.mjs, do not rely on in-session behavior. Write gear/test-brain.mjs: spawn the real server with isolated GEAR_MEMORY/GEAR_ROOT temp dirs and drive it over newline-delimited JSON-RPC (stdio pipes). This caught 3 real bugs: (1) child.stderr is null when stdio stderr is 'inherit'; (2) legacy gear_learn sends field 'lesson' but new store reads 'body' â€” map it; (3) TTL expiry condition must treat ttlDays===0 as expire-now (ttl>0 && age>=ttl misses it).
*tags: gear, testing, mcp, brain, memory | evidence: test-brain.mjs 11/11 PASS on first green run; 3 failures fixed before green: stderr null, lesson/body mapping, ttl=0 condition. | recorded 2026-09-25 | confidence high*

### PowerShell mangles quotes for node -e; run JS from a temp file instead

On Windows PowerShell, `node -e "JSON.parse('{\"a\":1}')"` corrupts inline JS: double quotes get stripped by native-arg parsing and backslash-doublequote pairs become literal), causing bogus SyntaxErrors (Invalid string escape, or JSON parse of `{a:1}`). Workaround: Set-Content the one-liner to a temp .js file and run `node file.js` â€” same semantics, exit code 0. Do not conclude node is broken from a node -e failure on PowerShell.
*tags: powershell, node, quoting, verification | evidence: node -e attempt 1: 'Invalid string escape' exit 1; attempt 2 (here-string): JSON.parse saw `{a:1}`, exit 1; same code via Set-Content + `node file.js`: printed 'json ok', exit 0. Node v24.19.0. | recorded 2026-09-25 | confidence high*

### Direct shell may be permission-denied while a verifier subagent can run the same command

In this environment, a direct shell call returned 'permission.rejected', but the same PowerShell commands (node --check, node test harness) ran successfully when delegated to the verifier subagent. Route shell/fetch-dependent verification through subagents instead of retrying the denied channel.
*tags: shell, permission, subagent, verification | evidence: vuiton session: direct shell denied once; verifier subagent ran node --check (exit 0) and 4 harness runs (final exit 0, harness deleted). | recorded 2026-09-25 | confidence high*

### Headless-verify browser games in Node: vm + DOM stubs + real three.min.js

When no browser is available, a JS game can still be runtime-verified: extract inline <script>, stub document/window/localStorage (fake canvas getContext('2d'), getElementById, addEventListener), require the real three.js UMD, and run prefix + assertions via vm.runInThisContext. Expose module-scoped helpers (assert) on globalThis first â€” module scope is invisible inside runInThisContext. This caught 4 real engine bugs that syntax checks cannot.
*tags: verification, node, threejs, voxel, headless | evidence: vuiton run: 33/33 assertions PASS with 'THREE impl used: real three.min.js'; T14/T16/T4d/T12b failed before fixes (face winding, atlas index math, sea-level, edit diff). | recorded 2026-09-25 | confidence high*

### Capture native PowerShell streams

For exact PowerShell stdout/stderr evidence from a native command, redirect with `1> $out 2> $err`; merely appending an exit-code report is insufficient to distinguish streams, and omitting redirection makes the process write directly to the shell.
*tags: powershell, verification, streams | evidence: Corrected wrapper captured parse stdout exactly and empty stderr with PROCESS_EXIT_CODE=0; an earlier wrapper omitted redirection and printed directly. | recorded 2026-09-25 | confidence high*

### Expose vm assertion counter

The current _logic_test.js declares `let nAssert` in the CommonJS module, but the assembled game/assertion script is executed with vm.runInThisContext; the first A() call therefore fails with `nAssert is not defined` before any assertion increments. A vm-run harness must expose its assertion counter on globalThis (or otherwise inject it into the vm context).
*tags: verification, node, vm, harness | evidence: PowerShell run of `node _logic_test.js` in C:\Users\ADMIN\Desktop\vuiton: exit 1, stdout empty, stderr `HARNESS FAIL: nAssert is not defined`; no ALL PASS or HARNESS OK. | recorded 2026-09-25 | confidence high*

### Report unreachable harness sections as gaps

When a logic harness fails before completion output, do not infer the total assertion count or claim later regression tests passed; report the failure count and list unexecuted sections as coverage gaps.
*tags: verification, coverage, harness | evidence: No `ALL PASS` or `stats:` line was emitted; failure occurred at the tree-column assertion after n=10806. | recorded 2026-09-25 | confidence high*

### Harness markers are required before cleanup

Both a zero harness exit and the exact `ALL PASS (` and `HARNESS OK (static checks passed: 5)` markers are required before deleting `_logic_test.js`; a passing parse check alone is insufficient.
*tags: verification, harness, cleanup, minecraft | evidence: Exact harness run exited 1 and emitted `HARNESS FAIL: ASSERT FAIL: found/covered tree columns | n=10806`; `Test-Path` remained True. | recorded 2026-09-25 | confidence high*

### Do not clean up after partial harness failure

For this harness, cleanup must require both a zero process exit and the exact ALL PASS/static-OK markers. A runtime assertion failure before final logging means later coverage is unverified and the harness must remain.
*tags: verification, harness, cleanup, minecraft | evidence: Fresh run exited 1 at `ASSERT FAIL: jump gives upward velocity | n=10950`; no success markers; final Test-Path was True. | recorded 2026-09-25 | confidence high*

### Discrete axis collision tunnels on large single-frame deltas â€” test with small dt

moveAxis-style collision checks only the final box, so a test calling updatePlayer(0.5) with vel.y=-16 (delta â‰ˆ -14.5 blocks) tunnels through terrain and 'lands' inside stone. Real gameplay never tunnels (max fall speed -40 Ã— 1/60 â‰ˆ 0.67 < 1 block/frame). Physics tests must step with dt=1/60 over many frames (e.g., 60 frames) and assert resting exactly at surface+0.001. Diagnose with console dumps rather than guessing.
*tags: physics, collision, tunneling, testing, voxel | evidence: JUMPDIAG showed pos=4.50,12.00 with gh=25 (player inside stone at y=12) before jump; velY went 0â†’0 with posY 12.00â†’10.199 = snap under ceiling. After 60-frame landing loop, jump asserted vel>0 OK. | recorded 2026-09-25 | confidence high*

### getGeneratedValue must replicate generateChunk exactly (incl. neighbor-tree canopy)

In a chunked voxel game with an edits-map (localStorage persistence), the 'original generated value' formula must reproduce generateChunk 100%: trunk priority over leaves, canopy from ALL trees within radius 2 (not just the cell's own column), and chunk-border leaf clipping (leaf only exists inside the tree's own chunk). Otherwise setBlock's stale-edit removal breaks: breaking an overhanging leaf compares id==0 vs formula air==0 â†’ edit not recorded â†’ block reappears on reload. Fixed in index.html; verified with full-equality assertions (40k+ green).
*tags: voxel, minecraft, persistence, edits-map, chunk | evidence: Harness T7 full-equality gen-vs-formula previously failed at n=10810 (leaf overhang), passed after rewrite; final ALL PASS 40532 assertions. | recorded 2026-09-25 | confidence high*

### Headroom must be measured from the highest floor inside the passage, not from the centre floor

When opening a passage through a wall, the hole height must clear the highest floor on both sides plus botHeight plus headroom. Here the west garden floor sits at y=3, so at least 10.6 stud was required; opening 3 courses (y1..10) was still blocked by the grid, and 4 courses (y1..13) were needed to connect. Estimating by intuition easily creates a passage that looks passable but that the grid still refuses.
*tags: geometry, clearance, lego, measurement | evidence: NAV_RULES botHeight 7.4 + headroom 0.2; west garden floor y=3 means the top must be >= 10.6, and wall course 2 has top=10 so it is blocked; gaps only connect to the greenhouse for course<4. | recorded 2026-09-25 | confidence medium*

### Measure first, fix after: component analysis exposes the real physical blocker

When the walkable grid is fragmented, do not guess where the obstacle is â€” label each connected component and then find the closest cell pair between two components. In this diorama that immediately exposed a 4.8 stud bench backrest lying across the 5 stud gate opening, and the decisive evidence was that filtering out exactly that piece merged the two components. Note: the filter must also match the bench backrest, which has a different z than the seat, or the conclusion is wrong.
*tags: navigation, pathfinding, measurement, debugging, lego | evidence: walkable 5979 cells across 15 components; removing the 6 pieces of addBench(0,7) merged components 2374 + 588 into 3016 and fountain->gate works with len=11.9. After the fix: 4/4 legs OK, 6013 cells. | recorded 2026-09-25 | confidence high*

### Compare no-corner-cutting against the real waypoints, not the station coordinates

An A* path on a tile grid can legitimately be shorter than the straight-line distance between two declared coordinates, because the line of sight starts from the snapped tile centre rather than the station coordinate. An offset of only 0.29 stud was enough to make a plan of length 11.88 shorter than a straight line of 12.03 and fail a test falsely. The correct invariant is: length(plan) >= the straight-line distance between the plan's own first and last waypoints. This still catches genuine corner cutting.
*tags: testing, navigation, invariant, pathfinding | evidence: First waypoint (4.25,1.25) and last (0.25,12.25) give a straight line of 11.704 < len 11.88. After fixing the invariant: 31/31 tests pass. | recorded 2026-09-25 | confidence medium*

### The clearance grid uses an unrotated AABB plus the bot radius: low obstacles near a station easily break the path

buildWalkableGrid resolves a rotated piece box (rotation != 0) with an unrotated w x d AABB, and takes the tallest standing surface within the bot radius around the sample point. Two real consequences were hit: (1) a 1.87 stud long tile placed at radius 2.8 with rotation pi/2 still stretched its AABB to x=3.735 and blocked a valid stand cell; (2) a 1 stud high fountain rim only 0.46 stud from the station cell was treated as floor, pushing the surface from 2.25 up to 4.5 and making 2/4 legs FAIL. Lesson: when adding a low obstacle near a station, measure clearance >= the bot body radius computed on the unrotated AABB, then run nav-report before calling it done.
*tags: navigation, clearance, aabb, measurement | evidence: explain(3.6,1) returned floors containing lego-1383 'Fountain rim' y=3.5..4.5 x=1.86..3.14; fountain->gate and greenhouse->fountain FAILED:unreachable. After moving the station back 3.6 -> 4.4: surface returns to 2.25 and 4/4 legs are OK. | recorded 2026-09-25 | confidence high*

### Animation cycles must take their phase from distance travelled, not from the clock

The old animation cycle ran on `now * 0.018` â€” the cadence followed wall-clock time instead of real speed, so fast-walking feet slid and long frame gaps broke the rhythm. Fix: integrate the phase from real distance travelled, `botWalkPhase += distanceTravelled / 1.35`, so one cycle equals one stride. A bounce built on |sin| gives two beats per step, and a separate armBeat was added for idle, because while standing the phase froze and the arms hung motionless. General lesson: every repeating cycle attached to motion must derive its phase from distance, never from time.
*tags: animation, timing, threejs | evidence: app.mjs updateResidentBot before: const cycle = now * 0.018. After: phase integrated from hypot(position - lastFootfall)/1.35, idle uses Math.sin(now*0.0022). npm check exit 0, bot-walk 1719 frames with 0 violations. | recorded 2026-09-25 | confidence high*

### Multi-joint rigs need one coordinate convention and one part-gathering mechanism

createBotPartMesh placed mesh.box at localY*u + height/2 (treating localY as the bottom) but mesh.sphere at localY*u (treating localY as the centre), while the limb branch placed at (localY - pivotY)*u (centre). Three conventions at once, each off by half a height. Fix: every part is centre-based. Added a `group` key so several parts can share one joint â€” before, each part with a `limb` created its own Group, so the hand (which has no limb) hung in mid-air: the arm swung while the hand stayed still. Now jointKey = limb ?? group, the first part declares the pivot, and later parts are placed relative to that pivot. Lesson: a multi-joint rig needs a single coordinate convention and a single part-gathering mechanism instead of letting each geometry type position itself.
*tags: threejs, rig, convention, animation | evidence: app.mjs createBotPartMesh lines 528-540: the sphere branch used localY*u, the box branch used localY*u + height/2. After unifying on centre, the hand attaches to limb 'arm-left' together with the arm, and the new test 'wires every Pip part into a joint' (32/32 pass) prevents a detached hand. | recorded 2026-09-25 | confidence high*

### Missing-tool reports after editing an MCP server are usually a stale process, not config

A long-running MCP server process executes the code it loaded at startup, and the client tool catalog is a snapshot taken at connect time. Editing an MCP server file mid-session does NOT add its new tools to the running session, and killing the server process does not force a respawn. Verified case: gear-mcp.mjs was edited to v1.2.0 with 27 tools including gear_evolution_readiness at 22:32 local, but the server process started at 21:04, so the session still saw v1.1.0 with 15 tools, confirmed because gear_status reported version 1.1.0 while a fresh spawn of the same file reported 1.2.0 with 27 tools. Method: when any agent reports that a tool does not exist, do not patch the agent definition or the permission list. First spawn the server directly over newline-delimited JSON-RPC and call tools/list, then compare the process start time with the server file mtime. Only a server-side omission justifies a config change.
*tags: mcp, gear, tooling, stale-process, diagnosis | evidence: tools/list from a fresh spawn returned 27 tools with MISSING (none). Live gear_status in the same session returned version 1.1.0 and 15 tools. gear-mcp.mjs mtime 22:32:02, node PID 3032 created 21:04:23, file on disk declares version 1.2.0. After killing both gear server processes no respawn occurred and gear tools stayed unavailable for the session. | recorded 2026-09-25 | confidence high*

### Preview gear gate verdicts on a copied store, never the live one

Running gear_evolution_readiness against a COPY of the real store, with GEAR_MEMORY pointing at the copy, yields a real verdict with zero risk to the live brain file. This previews a gate verdict when the gate tool is missing from the current session, and tests a store upgrade before it touches real data. Note that v1.2.0 reads memories.json plus journal.json plus brain.json from the store directory and keeps a legacy single memory.json alongside them, so a preview against a copy must copy the whole store directory, not one file.
*tags: gear, verification, probe, memory | evidence: Copy probe returned verdict insufficient with a single blocker, language drift 7. The real store returned verdict sufficient with language drift 0 and nonEnglish 0, because a separate English repair had already rewritten the v1.2.0 store while the legacy memory.json still held Vietnamese titles. | recorded 2026-09-25 | confidence high*

### node --test only expands a glob on newer Node: list the test files explicitly

On Windows the shell does not expand globs for native commands, so a glob in an npm script is expanded by Node itself, and only on versions whose test runner supports glob patterns. The Node v20.20.2 test-runner docs describe only explicit file paths and directories, not glob patterns, so a package.json claiming engines node >= 20 while its test script uses tests/*.test.mjs declares a floor it may not meet. Verified on Node 24.19.0: a literal, unexpandable pattern still ran 32 tests, proving Node does the expansion. The directory form is NOT a safe substitute: node --test tests failed with exit 1. Listing the test files explicitly works, is documented for v20, and keeps the declared engines floor honest. Cost: a new test file must be added to the script.
*tags: node, testing, windows, npm, glob, vuiton | evidence: node --test "tests/*.test.mjs" passed 32 exit 0 on Node 24.19.0 with the pattern unexpanded by any shell. node --test tests failed exit 1 with "test at tests:1:1". node --test with the three files named explicitly passed exit 0. Node v20.20.2 docs list explicit paths and directory recursion only. | recorded 2026-09-25 | confidence high*

### After a gear store split, a stale v1.1.0 channel writes to a file the gate never reads

gear-toolkit v1.2.0 reads three files from the store directory, memories.json, journal.json and brain.json, while the legacy single memory.json remains on disk beside them. A client still talking to a v1.1.0 server keeps writing the legacy file, so lessons and journal entries appear to save successfully yet are invisible to gear_evolution_readiness and to every v1.2.0 tool. Symptom to recognise: two different tools report different totals for the same store at the same moment, and recall returns entries the gate does not list. Response: compare the store counters from both channels, grep the legacy file for the entry you just wrote, and port anything that landed only there.
*tags: gear, memory, migration, diagnosis, mcp | evidence: Live v1.1.0 gear_status reported total 26 with journal 12, while a fresh v1.2.0 spawn reported total 24 with journal 11. Two lessons written through the v1.1.0 channel were found by grep only in memory.json and not in memories.json. After porting them the v1.2.0 store reported total 26, lesson 19, journal 12, nonEnglish 0. | recorded 2026-09-25 | confidence high*

### A clearance constant for a figure must be measured from that figure, never hand-written

When a physics rule describes a body that the code also defines, the constant belongs next to the body and must be derived from it. Here the Pip rig is data (26 centre-based parts), and the navigation grid reserved a band using a literal `botHeight: 7.4`. The chibi redesign raised the figure to 7.59 stud from foot bottom to beacon top, the literal was never revisited, and every one of the four legs was validated against a body 0.19 stud too short. No existing check caught it, because the walk simulator samples the floor under the figure and never the ceiling above it. Fix: compute the height from the part list, export it, and let the rule consume it, so a later rig edit cannot reopen the gap. General rule: a duplicated constant is a latent bug, and a test that samples only one side of a body cannot validate the other side.

*tags: vuiton, navigation, clearance, rig, constants, measurement, testing | evidence: tools/measure-bot.mjs reported MEASURED HEIGHT 7.590 (top 7.59 pip-beacon, bottom 0.0 pip-right-foot) against NAV_RULES.botHeight 7.4, SHORTFALL 0.19. tests/rig-clearance.test.mjs failed before the change (7.4 is shorter than the rig 7.59) and passed after. tools/clearance-probe.mjs isolates the consequence: a beam with its underside at 9.9 over a floor at 2.25 is walkable under the old 7.4 rule (band 9.85) and correctly blocked under the derived 7.59 rule (band 10.04). After the fix walkable dropped 6267 -> 6227 cells with all four legs and their waypoints unchanged. | recorded 2026-09-26 | confidence high*

### A test cannot cover a dimension no assertion samples

tools/bot-walk.mjs reported "0 violations" while Pip's beacon could pass under a lintel 0.19 stud too low, because the walk simulation checks the ground surface under the figure and the presence of blocked cells, never the vertical clearance band. A green harness is only evidence for the dimensions it measures. When a rule grows a new dimension, the check that guards the old dimensions stays green and gives false confidence, so name the missing dimension explicitly and add a check for it.

*tags: verification, testing, coverage, clearance, vuiton | evidence: bot-walk exit 0 with frames=1719 violations=0 maxHeightError=0.9134 on the same commit where NAV_RULES.botHeight under-covered the rig by 0.19 stud; the gap only surfaced from tools/measure-bot.mjs comparing the rig data against the rule. | recorded 2026-09-26 | confidence high*

### On Windows the built-in rg may be a broken WinGet stub: fall back to the grep tool

`rg` resolved to a WinGet link and failed with "Program 'rg.exe' failed to run: No application is associated with this file", exit 1, while the same search succeeded through the built-in grep tool. Verify a platform tool actually runs before planning around it; a stub that resolves on PATH is not the same as a working binary.

*tags: windows, ripgrep, tooling, verification | evidence: `rg -n "^export" src/model.mjs` exited 1 with ResourceUnavailable; the same pattern via the grep tool returned 27 matches across the three source modules. | recorded 2026-09-26 | confidence medium*

### A falsifying check must tempt the behaviour, not instruct it

A probe that tells the model what to do measures the probe. The first check of the "max cannot hand work back" mechanism ended with the prompt "Ask me which one you want before you continue": the model asked, wrote two options, and touched nothing â€” 6s, fixture unmodified, and the reply read "I'll ask before touching code, as you requested". The mechanism had worked (metrics.jsonl recorded `question_tool_removed` for the run), so the probe was the thing that was broken. The corrected probe kept the ambiguity and removed the instruction: the model chose a behaviour, justified it against the suite's own assertion, implemented it, and finished 3/3 in 73s. General rule: to test that an agent does not stop, create a situation where stopping is the easy path and nothing asks it to stop; a prompt that requests the behaviour under test cannot distinguish obedience from capability.

*tags: verification, probe-design, prompting, agents, false-negative | evidence: probe 1 (instructed to ask) 6s, lib.js unmodified, reply asked for a choice; probe 2 (ambiguity only) 73s, lib.js changed, node --test 3 pass / 0 fail, no question in reply. | recorded 2026-09-26 | confidence high*

### OpenCode's log stores spawned process args, so a log grep can match its own query

`opencode.log` records every spawned process with its full argument list, so any pattern searched for also matches the shell command that performed the search. Grepping the log for `429|rate.?limit` returned 148 hits and looked like proof that the provider was rate-limiting the agent; 6841 of the log's 11941 lines are `spawning process` records and the real count of status 429 was 1. Exclude `spawning process` lines before counting anything in this log, and prefer a source that cannot contain the query (the log for a metric, not a metric for the log).

*tags: opencode, logging, grep, false-positive, verification | evidence: unfiltered grep 148 matches; after dropping `spawning process` lines, `429` count 1 and "rate limit" count 2 across 5100 real lines. The 148 figure came from this session's own `Select-String` command echoed into the log. | recorded 2026-09-26 | confidence high*

### A setup whose own plugin fails to load is invisible in normal use

The flow is delivered by a plugin, so a plugin that cannot load is a setup that still starts: the session opens, every agent is registered, and the only thing missing is the injected rules â€” nothing errors where the user is looking. The plugin imported `@opencode/plugin` at runtime, so a fresh clone with no `npm install` failed with `ERR_MODULE_NOT_FOUND` and lost the whole flow silently, while the same import inside the already-installed directory worked and revealed nothing. The dependency bought nothing at runtime (`define` is `plugin => plugin`, an identity helper that exists for types), so the rule is: a setup delivered by a plugin needs a test that performs the load, not a test that inspects the source. Import the plugin from a temp directory with no `node_modules` above it, and assert every plugin path in the config exists on disk.

*tags: opencode, plugin, onboarding, silent-failure, dependency, testing | evidence: clean clone to %TEMP%\opencode\cleanroom with no node_modules: `import('./plugins/coding-flow.js')` â†’ ERR_MODULE_NOT_FOUND, Cannot find package '@opencode/plugin'. After declaring `define` locally, the same import from a mkdtemp directory with no node_modules in any parent â†’ LOADED id=coding-flow; suite 13/13 in 0.2s with no install step. | recorded 2026-09-26 | confidence high*

### `opencode run` ignores your environment unless you pass --standalone

`opencode run` connects to a background service that was launched with its own environment, so `OPENCODE_CONFIG_DIR` has no effect on which config and which plugins are loaded â€” the run quietly uses the already-installed config instead of the one you set up to test. The tell is a probe: a plugin wired into a throwaway config directory that logged nothing, and the same probe logging every event the moment `--standalone` was added. This produces false evidence with a green result, which is the worst kind: a "clean-room" run that tested the developer's own machine. Rule: any verification that depends on the environment â€” a config directory, an env var read by a plugin, a private model â€” must pass `--standalone`, and must prove which config was loaded with a probe rather than inferring it from the result. Re-verified afterwards: seven context events, all tagged `from: the-clone`, each showing `hasQuestion: false`.

*tags: opencode, standalone, environment, verification, false-evidence, config | evidence: without --standalone the clone probe wrote 0 lines while the run succeeded; with --standalone the same run wrote 7 lines tagged from:the-clone. A second probe for the compaction hook wrote 0 lines under both modes, which is a separate fact: the hook exists but no compaction was triggered (keep.tokens is the budget to keep, not the trigger; the trigger needs the model's full context, and a large-context free model makes that expensive). | recorded 2026-09-26 | confidence high*

### A plugin hook that throws takes out every tool in the session

Adding a tool-call tally to the coding-flow plugin, I referenced an identifier I had not declared. The failure did not arrive where it happened: `read` and `shell` calls started returning `pulse is not defined`, one error per call, and the session lost its tools entirely while the file on disk parsed cleanly with `node --check`. `tool.execute.after` runs after *every* tool call, so an exception thrown there is raised against the agent's next action rather than against the measurement, and a bug in an observability hook becomes a total outage. Wrap measurement hooks whole in try/catch, and pin it: call the hook with a deliberately malformed event and assert it does not throw.

*tags: opencode, plugin, hook, error-handling, observability, outage | evidence: two consecutive read and shell tool calls returned {"error":"unknown","message":"pulse is not defined"} while `node --check plugins/coding-flow.js` exited 0; after the declaration landed the same calls worked. Guard now: try/catch around the whole hook body plus a test asserting `doesNotThrow(() => after({ tool: "read", status: "completed" }))`. | recorded 2026-09-27 | confidence high*

### "Prove it by testing it" becomes an open loop on work with no failing check

The doctrine said to prove work by running, testing, and trying to break it. That is right for a bug and wrong for a page: a visual or copy change has no check that fails, so the instruction has no exit condition and the run keeps refining, spending tokens and changing nothing the user can see — the owner reported exactly this on a landing page and came back to an unchanged page. Two corrections, both mechanical rather than exhortative: the check must be one that *can fail* for the defect in question (a failing-then-passing test, an exit code, a page that loads clean, a number for a performance claim), and the stop condition is named — work ends when that check passes, and when the request states no criteria, derive the smallest set and stop rather than inventing more. Diagnosis worth keeping: a headless run never entered this loop, and the run that did had a browser tab available. Reproduce the environment before concluding a behaviour is fixed.

*tags: doctrine, stopping, checks, loop, visual-work, verification | evidence: the same landing-page task headless, before and after the change: 11 requests / 55s / 21s idle after the last write, then 12 requests / 69s / 35s — unchanged within noise, because no loop was ever entered without a browser tab. The failure is therefore measured, not fixed: the plugin now samples tool calls against file changes every 20 calls and doctor prints the ratio (longest observed run: 40 calls, 21 of them changing a file, 53%), and a new eval criterion rejects a reply that announces the next pass. | recorded 2026-09-27 | confidence high*

## semantic

### Case folding must run after Unicode decomposition, never before

A slug pipeline that lowercases first and normalizes second is not idempotent, because a caseless character can decompose into an uppercase letter: `ð“–` (U+1D4D6, mathematical bold script capital G) is caseless â€” `toLowerCase` leaves it alone â€” and its NFKD mapping is the ASCII `G`. Folding first therefore leaves a `G` in the slug, and slugifying that slug again lowercases it to `g`, so the same title changes URL the second time round. Order that is stable: `NFKD` â†’ strip `\p{M}` â†’ `NFC` â†’ `toLowerCase` â†’ any explicit character table â†’ the whitelist pass. The reordering also keeps the two neighbours intact: trailing `NFC` is required or Hangul ships as decomposed jamo, and folding after the mark strip is what turns `Ä°` into `i`.
*tags: unicode, normalization, idempotence, regex, slug | evidence: tools/slug-fuzz.mjs, 40 084 seeded random-Unicode inputs, reported `21 FAILURES by rule: {'not idempotent': 21}` with `"ð‘¼"`-class inputs, e.g. slug `×¨Î±×™undefinedU-ð¤• -× ...` re-slugged to `×¨Î±×™undefinedu-ð¤• -× ...`; after moving `toLowerCase` below `normalize("NFKD")` the same probe prints `ALL INVARIANTS HOLD`. The fuzzer was needed because all 13 hand-written cases passed with the wrong order. | recorded 2026-09-26 | confidence high*

### A widely used library can be the defect: check what a dependency deletes

`@sindresorhus/slugify` is the canonical modern slugifier and its README states the result is always ASCII, so it deletes every character outside that set: `æ—¥æœ¬èªžã®ã‚¿ã‚¤ãƒˆãƒ«`, `í•œêµ­ì–´ ì œëª©`, `×¢×‘×¨×™×ª` and `ÐŸÑ€Ð¸Ð²ÐµÑ‚ Ð¼Ð¸Ñ€` all become `""`, which is the empty-URL bug being reported, delivered as a feature. `simov/slugify` is Unicode-preserving but leaves emoji, the zero-width joiner and U+202E bidi overrides in the slug, and does no NFC normalization. Neither is a drop-in oracle. Before adopting a library for "make it URL-safe", diff it against the failing case: the fastest check is to install both, run one corpus through them, and read what disappears.
*tags: dependencies, slug, unicode, url-safety, evaluation | evidence: both installed side by side in a scratch dir; `node oracle.mjs` over a 26-title corpus. sindresorhus: `"æ—¥æœ¬èªžã®ã‚¿ã‚¤ãƒˆãƒ«"` â†’ `""`, `"ÐŸÑ€Ð¸Ð²ÐµÑ‚ Ð¼Ð¸Ñ€"` â†’ `"privet-mir"`. simov: `"æ—¥æœ¬èªžã®ã‚¿ã‚¤ãƒˆãƒ«"` preserved but `"Hello ðŸ‘‹ World"` â†’ `"hello-ðŸ‘‹-world"` and `"underâ€®score"` keeps the override. The zero-dependency NFKD pipeline kept every script and stripped every invisible, matching no library on all 26 cases. | recorded 2026-09-26 | confidence high*

### three.js r128 UMD loads and constructs geometries headlessly in Node

three@0.128 build/three.min.js can be require()d in Node and used without any WebGL context: BufferGeometry, Float32BufferAttribute, setIndex, Mesh, CanvasTexture, Colors all work headless. Only WebGLRenderer needs a real context.
*tags: threejs, node, headless, r128 | evidence: vuiton harness: ensureChunk path built real BufferGeometry+Mesh per chunk with real three.min.js; T4e PASS; no stubs for THREE classes needed. | recorded 2026-09-25 | confidence medium*

### Current harness failure and parse result

The current inline script parse length observed on 2026-09-25 is 34563 characters, and the current harness's first observed failure is the T10 jump assertion after 10,950 completed assertions.
*tags: minecraft, verification, node | evidence: Exact parse command stdout: `inline script parses OK, length=34563`; harness stderr: `HARNESS FAIL: ASSERT FAIL: jump gives upward velocity | n=10950`. | recorded 2026-09-25 | confidence high*

### three r128 Float32BufferAttribute rounds values â€” use tolerance in assertions

Three.js r128 encodes positions/colors/UVs as Float32Array, so reading back e.g. 0.85 or 2/3 gives 0.85000002384... which !== the JS literal 0.85. Harness comparisons for shade colors and UV tile coordinates must use tolerance (~1e-6), not === or includes. Integers (positions, normals 0/Â±1) remain exact.
*tags: threejs, testing, float32, harness | evidence: Harness failed 'shade color' and foundTop UV checks until switched to Math.abs diff < 1e-6; then ALL PASS 40532. | recorded 2026-09-25 | confidence high*

## episodic

### Pointer-lock overlay regression verified via node harness (browser tools unavailable)

vuiton game: direct shell and browser tools are permission-blocked in this environment; the working verification channel is verifier subagents running node. Harness vm-stubs DOM (canvas.requestPointerLock sets pointerLockElement, overlay classList, hud style, startBtn text) and asserts T18/T19 pointer-lock overlay toggling + unlock. Final run: ALL PASS (40532 assertions), HARNESS OK (5 static checks), inline script parses length=34563; dir cleaned to lib/index.html/README.md.
*tags: vuiton, verification, pointer-lock, harness, overlay | evidence: Verifier runs: failures at n=10810 (leaf), 10862/10950 (jump tunneling), 10965 (glass cutout expectation) sequentially fixed to final exit 0. | recorded 2026-09-25 | confidence high*


## testing

### A test double is part of the test: fidelity gaps masquerade as app defects

A DOM/event stub is only evidence if it answers what a browser answers. Four separate false failures in the vuiton app suite all came from the harness, not the app: `new DomEvent(type, init)` dropped every init field except `detail`, so `event.key` was `undefined` and a keydown handler crashed; `:checked` was silently ignored by the selector engine, so a phase-filter assertion counted all 6 inputs as 6; `:nth-child(n)` was unsupported so a sorted-header lookup returned `null`; and reflected properties (`title`, `type`, `href`) were undefined instead of the attribute value. The general rule: when a stub is missing a feature, the first symptom is a failure that looks like an application bug, and the expensive mistake is to "fix" the app. Audit the double before the app â€” check what the constructor copies, what the selector engine silently drops, and which DOM properties are reflected.

*tags: testing, harness, dom, stub, fidelity, debugging | evidence: vuiton tests/app.test.mjs + tests/support/dom.mjs. `harness.press('#tabScene', 'ArrowRight')` threw "Cannot read properties of undefined (reading 'startsWith')" inside the app; `#phaseList input:checked` returned 6 after `onlyPhase('castle')` set exactly 1; `.bom-table thead th:nth-child(1) [data-sort]` was null. All four passed after the stub was corrected, with no app change. | recorded 2026-09-26 | confidence high*

### A test double must be proved capable of failing, not just of passing

A regression test that never failed is an assertion, not evidence. Run the same suite against the revision that had the bug and read the failure message: it must name the defect, not a missing element. For vuiton this was a one-line harness option (`VUITON_APP_PATH`) plus the pre-upgrade `app.mjs` extracted from a backup, which turned "the test passes" into "22 of 24 fail, and the two defect tests fail with `434 !== 44` and `'scene' !== 'build'`" â€” the first being exactly the 390px panel offset, the second the missing arrow-key listener.

*tags: testing, evidence, regression, harness, f2 | evidence: VUITON_APP_PATH=<pre-upgrade app.mjs> node --test tests/app.test.mjs -> pass 2 fail 22; the same command on the current tree -> pass 24 fail 0. | recorded 2026-09-26 | confidence high*

## ui

### An absolutely positioned overlay lives in its containing block, not in the window

`.piece-tooltip` was `position: absolute` inside `.viewport`, which sits at `left: var(--panel-w) = 390px`, `top: var(--topbar-h) = 72px`. Feeding it `pointerEvent.clientX/clientY` put the tooltip 390px and 72px to the right of and below the cursor â€” a CSS offset the JavaScript cannot know about. Position from the offset parent's own rect (`x - rect.left`) and the same code is correct in every layout, because the rect already contains the layout. The tell: an overlay that is right on a full-width viewport and wrong on a split one. Generalise: any overlay anchored to the pointer must ask the anchor element for its box, never the window.

*tags: ui, css, positioning, tooltip, coordinates, vuiton | evidence: index.html --panel-w: 390px, --topbar-h: 72px; `processHover()` in src/app.mjs set `left = pointerClient.x + 14`. Harness run at clientX 420: old code `left = 434px`, new code `left = 44px`; regression assertion `left === hit.x - rect.left + 14` fails 434 !== 44 on the pre-upgrade module. | recorded 2026-09-26 | confidence high*

### A roving tabindex with no keydown listener is a promise the markup breaks

The tab strip set `tabindex="0"` on the selected button and `-1` on the rest, declared the WAI-ARIA tabs pattern, and listened for nothing. Keyboard users reached one tab and got stuck: no ArrowLeft/Right, no Home/End, and a screen reader announcing a tablist whose keyboard contract does not exist. Keyboard affordances are code, not markup â€” `tabindex="0"` on exactly one element is only correct if something moves it. Implement the full pattern (arrows, Home/End, wrap, `preventDefault` so the page does not scroll) or drop the roving markup.

*tags: ui, accessibility, tabs, keyboard, wai-aria, vuiton | evidence: index.html declared the roving tabindex; `tests/app.test.mjs` "tab strips support arrow keys, Home and End" fails on the pre-upgrade app with actual 'scene' expected 'build' after `press('#tabScene', 'ArrowRight')`, and passes after `handleTablistKeydown` was bound in bindInterface. | recorded 2026-09-26 | confidence high*

### Restore state by validating every id against the live markup, and discard what does not match

A persisted preference is a promise about ids that a later build may have retired. Spreading a stored payload straight into state left three failure modes, all found by one test: a `tab` id with no matching `[data-tab]` button left every panel hidden with no active tab, a `view` id absent from `cameraViews` was written straight back to storage and failed again on every subsequent load, and a `phases` array containing an id from a different build silently shrank the model. Rule: filter phase ids against the live set, resolve the tab against the live buttons, resolve the view through the camera map and persist the resolved id. Also version the payload and discard an old or unparseable one outright â€” a half-understood preference is worse than the documented default.

*tags: ui, state, persistence, localStorage, validation, defaults | evidence: tests/app.test.mjs "an unreadable or outdated stored payload falls back to the defaults" â€” with `{version:1, phases:['khong-ton-tai'], tab:'khong-co', view:'khong-co'}` the panel checkbox count stayed 6, the active tab fell back to scene with #scenePanel visible, and the written-back `view` was 'overview'. `flyTo` now resolves before assigning `state.currentView`. | recorded 2026-09-26 | confidence high*

### A plain-object index also answers for inherited keys

`cameraViews[viewId] ? viewId : 'overview'` is a guard that passes for `"constructor"`, `"__proto__"` and every other key `Object.prototype` contributes: the lookup returns a truthy member of the prototype, not a view. `new THREE.Vector3(...view.position)` then threw on `undefined`, `boot()` caught it, and the page sat on "KhÃ´ng thá»ƒ khá»Ÿi táº¡o WebGL" â€” with WebGL perfectly fine â€” because the poisoned id was written back to storage before the throw and re-failed on every load. Use `Object.hasOwn(map, key)`, or a `Map`, or `Object.create(null)`. A truthiness test on a string-keyed object literal is not a validity test.

*tags: javascript, prototype, lookup, validation, persistence, three.js, vuiton | evidence: src/app.mjs flyTo and phaseView. With `localStorage['vuong-cung-dien:ui:v1'] = '{"version":1,"view":"constructor"}` the pre-fix app threw `TypeError: view.position is not iterable`, `window.diorama` was never created, and the stored view stayed "constructor" forever. tests/ui-state.test.mjs "an unreadable or outdated stored payload falls back to the defaults" and "no prototype key can become the current camera view" now cover all five prototype keys and fail on the pre-fix module. | recorded 2026-09-26 | confidence high*

### A failed assertion on a large object graph reports the symptom, not the cause

`assert.equal(window.diorama, undefined)` â€” where `window.diorama` holds a 2 057-piece model and a live three.js scene graph â€” did not produce a diff. It produced 37 seconds of `util.inspect` walking the whole object and then `RangeError: Array buffer allocation failed`, which reads like a memory bug in the app under test. The assertion was wrong (the app had booted, so `api` was defined) and the cost of finding that out was the entire test budget. Compare primitives and booleans: `assert.equal(typeof api.flyTo, 'function')`, `assert.equal('diorama' in window, false)`, `assert.equal(Object.is(globalThis[key], value), true)`.

*tags: testing, assertion, node, assert, memory, debugging | evidence: tests/ui-state.test.mjs ran 37 443 ms and failed with `[RangeError: Array buffer allocation failed]`; the identical boot sequence outside the runner took 906 ms and 57 MB heap. Replacing the object comparison with a typeof check made the same test pass in 676 ms. | recorded 2026-09-26 | confidence high*

### An HTTP client normalises the request target, so a server test must write the request line itself

`Invoke-WebRequest http://127.0.0.1:4199/%zz` answered 404 and the server kept running, which read as proof the path was handled. `curl --path-as-is` and a hand-written `node:net` request both showed the same target closing the connection with no response, because `decodeURIComponent` threw inside the request handler and the exception was uncaught. A client library that "helpfully" encodes the URL is hiding exactly the input you wrote the test for. Drive the socket directly: `node:net`, one string, the request line written verbatim.

*tags: testing, http, tooling, security, server, normalization, vuiton | evidence: tools/serve.mjs resolveRequestPath with an unguarded decode. `GET /%zz` over a raw socket killed the process (connection closed, next request actively refused); through Invoke-WebRequest the same URL returned 404 and the server survived. tests/serve.test.mjs now writes the request line itself and fails 4 of 7 on the pre-fix handler. | recorded 2026-09-26 | confidence high*

### With a post chain up, renderer.render() calls are not frames, and renderer.info reports only the last pass

Two counters that used to mean "is the loop still running" stop meaning that. `renderer.render()` is called once per composer pass, so a frame is a dozen calls; and three resets `info` at the start of every `render()`, so with a chain the readout is the last fullscreen quad, not the frame. Fix both explicitly: increment an app-owned `frameCount` in the single draw entry point, and set `renderer.info.autoReset = false` with one `info.reset()` per frame, so `info.render.calls` is the true per-frame total across every pass. A test written against the old semantics silently starts asserting the wrong thing: `assert.equal(renderedFrames, resumed + 3)` failed with 3793 !== 3748, which reads as a leak but was 15 passes per frame.

*tags: threejs, postprocessing, metrics, testing, instrumentation, vuiton | evidence: tests/app.test.mjs "a backgrounded tab stops drawing and resumes when it returns" â€” actual 3793 expected 3748, i.e. 45 renderer calls for 3 frames at the top tier. After the change the same test asserts on `vfx.getState().frames` and on `renderedFrames` strictly increasing, and passes. | recorded 2026-09-26 | confidence high*

### A renderer double that counts meshes must honour inherited visibility, not the object's own flag

The double walked the scene and counted every mesh whose own `visible` was true, so an object inside a hidden group still counted as drawing. The real `WebGLRenderer.projectObject` returns early for an invisible object and never visits its children. Symptom: the geometry-only frame measured 55 draw calls where the real scene is 52, and the three extra calls were the sky dome, the mote field and the caustics plane â€” all of them already hidden at the tier being measured. Audit a traversal-based double for the early-return behaviour, not just for the leaf predicate.

*tags: testing, harness, double, threejs, visibility, fidelity, vuiton | evidence: tests/support/harness.mjs render() used `if (!object.isMesh || object.visible === false) return;` inside scene.traverse. Replacing it with a recursive visit that threads the parent visibility through produced 52 draw calls with the atmosphere group hidden, matching tests/app.test.mjs "the single instanced-mesh pass". | recorded 2026-09-26 | confidence high*

### A pass constructed with a camera keeps that camera for its whole life

`new RenderPass(scene, camera)` reads the camera once at construction. Adding a second camera later â€” here an orthographic diorama camera plus a perspective first-person camera â€” leaves the composer rendering the *old* view forever: the frame looks correct in the diorama and wrong the instant the other camera is live, and the bug is invisible in any screenshot taken from the diorama. Any object that holds a reference to something the app can swap has to be re-pointed at the swap point, not at construction. Hand the pass the live camera on every frame; the cost is one assignment and there is no way for the two to drift.

*tags: threejs, postprocessing, camera, design, testing, vuiton | evidence: src/app.mjs renderFrame. Bite proof: commenting out `postFx.renderPass.camera = activeCamera();` makes tests/vfx.test.mjs "the chain is given the camera that is actually being drawn" fail with actual `OrthographicCamera { bottom: -28.388... }` expected `PerspectiveCamera`; the rest of the file stays green, so the assertion names the defect rather than a missing feature. | recorded 2026-09-26 | confidence high*

### A damped control does not stop instantly: assert the shape of the decay, not zero

Exponential damping (`1 - exp(-k*dt)`) means a released key, or a window that lost focus, leaves the body coasting for a few hundred milliseconds. A test asserting "moved less than 0.2 studs after 480 ms" fails on correct behaviour and invites a "fix" that cuts the velocity to zero â€” which removes the deceleration the design is for. Assert the two phases separately: a first window in which it still moves (the coast), then a window in which it is genuinely still (the stop). The same rule applies to any hand-off of control between actors: the new one takes over with the old one's velocity, not from rest.

*tags: testing, physics, damping, input, threejs, vuiton | evidence: tests/first-person.test.mjs "a key held when the window loses focus does not stick" â€” the first draft asserted < 0.2 studs over 30 frames and failed, because walk speed 9 divided by accel 14 is 0.64 studs of remaining travel. Rewritten as < 1.5 studs over the coast window then < 0.05 studs over the next, and it passes while the damping stays. | recorded 2026-09-26 | confidence high*

### A point test cannot see an obstacle thinner than the step: sweep by substepping

Collision that asks only "is the destination free?" is a point test, and a point test is blind to anything thinner than the largest step it allows. Here one frame could ask for `runSpeed * MAX_STEP_SECONDS = 16 * 0.05 = 0.8` studs while the collision grid's thinnest representable feature was one `cellSize = 0.5` cell, so a diagonal run clipped the corner of a one-cell pillar with both endpoints legal. The delta cap that prevents teleporting is also what makes the step larger than the wall, so the two features have to be checked against each other and not just reasoned about separately. Fix by substepping: split the frame's motion into pieces no longer than half a cell and run the existing resolution on each. That reuses the collision code unchanged, keeps the slide-along-a-wall behaviour instead of degrading to a hard reject, and costs at most four iterations. The tell: `maxStep / cellSize > 1` in the collision layer.

*tags: collision, physics, swept, substepping, delta-cap, threejs, security, vuiton | evidence: an adversarial 6 000-frame spiral probe at 50 ms/frame with Shift held reported `maxStep=0.7999 (1.60 cells)`, `endpoints inside a blocked cell: 0`, `swept crossings with both endpoints legal: 21`, first at frame 677 near (8.69, 6.68) -> (8.30, 6.47) clipping a 2x2x3 pillar. After substepping at `NAV_RULES.cellSize * 0.5` the same probe reports 21 -> 0 crossings with maxStep unchanged at 0.7999, and tests/first-person.test.mjs "a slow machine running cannot step over a one-cell wall" fails with `frame 677 stepped through a blocked cell / 9 !== 0` when the substep count is pinned to 1. | recorded 2026-09-26 | confidence high*

### A persisted setting that is only remembered is a lie in the UI

Adding a field to a stored payload is half the work. The value has to reach the subsystem at boot as well: here the quality tier was restored into `state.qualityMode` and rendered on the button, but the boot path created the post-processing chain with `applyQualityTier(state.qualityTier)` and the tier literal was always the top one, so a viewer who had pinned the cheap tier on a slow machine was handed the expensive one again with a button claiming otherwise. The failing signal is a UI that can state something the engine is not doing â€” assert the *effect* on the second boot (chain off, pixel ratio 1), not the label. Same shape as the retired `view` and `tab` ids: a preference is a promise about what the engine will do.

*tags: ui, state, persistence, localStorage, boot, testing, vuiton | evidence: tests/ui-state.test.mjs "the look and the quality setting come back on the next load". Bite proof: commenting out `setQualityMode(state.qualityMode);` from the boot sequence makes it fail with `restored tier: high` while the pill on the button still reads MÆ¯á»¢T. | recorded 2026-09-26 | confidence high*

### Assert the invariant when the exact number belongs to a third-party pass

`UnrealBloomPass` draws a number of fullscreen quads that depends on three's internal mip count, so hardcoding the total draw calls of a chained frame is a test that breaks on a library upgrade while saying nothing about the code. What the code owns is the claim "the chain adds a bounded handful of fullscreen passes and does not scale with the scene". Measure the bare scene with the effects off (52 draw calls for 2 057 pieces â€” that number is ours), then assert the chained frame is strictly greater and less than a loose bound above the measured bloom cost, and that disabling the look returns to the exact bare number. Each assertion fails for a different real defect, and none of them encodes another library's internals.

*tags: testing, threejs, postprocessing, metrics, design, vuiton | evidence: tests/app.test.mjs "the effects chain runs as real passes and adds only fullscreen work" â€” bare 52, chained measured 70 (3 atmosphere objects + 15 pass quads), bound asserted < 40. The bare number is asserted separately with the chain off precisely so the geometry cost is not entangled with bloom's mip count. | recorded 2026-09-26 | confidence high*

### An `await` inside a loop serializes work the caller expected to overlap

`for (const id of ids) out[id] = await fetcher(id)` looks concurrent and is not: the first `await` suspends the whole function, so the second fetcher does not even start until the first settles. The observable symptom is that only the first id ever appears in the fetcher's own start log, and a batch of four 60 ms fetches takes 260 ms instead of 74 ms. Launch every promise first, then await once: `const started = ids.map(fetcher)`, `const results = await Promise.all(started)`, then re-zip with the ids to rebuild the result. `Promise.all` also subscribes to every promise, so a sibling rejection stays handled instead of surfacing as an unhandled rejection after the first one short-circuits. Pair the result back by index, never by completion order - out-of-order resolution is the failure a concurrency fix introduces if it zips wrongly. The tell: any `await` in a `for` loop over ids whose fetches do not depend on each other.

*tags: async, concurrency, promise-all, testing, sequential-awaits | evidence: load.js `loadAll` with a gated async fetcher started only `['a']`; the project test load.test.js "starts every fetch before awaiting any" failed with actual `['a']` expected `['a','b','c']`. After the fix it passes, and a negative control run against the original implementation fails the two concurrency assertions (peak in-flight 1 !== 5, 260 ms >= the 200 ms bound) while the mapping, rejection and result-shape assertions pass on both. | recorded 2026-09-26 | confidence high*
### A green suite is evidence about the inputs it exercised, not about the contract

`truncate.js` shipped `if (text.length <= max) return text + "..."` - the branch that returns the text unchanged had its body inverted - and `truncate.test.js` stayed green because its single case took the other branch (`"hello world"` at 8 is longer than the limit). Probing every clause of the written contract first is what surfaced it: `truncate("hello", 5)` returned 8 characters. When a suite is already green and the spec lives outside the code, do not read green as done; enumerate the documented clauses and run each one before changing anything.

*tags: testing, coverage, spec, off-by-semantics, silent-semantics | evidence: probe of the original implementation showed `truncate("hello", 5) => "hello..."` (len 8) and `truncate("hello world", 11) => "hello world..."` (len 14), both contradicting the doc, while `node --test` reported 1 pass. The new suite fails 4 of its 5 new cases against the original file and passes 6/6 against the fix. | recorded 2026-09-26 | confidence high*
### A fuzz oracle written by hand repeats the bug it is hunting

The 50 000-case fuzz against the `truncate` fix reported `'' !== '..'` for an empty string at `max = -1`. The implementation was right: the oracle branched on `text.length > max`, and `0 > -1` is true, so it expected `"...".slice(0, -1)` - a negative end index counts from the end, yielding `".."`, the exact defect under repair. The same trap that made `max < 3` overflow the budget was reproduced inside the checker. When a generated assertion disagrees with the code, suspect the oracle first: clamp the limit in the oracle with the same rule the code uses, and derive both from one shared helper so they cannot drift.

*tags: testing, fuzz, oracle, slice, negative-index, clamp | evidence: fuzz.mjs failed with `actual: '', expected: '..'` at `text="" max=-1`; rewriting the oracle to clamp with `Math.max(0, max)` made all 50 000 random pairs pass, including surrogate pairs, accents, CJK and negative limits. | recorded 2026-09-26 | confidence high*
### Establish the noise floor before believing a performance A/B

A layout change took frame time from a reported 16.6 ms to 21.2 ms and looked like a regression. Measuring the *same build* four times gave 16.6 / 17.0 / 22.2 / 28.4 ms - a spread wider than the effect being tested. A second cross-check killed it faster: disabling the ambient layer, disabling only the canvas, and removing one `background-clip: text` each recovered the *same* 4.7 ms, which is impossible for three independent costs and is the signature of a single-threaded software rasterizer sitting just over the frame budget, where dropping any one thing lets the frame fit. A delta smaller than the run-to-run spread of a byte-identical build is not a measurement. Before attributing a performance change, run the unchanged build repeatedly to get the spread, and treat several mutually-exclusive fixes recovering an identical amount as evidence about the harness rather than about the code. Corollary: never ship an "optimization" whose benefit you could not observe - state it as unmeasured instead.

*tags: performance, benchmarking, ab-testing, noise-floor, harness, frame-budget, software-raster | evidence: 4 runs of one unchanged build at dpr2 = 16.6/17.0/22.2/28.4 ms median (+-70%); variant sweep at dpr2 = no-ambient 16.6, no-canvas 16.8, stat-no-clip 16.9, no-stats 21.7 vs baseline 21.5; interleaved A/B new-layout 29.0/24.2 vs old-4-col 23.4/25.2 (overlapping); at dpr1 both builds 16.7 median. | recorded 2026-09-27 | confidence high*

### A screenshot's pixel space is devicePixelRatio times the CSS-pixel rect space

Decoding a PNG and indexing it with `getBoundingClientRect()` output samples the wrong region the moment the device pixel ratio is not 1. At dpr 2 a CSS-pixel rect at y=214 addresses image row 214, which is CSS y=107 - so a valid-looking result of "0 ink pixels here" was really the wrong band of the page, and the mistake looked exactly like a rendering bug. Wrap the samplers in one function that takes a `dpr` and scales every coordinate once, so the correction lives in a single place instead of being re-derived per script. Related: an override installed on `DOMContentLoaded` cannot change a value read at script-parse time, so a harness that tries to fake `devicePixelRatio` that way silently measures the unmodified build - assert the resulting `canvas.width` before believing the run.

*tags: puppeteer, screenshot, png, dpr, devicePixelRatio, pixel-sampling, harness | evidence: at dpr2 the mask-line sample reported `{boxH:88, textRows:0}` (no ink) while the dpr1 run on the same build reported `textRows:2, ink:12326`; the identical bytes prove the rects were mis-scaled. A `devicePixelRatio` override via `DOMContentLoaded` left `canvas=2880x2000` in all four "cap 1.5" runs, showing it never applied. | recorded 2026-09-27 | confidence high*

### `python -m http.server` is single-threaded and will be the thing you measure

Lighthouse against a 96 KB static page reported FCP 2.8-3.8 s and TBT swinging 10 / 230 / 530 / 560 ms across four runs. The page had zero long tasks. `http.server` handles requests serially, so Lighthouse's request pattern queues behind itself, and the resulting numbers describe the test rig rather than the page. Serve with `ThreadingHTTPServer` (`socketserver.ThreadingMixIn` + `allow_reuse_address`) before quoting any Lighthouse figure, and check for stray servers left over from earlier runs - two extra instances were alive during the bad measurement.

*tags: lighthouse, python, http.server, threading, benchmark, harness, tbt, fcp | evidence: 4 Lighthouse runs on the single-threaded server = perf 61-85, FCP 2.8-3.8 s, TBT 10-560 ms, while the same build measured 0 long tasks and 16.7 ms median frames; three python `http.server` processes were running at the time. | recorded 2026-09-27 | confidence high*

### Puppeteer no longer invokes a function passed to evaluate as a string

`page.evaluate("(sel) => { ... }", arg)` returned `{}` for every call - the string is evaluated as an expression yielding the function itself, and the result is never applied, so a whole audit reported empty objects with no error. The same harness code worked when rewritten as a real function. A silent `{}` from `evaluate` means the page function did not run; check the serialization, not the page.

*tags: puppeteer, evaluate, serialization, harness, silent-failure | evidence: `page.evaluate(DOM_AUDIT)` and `page.evaluate(LINE_COUNT, sel)` both returned `{}` for all four viewports in uiaudit.js, so the entire DOM half of the audit was empty; rewriting both as real function expressions produced full result objects. | recorded 2026-09-27 | confidence high*

### Never round-trip a non-ASCII file through PowerShell `Get-Content` / `WriteAllText`

`Get-Content $f -Raw` reads a BOM-less UTF-8 file as the system ANSI codepage, and `WriteAllText` then writes the mangled string back as UTF-8, so every Vietnamese character becomes one cp1252 char per original byte. It happened while removing a CSS class from `index.html`: 25 148 bytes became 30 970, all 7 checked Vietnamese strings vanished, and the distinct accented-character count collapsed from 77 to 11. Nothing errored - Lighthouse still reported accessibility 100, because mojibake is still valid text. The corruption is strictly invertible when it produced zero U+FFFD, which proves the byte->char map was lossless: map each char back to its cp1252 byte and decode the resulting buffer as UTF-8. 519 mojibake pairs became 0, 9 of 10 strings came back, and the letter distribution read đ(91) ư(82) ô(81) à(71) - correct Vietnamese. Do the edit with a byte-safe tool instead: the `edit` tool, node `fs.readFileSync`/`writeFileSync` with an explicit `"utf8"` encoding, or `Get-Content -Encoding utf8` plus `-Encoding utf8` on write. Corollary: after any tool touches a non-ASCII file, assert on the decoded content - count distinct accented characters and grep for known strings - because a read that *displays* mojibake proves nothing, the file on disk is what matters.


### A generic element rule outranks a component class and silently eats it

`.bento__cell p` is (0,1,1). `.bento__foot` is (0,1,0). So the generic rule won, and three of the
component rule's four declarations never applied: `font-size` (declared 0.78rem, computed 15.04px),
`color`, and `margin-top: auto` - which meant the bottom-pinning mechanism the design docs described as
working had never once run, and the slack it was supposed to absorb was falling below the footer as
unabsorbed space. Nothing looked broken; the layout just had unexplained 24-48px gaps in a 721-834px
band that happened to fall between the viewport widths a hand-picked breakpoint sweep had sampled.

Class selectors are not equal: an element+class always beats a bare class, whatever the file order.
The audit that finds this is cheap and general: extract every single-class selector that declares a
property, ask `getComputedStyle` what that property actually resolves to, report the mismatches. Two
things make the check trustworthy: derive expectations from the stylesheet rather than from memory, and
skip classes that have a same-specificity modifier (`.btn--sm` legitimately narrows `.btn`) - a check
that reports false failures is a check people learn to ignore. Fix by excluding the component from the
generic rule (`:not(.bento__foot)`), not by inflating the component's specificity, which stops the
generic rule from overreaching again the next time someone adds a property to it.
