# UX Review: Interactions & Targeting

**Reviewed:** 2026-09-10  
**Model:** ChatGPT — GPT-5.6 Sol  
**Scope:** focused code recon/review; no implementation; no browser verification.

## Executive summary

The interaction architecture has a good shared foundation: `Interactable` is the per-frame adapter, `buildInteractables()` gathers candidates, `pickInGaze()` performs generic gaze acquisition, `gameLoop.ts` owns input/action dispatch, and `WorldInspection` derives read models from stable target refs. The main UX problem is no longer lack of infrastructure; it is that the infrastructure exposes inconsistent semantics as features accumulated.

The highest-value correction is to make the interaction prompt an explicit description of **target + available actions + unavailable reasons**, instead of a free-form `promptLabel` string plus a large `kind` switch. Do this by extending the existing interaction seam, not by creating another targeting/action system.

No P0 blocker was found from code recon. The review found 5 P1 issues, 5 P2 issues and 2 P3 issues.

## P1 — confusing

### 1. Target selection has no semantic priority and can choose a less useful overlapping object

**UX problem:** `pickInGaze()` selects only by highest facing dot. Distance is not a tie-breaker and target kind/actionability has no weight. In a dense settlement/camp, a tree, item, bedroll, container, NPC, buildable, corpse, etc. can compete solely by angular centering. The player can therefore look at an apparent foreground/useful object while another nearly collinear candidate wins.

**Affected:** `src/interaction/findInteractionTarget.ts`, `src/app/interactables.ts`, `src/app/gameLoop.ts`.

**Recommendation:** keep one picker, but introduce deterministic ranking after eligibility: centeredness first with a small tolerance, then interaction priority/actionability and distance as tie-breakers. Do not add per-system raycasts. Make priority explicit data/policy, not dependent on candidate insertion order.

### 2. Target cycling is based on all objects within 2.5 m, not the visible/gaze candidate set

**UX problem:** normal `[Tab]` cycling uses every `Interactable` within `INTERACT_RANGE`, including targets behind or beside the player. The prompt can suddenly switch to an object the player cannot visually associate with the selection. `cycleCandidates` also preserves source/build order rather than a spatially meaningful order.

Combat makes this more complex: `[Tab]` cycles living targets and `[Shift+Tab]` cycles world targets. Mobile exposes only one cycle button, with no Shift-equivalent world-cycle action.

**Affected:** `src/app/gameLoop.ts`, `src/player/playerCombat.ts`, `src/ui-vue/screens/TouchChrome.vue`.

**Recommendation:** define one shared ordered `InteractionTargetSet`/ranking result for current context. Normal cycling should use plausible visible/near targets in deterministic spatial order. Combat can keep living/world categories, but mobile must have an equivalent way to reach both categories or the distinction should be removed from the UX.

### 3. `[E]`, `[R]` and `[V]` do not have stable conceptual meanings

**UX problem:** `[E]` ranges from use/open/work/attack/sleep/inspect/destroy/buy/talk; `[R]` ranges from inspect/pickup/fill/cook/bait/burn/water/remove/cancel; `[V]` is a rich details/inspection screen but only for five construction target kinds. This makes the controls memorization-based rather than predictable.

Representative inconsistency: tent uses `[E] Odpocznij · [R] Zbadaj`; bedroll/platform use `[E] Zbadaj`; construction objects use `[V] Sprawdź`. Thus three different input semantics represent variants of inspection/details.

**Affected:** `src/app/interactables.ts`, `src/app/gameLoop.ts`, `src/app/inspection/inspectionTarget.ts`.

**Recommendation:** establish a semantic contract:

- `E` = primary/use action,
- `R` = secondary contextual action,
- `V` / Inspect = details/status for any target that has meaningful persistent detail.

Move camp-equipment details toward the same inspect seam where practical. `R` should not be the generic inspection key if `V` already owns that concept.

### 4. Action availability is encoded inconsistently: hidden, flavor-only, optimistic prompt, or disabled action

**UX problem:** some candidates disappear when unavailable; some remain with non-action text (`Suszy się…`, `Spalony ul`, ocean water); some advertise an action and fail only after input; some open `FlavorDialog` with disabled actions and `reasonLabel`. The player cannot learn one rule for interpreting prompts.

Examples include water/campfire prompts intentionally advertising actions regardless of inventory, while well repair and inspection actions can expose disabled reasons. The architecture already supports `enabled + reasonLabel`, but only selected flows use it.

