# Running Seedvale's `?benchmark=` harness with `agent-browser`

**Status:** operational guide, not a performance result. Written after a session (2026-08-17, plan 148) that hit several real `agent-browser` pitfalls against this specific app — headless Chrome + SwiftShader + a heavy Three.js scene is a rougher environment than most `agent-browser` targets. Read this before running a benchmark; it will save you several failed turns.

See also: `src/perf/benchmark.ts` / `benchmarkScenarios.ts` / `types.ts` (the harness itself) and plan 143's implementation notes (`docs/plans/2026-08-17--143--cross-chunk-vegetation-batching-implementation-notes.md`, "Benchmark:" section) for a worked before/after example with a results table.

## Load the skill first

```bash
agent-browser skills get core
```

Don't guess at CLI flags — `agent-browser eval --help` etc. are cheap to check and this app's harness has already broken assumptions once (see "No `--timeout` flag on `eval`" below).

## The app's benchmark API

The harness doesn't run off a `?benchmark=` URL param that auto-fires — the app exposes JS globals once the world has loaded:

```js
window.__seedvaleReady               // true once the world/scene exist
window.__seedvaleRunBenchmark(id, durationSec)  // Promise<PerfReportJson | null>
window.__seedvalePerfLastReport      // side-channel: last report, set regardless of who awaited the promise
window.__seedvalePerfReports         // side-channel: array of every report this session
```

`id` is one of `current | forest | settlement | water | night | stress | stream` (`src/perf/benchmarkScenarios.ts`). Default `durationSec` is 30. The promise resolves to a `PerfReportJson` (`src/perf/types.ts`) — key fields:

- `fps.{avg,min,p1}`, `frameTime.{avg,p95,max}`
- `systems.RENDER` (CPU ms for the render system)
- `rendering.{drawCallsAvg,trianglesAvg}`
- `scene.<bucket>` for `bucket` in `terrain|grass|vegetation|environment|settlement|water|npc|fauna|items|other` — each `{meshes,instancedMeshes,instances,drawCalls,triangles}`. This is the one that actually shows a geometry-LOD-style change (raw triangle count for the `grass` bucket, etc.) — `rendering.trianglesAvg` alone won't isolate a specific system.
- `context.{loadedChunks,npcCount,faunaCount,quality,seed,terrainResolution}`

