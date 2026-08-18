# Implementation notes — plan 040 (Pory roku i pogoda)

Covers §24 Etap 1 (Climate foundation), Etap 2 (day/night integration) and Etap 3 (GPU weather rendering — 2026-08-15, closes the earlier CPU-particle deviation). Etap 4's debug/override piece and Etap 5's benchmark pass are partly and not-at-all done respectively — see per-etap notes below.

**Revision note:** an earlier version of this implementation used a stateful `Math.random()`-driven transition machine and a `SaveData` v14 `weather` field. While that was being built, the plan itself was rewritten upstream to be strictly deterministic and explicitly no-save-field. This note (and the code) reflect the reworked, plan-conformant version — the save schema is back at v13, untouched.

## Etap 1 — Climate foundation (done)

- `src/world/weather.ts` — `Season`, `WeatherType`, `WeatherState { type, intensity, temperature, startedAt, endsAt }`, `WorldClimateState { season, seasonProgress, weather }`, matching the plan's §4/§5/§6 type shapes exactly.
- `getSeason(elapsedDays)` / `getSeasonProgress(elapsedDays)` — pure functions, `DAYS_PER_SEASON = 7` (plan §4 default).
- `computeWeather(seed, elapsedDays, season)` / `computeClimate(seed, elapsedDays)` — pure functions per plan §7. Weather is bucketed into fixed-length `WEATHER_CYCLE_DAYS = 0.3` "cycles"; a Wang-style integer hash of `(seed, cycleIndex, salt)` (same technique as `terrain/worleyNoise.ts`'s private `hash01`, reimplemented locally) picks the weighted type + intensity for that cycle — no simulation/replay needed for any `elapsedDays`, including a large time-skip jump or a fresh load.
- Per-season weighted odds (plan §8) and deterministic temperature (plan §9, season + weather only for now — no time-of-day/variation term yet, kept in one place: `temperatureFor`).
- Unit tests: `world/weather.test.ts` — purity (same inputs → same output), cross-cycle stability, cross-seed variation, season-weight exclusions (no snow in summer), `tickClimate` time-skip/forced-override behaviour.

## Etap 2 — day/night integration (done, partial)

- `src/world/weatherVisuals.ts`'s `applyWeatherOverlay` dims sun/ambient/hemi intensity and shrinks/tints fog color/near/far, blended by `weather.intensity`, applied inside `gameLoop.ts`'s `applyDayNight()` on top of (not instead of) the existing day/night result.
- `dayFactor`/`elev` and the `Sky` dome material are deliberately left untouched — no cloud geometry exists yet (`docs/STATE.md` still lists clouds as not implemented per plan §15's "volumetric clouds pozostają poza zakresem"), so "cloudy" reads as dimmer light + hazier fog rather than visible clouds.
- `gameLoop.ts`'s `tick()` calls `tickClimate(climate, getSeed(), dayNight.elapsedDays)` right after `tickDayNight()`. `resyncDayNight()` (pushes fog/light to the scene) fires both on the existing day/night time threshold and when weather visually changed (type or intensity delta ≥ 0.03) — otherwise weather-driven fog would only "pop" in on the next unrelated threshold crossing.

## Etap 3 — GPU weather renderer (done, 2026-08-15)

- `src/world/weatherParticles.ts` rewritten from CPU `THREE.Points` (manual per-particle `BufferAttribute` updates every frame) to a GPU-driven renderer, closing the deviation from plan §2/§11-13. Public API (`createWeatherParticles`, `addTo`/`update`/`dispose`) is unchanged in shape; `weather.ts`/`weatherVisuals.ts` are untouched, `gameLoop.ts`'s only change is passing `camera.fov`/`renderer.domElement.clientHeight` through to `update()` for correct point-size perspective attenuation (a plain `ShaderMaterial` doesn't get that from the renderer the way `PointsMaterial` does).
- One shared vertex/fragment shader for both rain and snow (per §13's "wspólny shader z parametrem", simpler than two divergent shaders here). Per-particle `position` (local offset in the volume) and a 4-float `aRandom` (phase, fall-speed multiplier, size multiplier, draw-order slot) are generated once with `Math.random()` at emitter creation and never touched again — all movement is a pure function of `(aRandom, uTime, weather-derived uniforms)` in the vertex shader, satisfying §25's "brak aktualizacji pojedynczych kropli/płatków" and "brak per-frame alokacji": JS only sets a handful of uniforms (`uTime`, `uSizeScale`, `uVisibleFraction`, `uOpacity`) and moves the `Points` container to the player position each frame. Rain uses `uWidthFrac = 0.35` so drops read as thin streaks; snow stays `1` (full square sprite — GRAPHICS G13).
- Density (weather intensity) and a device-quality cap (`WorldConfig.quality.lodScale`, plan 103) both gate visibility via a single `uVisibleFraction` uniform compared against each particle's fixed `aRandom.w` slot in the vertex shader — particles beyond the cutoff are pushed outside the clip volume (`gl_Position` trick) rather than looping/reallocating on the CPU. This is the "sensible caps… reuse existing graphics settings" mobile requirement — no second quality system introduced.
- "Wind" stays the same bounded sinusoidal sway (`uDrift`) the CPU version used — deliberately **not** a new `WeatherState` field; the plan for this GPU migration explicitly forbids touching `ClimateState`/`computeWeather`.
- Fog integration still reuses the existing `THREE.Fog` (plan §14) via the same `UniformsLib.fog` + `fog_pars_vertex/fragment` + `fog_vertex/fragment` chunk pattern `waterMaterial.ts` already established — no parallel fog system, no manual per-frame fog-uniform copying (the renderer does that for any `fog: true` material).
- `src/audio/weatherSounds.ts` is unchanged — one shared rain loop (`ambient-rain-loop-01`), gain = rain intensity. No snow ambience asset exists (`docs/assets/SOUNDS.md` S21, status `needed`) — snow stays visual-only.
- **Not done / open**: no `?benchmark=` pass exists for weather specifically (see Etap 5 below — this was already open before this change and remains open). The architectural claim — replacing a per-frame CPU loop over up to 1400 particles (trig + branches) with ~4 uniform writes — is not backed by a measured before/after number in this session; do not treat it as benchmarked.

## Etap 4 — debug + time/save verification (partial)

- lil-gui "Pora roku / Pogoda" folder (`createDebugGui.ts`) — read-only season/weather-type/intensity/temperature (`.listen()` via getter-wrapper objects, since `tickClimate` replaces `climate.weather` wholesale on cycle boundaries rather than mutating it in place — binding lil-gui directly to `climate.weather`'s fields would go stale after the first replacement), plus a `climate.forced` dropdown to override weather for testing without waiting. `tickClimate` detects the forced↔auto edge and recomputes immediately rather than waiting for the next natural cycle boundary.
- Time-skip: `elapsedDays` already races ahead correctly during a skip (existing `timeSkip.ts` behaviour, untouched); `tickClimate`'s cycle-boundary check (`elapsedDays < startedAt || >= endsAt`) means a jump of any size just re-derives the correct weather directly — no replay loop, verified in `weather.test.ts`'s "re-derives the same weather after a large elapsedDays jump" case.
- Save/load: **no new save field** (plan §19) — `climate` is constructed fresh each `createApp()` call from `(config.seed, dayNight.elapsedDays)`, both of which already persist. `SaveData` stays at v13, untouched.
- Not done: no on-screen "Remaining: X days" readout (plan §23's exact debug text isn't reproduced verbatim, only season/type/intensity/temperature + override).

## Etap 5 — performance verification (not done)

- No `?benchmark=` pass comparing clear/rain/snow/fog frame cost, no draw-call/GC measurement, on either the old CPU implementation or the new GPU one. Etap 3 now removes the per-particle CPU loop the plan's performance section (§2/§25) was skeptical of, but that is an architectural argument, not a measured result — treat the actual FPS/CPU/GPU frame-time delta as unverified until someone runs it in a browser (desktop and mobile, rain/snow at low and high intensity, weather disabled) with `?perf=1` / the Performance debug panel.

## Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` all green (2026-08-15 GPU weather rewrite included). New/updated unit tests: `world/weather.test.ts` (rewritten for the deterministic API), `world/weatherVisuals.test.ts`. `weatherParticles.ts` has no unit tests (Three.js/GPU integration, consistent with this repo's existing test coverage split — see `CLAUDE.md`).

No browser/manual verification of the 2026-08-15 GPU rewrite. Rain/snow visuals, fog/light dimming, player-following volume, day/night, and the rain audio loop should be checked in a running `npm run dev` session (force weather via the lil-gui "Pora roku / Pogoda" → "Wymuś pogodę" dropdown, or Pauza → Świat, to see each state without waiting for a natural transition): confirm rain/snow still look and move like before, confirm switching rain↔snow↔clear doesn't leak particles or throw WebGL/shader console errors, and confirm a world rebuild (new seed) doesn't leave the old emitters attached or GPU resources undisposed. The Etap 5 performance pass above is still open.