**Affected:** `src/app/interactables.ts`, `src/app/gameLoop.ts`, `src/ui-vue/screens/FlavorDialog.vue`, `src/app/inspection/buildWorldInspection.ts`.

**Recommendation:** extend the existing application-layer interaction presentation contract so each target can expose actions as `{ input, label, enabled, reasonLabel }`. Keep execution revalidation. Prompts should distinguish available from blocked actions before the player presses the key whenever the reason is knowable.

### 5. `WorldInspection` is structurally good but artificially limited to construction targets

**UX problem:** `[V] Sprawdź` is discoverable only for palisade, player well, residential building, standing torch and terrain preparation. Other objects with meaningful state — tent/bedroll/platform, trap, container, owned animal, cart, drying rack, hive, settlement storage, potentially corpse — use bespoke E/R dialogs or have no detail surface. The user cannot infer what Inspect applies to.

**Affected:** `src/app/inspection/inspectionTarget.ts`, `src/app/inspection/buildWorldInspection.ts`, `src/app/gameLoop.ts`.

**Recommendation:** retain `WorldInspection` as the shared read-model seam and broaden it incrementally to stateful world targets. Do not make Vue switch on `Interactable.kind`; add stable refs + application/domain read models per useful target. Start with camp equipment because it currently demonstrates the E/R/V inconsistency most clearly.

## P2 — friction

### 6. Prompts are free-form strings and key rendering is inferred from string syntax

`FlavorDialog.vue` prepends `[E]` when the prompt does not start with `[`. This means input semantics partly depend on text formatting. `promptLabel` values mix explicit `[E]/[R]` tokens with bare verbs such as `Atakuj`, `Kup działkę`, `Obejrzyj drzewo`, and flavor-only status text.

**Recommendation:** stop treating the prompt string as an action model. Preserve `promptLabel` temporarily for compatibility, but derive presentation from structured action descriptors and let Vue render input badges consistently.

### 7. Mobile always shows E and R even when the current target has no corresponding action

`TouchChrome.vue` conditionally shows Inspect and Cycle, but E and R are permanently visible whenever touch chrome is active. This is especially misleading for flavor-only/status targets and single-action targets. The desktop prompt can communicate only E, while mobile still presents R as apparently valid.

**Recommendation:** expose `primaryAvailable` / `alternateAvailable` (preferably the structured actions above) to touch chrome. Disable or hide R when there is no alternate action; optionally disable E when no target/action exists. Keep combat press/release semantics for E.

### 8. Gaze highlight and actual interaction target can describe different things

Agents receive a wider `GAZE_RANGE` highlight, while actionable selection uses `INTERACT_RANGE`; `setHighlight(interactableAgent(target) ?? gazed?.agent)` can therefore highlight an NPC/animal that is not the actionable target when the real selected target is a non-agent. The approaching cue is intentional, but in overlaps it can visually imply that the highlighted agent owns the prompt.

**Affected:** `src/app/gameLoop.ts`, `src/app/interactables.ts`.

**Recommendation:** visually distinguish `selected/actionable` from `nearby/gazed`. The strongest highlight should always belong to the actual selected target. If only agents support world highlight today, avoid showing an agent as selected when a different non-agent target owns the prompt.

### 9. Interaction resolution is split across a generic resolver and a very large dispatch switch

This is primarily an architecture/maintenance issue, but it leaks into UX because each new `kind` can independently choose prompt conventions, errors, dialogs and key semantics. `resolveInteraction.ts` now excludes a long list of kinds because most gameplay actions need dependencies owned by `gameLoop.ts`/application actions.

**Affected:** `src/interaction/resolveInteraction.ts`, `src/app/gameLoop.ts`.

**Recommendation:** do not force dependency-heavy actions back into `resolveInteraction()`. Instead introduce an application-layer query such as `describeInteraction(target, context)` that returns structured presentation/actions backed by existing handlers. Execution stays in existing domain/action modules and revalidates. This follows the direction already used by `FlavorDialog` actions and `WorldInspection`.

### 10. Interaction feedback is inconsistent between immediate actions, dialogs, busy actions and silent no-ops

Several branches deliberately do nothing for state combinations while their prompts are status text; others toast an error; others open flavor text before executing an action (generic well); busy actions have their own progress overlay. The inconsistency makes it hard to know whether a press was ignored, blocked or accepted.

