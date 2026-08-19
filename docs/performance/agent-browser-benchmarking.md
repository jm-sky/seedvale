# Running Seedvale's `?benchmark=` harness with `agent-browser`

**Status:** operational guide, not a performance result. Written after a session (2026-08-17, plan 148) that hit several real `agent-browser` pitfalls against this specific app — headless Chrome + SwiftShader + a heavy Three.js scene is a rougher environment than most `agent-browser` targets. Read this before running a benchmark; it will save you several failed turns.

Pitfalls **1–5** are `agent-browser` / headless-Chrome specific. Pitfalls **6–8** are **harness-level** (IndexedDB save, in-game clock, `stream` hitch) and apply equally to the Cursor IDE browser used for real-GPU reviews (021–024).

See also: `src/perf/benchmark.ts` / `benchmarkScenarios.ts` / `types.ts` (the harness itself) and plan 143's implementation notes (`docs/plans/archive/2026-08-17--143--cross-chunk-vegetation-batching-implementation-notes.md`, "Benchmark:" section) for a worked before/after example with a results table.

## Load the skill first

```bash
agent-browser skills get core
```

Don't guess at CLI flags — `agent-browser eval --help` etc. are cheap to check and this app's harness has already broken assumptions once (see "No `--timeout` flag on `eval`" below).

## The app's benchmark API

`?benchmark=<id>` **does** auto-start once the world is up (`createApp.ts` calls `benchmark.run(autoBench)`). That path is also **unattended**: `src/main.ts` skips the Kontynuuj / Nowa gra menu and continues the IndexedDB save if one exists for this origin (see Pitfall 6). You can still start a run by hand after load:

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

`?benchmark=` / `?perf=1` skip this menu on purpose (unattended continue). That avoids the hang, but it **silently continues** the previous save — including time of day (Pitfall 6).

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

Already documented once, in plan 143's implementation notes: an initial pass running before/after in two tabs at the same time produced unusable numbers (GPU/CPU contention — a solo "before" run at ~60 fps measured ~37 fps when a second tab was benchmarking at the same time). **One benchmark page at a time, always** — that includes Cursor IDE browser **and** `agent-browser`. Two tabs at `?benchmark=stream` (or one Cursor tab plus one `agent-browser` session) will fight for the same Intel GPU and the numbers are not usable.

