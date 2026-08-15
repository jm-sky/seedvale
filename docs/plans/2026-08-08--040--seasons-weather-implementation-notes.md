# Implementation notes — plan 040 (Pory roku i pogoda)

Covers §24 Etap 1 (Climate foundation) plus a slice of Etap 2 (day/night integration) and a stopgap slice of Etap 3 (weather rendering — CPU, not the plan's preferred GPU shader; see deviation below). Etap 4's debug/override piece and Etap 5's benchmark pass are partly and not-at-all done respectively — see per-etap notes below.

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

## Etap 3 — weather rendering (done, with a known deviation)

- `src/world/weatherParticles.ts` — rain/snow via CPU `THREE.Points` (manual `BufferAttribute` updates, same pattern as `shared/getFireParticles.ts`, scaled to a box volume around the player).
- **Deviation from plan §2/§11-13**: the plan's preferred technique is GPU shader-based weather (procedural per-fragment rain/snow, uniform-driven, no CPU-side per-particle updates); `THREE.Points`/CPU is explicitly the fallback ("może być użyty tylko wtedy, gdy okaże się prostszy lub wizualnie wyraźnie lepszy przy akceptowalnym koszcie"). This was kept as an Etap 1-ish stopgap so weather is visible at all without first building shader infrastructure — it is **not** validated against that "acceptable cost" bar (no `?benchmark=` pass, see Etap 5 below). A GPU rain/snow shader (`WeatherRenderer` per plan §13) is open follow-up work, not implemented.
- Fog integration reuses the existing `THREE.Fog` (plan §14) — no parallel fog system.
- `src/audio/weatherSounds.ts` — one shared rain loop (`ambient-rain-loop-01`, already in repo), gain = rain intensity, same lazy-create pattern as `fireSounds.ts::createFireAudio`. No snow ambience asset exists (`docs/assets/SOUNDS.md` S21, status `needed`) — snow stays visual-only.

## Etap 4 — debug + time/save verification (partial)

- lil-gui "Pora roku / Pogoda" folder (`createDebugGui.ts`) — read-only season/weather-type/intensity/temperature (`.listen()` via getter-wrapper objects, since `tickClimate` replaces `climate.weather` wholesale on cycle boundaries rather than mutating it in place — binding lil-gui directly to `climate.weather`'s fields would go stale after the first replacement), plus a `climate.forced` dropdown to override weather for testing without waiting. `tickClimate` detects the forced↔auto edge and recomputes immediately rather than waiting for the next natural cycle boundary.
- Time-skip: `elapsedDays` already races ahead correctly during a skip (existing `timeSkip.ts` behaviour, untouched); `tickClimate`'s cycle-boundary check (`elapsedDays < startedAt || >= endsAt`) means a jump of any size just re-derives the correct weather directly — no replay loop, verified in `weather.test.ts`'s "re-derives the same weather after a large elapsedDays jump" case.
- Save/load: **no new save field** (plan §19) — `climate` is constructed fresh each `createApp()` call from `(config.seed, dayNight.elapsedDays)`, both of which already persist. `SaveData` stays at v13, untouched.
- Not done: no on-screen "Remaining: X days" readout (plan §23's exact debug text isn't reproduced verbatim, only season/type/intensity/temperature + override).

## Etap 5 — performance verification (not done)

- No `?benchmark=` pass comparing clear/rain/snow/fog frame cost, no draw-call/GC measurement. This matters more than usual here because Etap 3's CPU-particle stopgap is exactly the technique the plan's performance section (§2/§25) is skeptical of — this should be the first thing checked before relying on the current rain/snow visuals under load.

## Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` all green. New/updated unit tests: `world/weather.test.ts` (rewritten for the deterministic API), `world/weatherVisuals.test.ts`. No browser/manual verification — rain/snow visuals, fog/light dimming and the rain loop should be checked in a running `npm run dev` session (force weather via the lil-gui "Pora roku / Pogoda" → "Wymuś pogodę" dropdown to see each state without waiting for a natural transition), and the Etap 5 performance pass above is still open.
