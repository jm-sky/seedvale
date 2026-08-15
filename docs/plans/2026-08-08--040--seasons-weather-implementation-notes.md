# Implementation notes — plan 040 (Pory roku i pogoda)

Scope: **Etap 1 only** (§14 of the plan — "Sezony i pogoda jako efekt wizualny"). Etap 2–5 (AI/NPC/resource/economy coupling) are explicitly out of scope for this pass; nothing in Etap 1 wires weather into fauna, NPC needs, resources or the FSM.

## What exists now

- `src/world/weather.ts` — `Season`/`Weather` types, `seasonFromElapsedDays()` (pure derivation from `DayNightState.elapsedDays`, `DAYS_PER_SEASON = 3` real-time days per season — no separate clock, per plan §12), `WeatherState` (plain mutable struct, mirrors `DayNightState`'s shape) and `tickWeather()` (weighted per-season transitions via `pickWeightedWeather()`, duration measured in `elapsedDays` so it survives time-skip correctly — same convention as `treeLifecycle.ts`'s `stageStartedAt`). `WeatherState.forced` is a debug-only override (lil-gui), not persisted, mirroring `DayNightState.enabled`/`timeMultiplier`.
- `src/world/weatherVisuals.ts` — pure `applyWeatherOverlay()`: dims sun/ambient/hemi intensity and shrinks/tints fog color/near/far, blended by `weather.intensity`. Applied inside `gameLoop.ts`'s `applyDayNight()`, on top of (not instead of) the existing day/night result. `dayFactor`/`elev` and the `Sky` dome material are deliberately left untouched — no cloud geometry exists yet (`docs/STATE.md` still lists clouds as not implemented), so "cloudy" reads as dimmer light + hazier fog rather than visible clouds. This is an intentional Etap 1 simplification, not an oversight.
- `src/world/weatherParticles.ts` — rain/snow `THREE.Points` volumes that recenter on the player every frame (`shared/getFireParticles.ts`'s manual-`BufferAttribute` pattern, scaled to a box volume instead of one fire's local shower).
- `src/audio/weatherSounds.ts` — one shared rain loop (`audio-rain-loop-01`, already in repo), gain = rain intensity, same lazy-create pattern as `fireSounds.ts::createFireAudio`. No snow ambience asset exists (`docs/assets/SOUNDS.md` S21, status `needed`) — snow stays visual-only.
- lil-gui "Pora roku / Pogoda" folder (`createDebugGui.ts`) — read-only season/weather/intensity/temperature (`.listen()`), plus a `forced` dropdown to override weather for testing without waiting.
- `SaveData` v13 → **v14** (`persistence/saveData.ts`): adds `weather: SaveWeather` (`type`/`intensity`/`temperature`/`startedAt`/`duration`; `forced` is not persisted). Full migration chain updated (`toV14`, `isSaveDataV14`, every `loadSaveData` branch).

## Wiring

`gameLoop.ts`'s `tick()` calls `tickWeather()` right after `tickDayNight()`, gated the same way (inside the same modal/pause check). `resyncDayNight()` (which pushes fog/light to the scene) now also fires when weather visually changed (type or intensity delta ≥ 0.03), not just on the existing day/night time threshold — otherwise weather-driven fog would only "pop" in on the next unrelated threshold crossing.

## Deliberate simplifications / open follow-ups

- No literal cloud geometry/dome material — see above.
- Snow has no ambience asset yet (SOUNDS.md S21).
- `DAYS_PER_SEASON = 3` is a rough first tuning; no gameplay system depends on the exact value yet, so it's free to retune.
- Rain/snow particles are a single global box volume around the player, not occlusion-aware (fall through roofs/canopy) — acceptable for Etap 1's "world looks/sounds different" bar; revisit if it reads badly under a house roof.
- Etap 2 (weather → NPC/fauna behaviour) and Etap 3 (season → resources/food sources, plan 032) are unimplemented — `WeatherState`/`seasonFromElapsedDays()` are ready to be read by those systems but nothing calls them yet outside the visual/audio layer above.

## Verification

`npx tsc --noEmit`, `npm run lint`, `npm run build`, `npm run test` all green (new unit tests: `world/weather.test.ts`, `world/weatherVisuals.test.ts`; existing `persistence/saveData.test.ts` updated for v14). No browser/manual verification yet — rain/snow visuals, fog/light dimming and the rain loop should be checked in a running `npm run dev` session (force weather via the lil-gui "Pora roku / Pogoda" → "Wymuś pogodę" dropdown to see each state without waiting for a natural transition).