Open with world params in the URL, e.g. `http://localhost:5577/?seed=42&res=193` (matches the plan's own benchmark protocol — `seed`/`res` apply on **New Game**, not on **Continue** of an existing save, see below).

## Pitfall 1 — the start menu appears once a save exists, and clicking through it can hang

First-ever navigation to a fresh Chrome profile (no IndexedDB save yet) skips straight into the world. Any **later** navigation to the same origin, once a save has been written, shows a `Kontynuuj` / `Nowa gra` menu and `window.__seedvaleReady` never becomes true until you click one. Clicking `Nowa gra` in this environment (headless Chrome + SwiftShader software WebGL) was observed to hang the tab's `Runtime.evaluate` CDP channel for minutes — `agent-browser wait --fn ...` and even `agent-browser screenshot` timed out completely (the renderer process wasn't pegged at 100% CPU either — it looked like a genuine stall, not just "slow", though the root cause wasn't tracked down).

**Fix:** use a brand-new `agent-browser --session <name>` (fresh Chrome profile, no persisted save) for every navigation you want to land directly in-world. Don't reuse a session that has already played through a `Nowa gra`/`Kontynuuj` cycle — open a new one instead. This is cheap; sessions are just separate `user-data-dir`s.

```bash
agent-browser --session bench1 open "http://localhost:5577/?seed=42&res=193"
```

If you do land on the menu unexpectedly, don't fight it — `agent-browser --session <name> close` cleanly kills even a fully CDP-unresponsive tab, then open a fresh session.

## Pitfall 2 — `eval` has no `--timeout` flag; CDP itself caps around 25–30s

`agent-browser eval --help` lists no `--timeout` option (only `--base64`/`--stdin`/`--json`/`--session`). Passing one anyway is silently ignored. The underlying CDP `Runtime.evaluate` call has its own internal cap (observed ~25–30s) regardless. `window.__seedvaleRunBenchmark(id, 30)` takes 30s **plus** a ~1s settle plus isolation-probe time — awaiting it directly inside one `eval` call reliably fails:

```
✗ CDP command timed out: Runtime.evaluate
```

**This does not mean the benchmark failed** — the promise keeps running in the page even though the CLI gave up waiting for the CDP response. That's what makes this pitfall dangerous: it looks like an error, but the JS side effect (the in-flight run) is real and will collide with whatever you try next (see Pitfall 3).

**Fix — fire-and-forget + poll, never a single blocking `await`:**

```bash
cat <<'EOF' > /tmp/bench-start.js
window.__benchResult = undefined;
window.__benchRunning = true;
window.__seedvaleRunBenchmark('current', 30).then((r) => {
  window.__benchResult = r;
  window.__benchRunning = false;
}).catch((e) => {
  window.__benchResult = { error: String(e) };
  window.__benchRunning = false;
});
'started';
EOF
agent-browser --session bench1 eval --stdin < /tmp/bench-start.js   # returns "started" immediately
```

Poll for completion via **Bash `run_in_background`** (an `until` loop with `sleep`, per the harness's own sleep-loop rules — don't hand-poll with repeated foreground tool calls, and don't chain short `sleep`s yourself):

```bash
until timeout 15 agent-browser --session bench1 eval "window.__benchRunning === false" 2>/dev/null | grep -q true; do sleep 4; done; echo BENCH_DONE
```

Then fetch the stashed result in a second, fast `eval`:

```bash
agent-browser --session bench1 eval "window.__benchResult"
```

## Pitfall 3 — reentrancy: a second call while one is outstanding resolves to `null`, silently

`createBenchmarkRunner` (`src/perf/benchmark.ts`) guards with a synchronous `inFlight` flag — `run()` returns `null` immediately if a benchmark is already running, no error, no warning. Combined with Pitfall 2, this is a trap: if your first attempt was a blocking `eval` that hit the CDP timeout, the *actual* browser-side run may still be in flight. If you then fire a **second** `__seedvaleRunBenchmark(...)` call (even fire-and-forget), that second call's promise resolves to `null` almost instantly — and it's easy to mistake that fast `null` resolution for "the benchmark finished quickly" rather than "this call was rejected because another one was already running."

**Fix:**
- Never issue a second `__seedvaleRunBenchmark` call without first confirming the previous one is done (poll `window.__benchRunning`, or check `window.__seedvalePerfLastReport`/`__seedvalePerfReports.length` as a durable side-channel that's set regardless of which call actually awaited the promise).
- If a CDP timeout happens mid-benchmark, don't retry immediately — either poll the side-channel to see if the original run is still progressing, or just do a full page reload (`agent-browser open` again, fresh navigation) to hard-reset all JS module state before starting over. A full navigation is the only thing that reliably clears `inFlight`.

## Pitfall 4 — don't run two benchmark sessions concurrently

Already documented once, in plan 143's implementation notes: an initial pass running before/after in two tabs at the same time produced unusable numbers (GPU/CPU contention — a solo "before" run at ~60 fps measured ~37 fps when a second tab was benchmarking at the same time). **One `agent-browser` benchmark run at a time, always**, even when you have two dev servers (before/after) up simultaneously. It's fine for both dev servers to be running; just don't have both pages actively executing `__seedvaleRunBenchmark` at once.

## Before/after methodology (isolating one change)

1. `git worktree add <scratch-path> <baseline-commit>` — check out the pre-change commit into a separate directory. Don't touch the main working tree.
2. `ln -s <main-repo>/node_modules <scratch-path>/node_modules` — safe **only if** `package.json`/the lockfile are unchanged between the two commits (verify with `git diff <baseline>..HEAD -- package.json pnpm-lock.yaml` or equivalent first). If they differ, do a real `npm install` in the worktree instead.
3. `PORT=<other-port> npm run dev` in the worktree (background it) — `vite.config.ts` reads `PORT` and uses `strictPort: true`, so pick a free port explicitly rather than letting Vite fall back silently.
4. Benchmark each server **solo** (Pitfall 4), same scenario id, same `seed`/`res` URL params, same `durationSec`.
5. Compare `scene.<bucket>` triangle/draw-call counts (the bucket your change actually touches) plus the whole-scene `fps`/`frameTime`/`RENDER` numbers — a bucket-level win can be swamped by unrelated buckets in the whole-scene totals (see plan 143's notes for a worked example: vegetation/environment draw calls dropped 18–21% with the whole-scene draw-call total barely moving, because grass/settlement/mirror dominate the total).
6. Tear down the worktree (`git worktree remove <scratch-path>`) and stop the extra dev server once done — it's scratch state, not something to leave behind for the next session.

## Quick reference — what actually worked in this session

```bash
# Fresh session, land straight in-world:
agent-browser --session b1 open "http://localhost:5577/?seed=42&res=193"
agent-browser --session b1 eval "window.__seedvaleReady === true"   # poll a few times, spaced out; don't trust `wait --fn` blindly here

# Fire-and-forget a run:
agent-browser --session b1 eval --stdin < /tmp/bench-start.js

# Poll (backgrounded, not hand-looped):
until timeout 15 agent-browser --session b1 eval "window.__benchRunning === false" 2>/dev/null | grep -q true; do sleep 4; done; echo BENCH_DONE

# Fetch result:
agent-browser --session b1 eval "window.__benchResult"

# Recover a hung tab:
agent-browser --session b1 close
```