It is fine for several Vite `PORT=` servers to be **listening**. Review 024 started `:5592` while `:5591` was still finishing a run so the next origin would be ready — that is only safe if **no other tab is loaded on the new origin**. `?benchmark=` auto-starts as soon as a page hits that URL, so opening the next port in a second tab (or leaving review 023's `:5588` tab in the background) is the same bug as two concurrent runs.

**Fix:**
- One visible/automation tab. Navigate it to the next origin only after `__seedvalePerfLastReport` is present (or the previous run's `inFlight` is clear).
- Extra `npm run dev` processes in the background are OK. Extra **pages** are not.
- Before a real-GPU series, check there isn't a leftover Seedvale tab from the previous review still animating.

## Pitfall 5 — each `--session <name>` spins up a whole new Chrome process; orphaned ones will bring the host down

This is the one that actually cost the most time in practice — more than Pitfalls 1–4 combined. Every new `--session <name>` you haven't used before launches a **full new headless Chrome instance** (its own `user-data-dir`, its own zygote/gpu-process/renderer tree — `pgrep -af "agent-browser/browsers"` shows ~18-19 OS processes per instance). If you follow "use a fresh session to skip the start menu" (Pitfall 1) repeatedly without closing the previous one first, you accumulate multiple full Chrome instances, each running this app's heavy Three.js scene under software rendering. Three orphaned instances (from three `--session` calls in one session, none explicitly closed) drove the host to **load average >6, <250 MB free RAM**, and turned a nominally-30s benchmark into a 4-minute stall — every subsequent `eval` call, even trivial ones, started timing out, which looks exactly like a hung tab (Pitfall 1/2) but is actually **system-wide resource starvation**, not a per-tab issue.

**Fix:**
- Before opening a new `--session`, close the previous one: `agent-browser --session <old-name> close`.
- If you're not sure what's still running, check directly rather than guessing: `pgrep -af "agent-browser/browsers"` (each instance's processes share one `user-data-dir` path in their args, so you can tell instances apart) and `free -m` / `uptime` for overall host health. A load average spike alongside `eval`/`wait` calls suddenly all timing out (including trivial ones) is this problem, not a hang in the page itself — investigate host resources before spending more turns retrying browser commands.
- Prefer **reusing one session across a full page reload** (`agent-browser open <url>` again, same session/tab) over minting a new named session per navigation — a reload resets the page's JS module state (clears `inFlight`, etc., see Pitfall 3) without spawning a new OS process, and only revisits Pitfall 1's menu screen if that *specific* origin already has a save (a different port/origin is a different profile-storage bucket, so switching between two dev-server ports on the same session doesn't reintroduce the menu).
- If things do go sideways, recover with `pkill -9 -f "agent-browser/browsers"` (kills every agent-browser Chrome instance) rather than trying to close sessions individually while the host is already struggling to respond.

## Pitfall 6 — Continue drifts in-game time, weather, and lighting between runs

Unattended `?benchmark=stream&seed=42` on an origin that already has a save **continues** that save. `seed`/`res` in the URL apply on **New Game only**. The persisted fields that keep moving are `timeOfDay` and `elapsedDays`.

Default `dayLengthSec` is **480** (`src/world/dayNight.ts`) — eight real minutes per in-game day. A 30 s `stream` sprint is ~1.5 in-game hours, plus hitch stalls (real `dt` still advances the clock). Three cold reloads on the same origin easily walk morning → afternoon → night. Season/weather are a pure function of `(worldSeed, elapsedDays)` (`src/world/weather.ts`), so the later runs are not the same climate either.

This is fatal for lighting comparisons. House lamps stay in the scene at `intensity === 0` during the day; at night they light up. Review 024 (plan 149) started budget-8 on the baseline origin and screenshotted **22:47 / noc** with 9 of 17 point lights culled — not comparable to the 09:31 daytime baseline. Overflow counts also grew 15 → 21 as the clock advanced.

**Fix:**
- One **unused port / origin per variant** (not just per machine). `:5577` / `:5588` / `:5590` are separate IndexedDB buckets. Reviews 021–024 already do this to avoid save leak; it also resets the clock.
- Confirm the HUD clock (`09:31 dzień` vs `22:47 noc`) on the first screenshot of every variant. If it is not morning, you continued someone else's save — pick a new port and redo New Game.
- Runs 2–3 of the *same* variant may still drift ~1.5 h each. For lighting/weather-sensitive work that is usually acceptable within a variant; it is **not** acceptable across baseline vs pin vs budget-8.
- `?benchmark=night` forces `timeOfDay = 0.05` for that run only, then restores the saved clock in `finally`. It does not freeze the world clock for later `stream` runs.

## Pitfall 7 — hitch-starved first runs eat the 30 s session

On a cold WebGL context, frame 0 of `stream` can spend **0.3 s–6 s** (sometimes more) compiling the first ~52 programs. That stall is **inside** the 30 s `beginSession()` window. A 5 s mirror hitch leaves ~25 s of sprint and a report whose FPS/RENDER/`frameTime.max` look nothing like runs 2–3. Review 021 run 1 (97 game frames, census hitch 5970 ms vs report max 409 ms) and review 024 budget-12 run 1 (FPS 7.3, RENDER 70, frame-0 mirror 4847 ms) are this class.

**Fix:** always do ≥3 cold reloads. Treat a run with FPS avg ≲10 or census `max hitch` ≫ report `frameTime.max` as hitch-starved — keep it for the hitch story, **do not** median it into RENDER/p95. Report `frameTime.max` can understate a census stage hitch that landed outside `beginSession()` (settle) or that the monitor sampled differently; quote both.

## Pitfall 8 — viewport emulation does not survive reload

Cursor-browser real-GPU protocol uses `Emulation.setDeviceMetricsOverride` → 1068×906, `deviceScaleFactor=1` so High/`pixelRatioCap` still reports `pixelRatio=1`. A `browser_navigate` / reload **drops** that override. Re-apply it after every cold load, then confirm `canvas.width/height` and `devicePixelRatio` before trusting the report's `context.pixelRatio`.

## Before/after methodology (isolating one change)

1. `git worktree add <scratch-path> <baseline-commit>` — check out the pre-change commit into a separate directory. Don't touch the main working tree.
2. `ln -s <main-repo>/node_modules <scratch-path>/node_modules` — safe **only if** `package.json`/the lockfile are unchanged between the two commits (verify with `git diff <baseline>..HEAD -- package.json pnpm-lock.yaml` or equivalent first). If they differ, do a real `npm install` in the worktree instead.
3. `PORT=<other-port> npm run dev` in the worktree (background it) — `vite.config.ts` reads `PORT` and uses `strictPort: true`, so pick a free port explicitly rather than letting Vite fall back silently.
4. Benchmark each server **solo** (Pitfall 4), same scenario id, same `seed`/`res` URL params, same `durationSec`. For lighting / weather / day-night work, also use a **fresh origin per variant** (Pitfall 6) and re-apply viewport emulation after every reload (Pitfall 8).
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