**Recommendation:** define feedback classes: blocked → reason in prompt/panel + error toast on attempted execution; immediate success → short toast/audio where useful; timed action → busy/progress feedback; information → inspection/flavor dialog. Avoid silent input consumption for an unavailable advertised action.

## P3 — polish

### 11. Vocabulary is inconsistent

Prompts use `Zbadaj`, `Sprawdź`, `Obejrzyj`, `Obserwuj`, while these sometimes mean flavor inspection and sometimes actionable details. This reinforces the E/R/V ambiguity.

**Recommendation:** reserve a small vocabulary: `Sprawdź` for details/inspection, `Obejrzyj/Obserwuj` for flavor-only observation, domain verbs for actions (`Otwórz`, `Podnieś`, `Buduj`, `Napraw`, etc.).

### 12. Cycle highlighting communicates manual selection but not target identity strongly enough for non-agents

`promptHighlighted` rings the prompt for cycle/soft-lock, while world highlighting is agent-specific. For dense props the user gets a changed text prompt but little spatial confirmation of which object is selected.

**Recommendation:** eventually add a cheap generic selected-target presentation (outline/marker/ground indicator) keyed from the same selected `Interactable`. Do not add a second target query; presentation consumes the existing selection.

## Architecture findings

### Good seams to preserve

- `Interactable` is correctly a thin per-frame adapter, not state ownership.
- `buildInteractables()` is the right common candidate-gathering seam.
- `pickInGaze()` is already shared across world systems; improve its ranking rather than replacing it.
- Synthetic dig/water/combat targets reuse the interaction path rather than creating standalone UI systems.
- Domain execution generally revalidates live state rather than trusting per-frame snapshots.
- `FlavorDialog` already supports application-resolved action callbacks with disabled reasons.
- `WorldInspection` correctly builds read models outside Vue from stable refs.
- Touch input writes into the same `KeyState` signals as desktop, which is the right ownership direction.

### Main structural debt

The missing abstraction is not another manager. It is a structured **interaction presentation/query layer** between target selection and execution. Today `promptLabel` and the `gameLoop.ts` switch jointly encode that layer implicitly.

A minimal direction would be conceptually:

```ts
type InteractionActionView = {
  input: 'primary' | 'alternate' | 'inspect'
  label: string
  enabled: boolean
  reasonLabel?: string
}

type InteractionView = {
  targetLabel: string
  actions: readonly InteractionActionView[]
}
```

This is presentation/query data only. It must not own simulation state or replace existing action handlers. The action executor should continue resolving live domain state at execution time.

## Recommended implementation order

1. Define E/R/V semantics and a structured interaction view contract over existing `Interactable` + action handlers.
2. Replace free-form prompt inference with structured primary/alternate/inspect availability, preserving current behavior first.
3. Fix target ranking/cycling deterministically without adding another target system.
4. Make touch buttons reflect actual action availability and close the combat world-cycle parity gap.
5. Expand `WorldInspection` to camp equipment first, then other stateful targets where detail adds value.
6. Normalize blocked-action reasons and feedback classes.
7. Add generic selected-target visual feedback for non-agent props only after the selection semantics are stable.

## Manual verification scenarios

Browser verification should be done by the player after implementation. High-value scenarios:

- tent + bedroll + platform placed tightly together; aim and cycle between each;
- container beside dropped items and an NPC;
- unfinished well/palisade/torch/house with and without required materials/tools;
- trap in each state and hive/drying rack in unavailable states;
- shoreline with/without fishing rod and with/without a fillable container;
- animal beside NPC/prop, with no tool, melee weapon and bow;
- multiple animals plus nearby world objects in combat mode, desktop Tab/Shift+Tab and mobile cycle;
- owned animal + cart while leading/not leading;
- corpse with shovel, knife available, and neither;
- quest-critical animal with extended interaction range;
- desktop vs touch: confirm every visible E/R/Inspect/Cycle control corresponds to a real current action.

## Conclusion

Seedvale does not need a new interaction system. It needs the existing one to become explicit about **selection ranking, action semantics, availability and inspection**. The strongest existing pieces (`Interactable`, shared candidate building, application-owned execution, `FlavorDialog` action callbacks and `WorldInspection`) are sufficient foundations. The next work should consolidate around them rather than add per-feature interaction UI or targeting paths.
