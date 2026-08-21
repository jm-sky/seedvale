# Plans — Current Planning Map

Implementation plans. This file is the **current planning map**: backlog, dependencies, active threads and verification queue. Detailed implementation lives in the plan files; history lives in [archive/](./archive/README.md). New plans stay in this folder regardless of status.

Status: `in progress` 🔄 · `verification needed` 🔍 · `planned` 📋 · `todo` ⬜ · `done` ✅
Priority: 🔴 high · 🟡 medium · ⚪ low
Effort: `XS` minuty · `S` ~15–30 min · `M` ~30–90 min · `L` ~1–3 h · `XL` kilka sesji
Verification: unless a row says otherwise, it has passed `tsc`/lint/build/test but has **not** been manually browser-tested — check the plan's own `Status:` header for detail. `Summary` below is trimmed to what matters for planning a *new* plan (key decisions, reuse vs new systems, explicit scope exclusions); full implementation detail lives in each plan's `*-implementation-notes.md`.

**Depends on** = implementation prerequisites (plan IDs). ~~done~~ is crossed out. A plan is ready when every dependency is struck. Thematic overlap is not a dependency.

Paths below are files in this folder unless noted. Implementation notes / reviews stay next to the plan (`*-implementation-notes.md`, `*-review.md`) and are not indexed separately.

## Plan domains

New plans should declare a primary `domain:` in frontmatter (and, if the plan genuinely spans more than one area, optional `tags:` for the secondary domain(s)). This is **not retroactive** — existing plans (live + archived) are not being touched.

Canonical domains (match [docs/STATE.md](../STATE.md)'s section headers, so a domain always maps onto exactly one part of the current-state doc):

| Domain | Covers |
|---|---|
| `world-terrain` | Procedural terrain, chunk streaming, ocean, environment/landmarks |
| `settlements-npcs` | Villages, NPC needs/FSM/schedule, dialogue, household/settlement economy |
| `fauna` | Wildlife needs, predator/prey, herds |
| `items-player` | Inventory, held tools, player survival needs, world items (dropped items, fires, tents) |
| `quests-progression` | `QuestManager`, relations, EXP |
| `persistence` | `SaveData` schema, IndexedDB, config persistence |
| `ui-input` | Vanilla + Vue UI, input, HUD |

`domain` is "where to look first" — pick one, even for a plan that touches several systems. Use `tags` for a second domain only when the plan is genuinely about both (e.g. a quest wired to a specific fauna mechanic is `domain: quests-progression`, `tags: [fauna]`). Don't tag every domain a plan happens to touch a file in.

Next ideas backlog is in [docs/plans/NEXT-IDEAS.md](./NEXT-IDEAS.md). Loose ends (blockers/spun-off ideas found mid-plan) are in [docs/plans/LOOSE-ENDS.md](./LOOSE-ENDS.md).

---

## Active threads

High-level map of how the current backlog chains together. Not a replacement for the `Depends on` column — a quick orientation for where a new plan would slot in. Only current/still-relevant chains; entries in parens are done — either kept as [Recent context](#recent-context) or already moved to [archive/](./archive/README.md).

```text
Combat & weapons
  (155 inventory instances) → (160 HQ melee) → (161 weapon maintenance, verification needed)
  (150 combat mode) + (155) → (162 bows/ranged, verification needed) → (177 NPC combat melee+ranged, verification needed — no live AI trigger yet) → 179 animal attack & NPC defense [verification needed]

Household economy & storage
  (106 food/cooking) + (069 household resources) + (122 water distribution) → (156 storage logistics)
      → 152 NPC food/drink help
      → 159 fishing/preservation/bait
  (122) → 126 seed planting, (127 player-built well, verification needed)

World-driven quests
  (049 landmarks, archived) + 093 quests-v3 (in progress) + (110 quests-v3 closure) → 132 landmark quests [verification needed]

Rendering performance
  (157 PointLight budget 16, archived) → 149 shader program first-use hitch [in progress]

Construction & lodging
  (109 megakit catalog) → 111 house construction [verification needed — assembly bug from playtest]
      → 169 house interior furniture/bed anchors
  (165 vigor/hunger/thirst/rest, verification needed) → 168 settlement lodging/sleep → 169 house interior furniture/bed anchors

NPC diagnostics
  170 NPC simulation inspector/trace observes needs + decisions + actions + interaction queues across the existing NPC systems

Natural vegetation
  (140 landscape flora) → (172 natural crop lifecycle, verification needed) → 126 seed planting
```

---

## In progress

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-13--093--quests-v3-world-problems-reputation.md` | Questy z problemów świata + reputacja; Etap A–G (relation levels, availability, effects, 4 world-problem questy end-to-end) zaimplementowane; lifecycle/identity gaps domknięte przez plan `110`. Etap H (drzewa/kopanie) i bandyci otwarte | 🔴 | XL | ~~015~~ ~~018~~ |
| `2026-08-17--149--shader-program-first-use-hitch.md` | Phase 0 closed; Phase 1 B production PointLight budget **16** landed in ~~157~~. Phase 1 A (`compileAsync` loading-window prewarm) **implemented + real-GPU verified** ([review 025](../reviews/2026-08-19--025--plan-149-phase-1a-compileasync-prewarm.md)). Phase C leftover: `Green` / `MI_WindowGlass` / `Wood`. Plan not `done`. | 🔴 | M/L | — |
| `2026-08-21--181--natural-mountains-and-rivers.md` | Etap 1–6: mountain tuning + pure D8 drainage prototype + river network as fixed 256m tiles with a halo (chunk-boundary-continuous ribbon geometry, own lightweight water material reusing `waterMaterial.ts`'s day/night uniforms unmodified) — rivers now render in the world. Etap 7 (meanders, waterfalls, full shader/rendering parity, worker offload) explicitly deferred | 🔴 | M | - |

---

## Planned

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-21--185--npc-role-based-carried-weapons.md` | Broń dla NPC do obrony przed wilkiem | 🔴 | S | ~~177~~ ~~179~~ ~~184~~ |
| `2026-08-16--126--seed-planting.md` | Sadzenie nasion drzew (rozszerza istniejący `TreeLifecycle`) i cropów (nowy prosty `CropLifecycle`) przez gracza, integracja z inventory/garden gather/persistence; wstępny | 🟡 | L | ~~106~~ ~~122~~ |
| `2026-08-20--174--player-garden-and-npc-need-sources.md` | Grządka budowana przez gracza + generyczny `NeedSource` model: NPC samodzielnie wykrywa i wybiera najbliższe dostępne źródło `hunger`/`thirst` przez istniejący needs/decision flow, bez `HelperAI`/`GardenAI`/global registry/per-frame scan | 🟡 | L | ~~159~~ ~~172~~ ~~126~~ ~~127~~ |
| `2026-08-20--176--garden-and-field-maintenance.md` | Wspólny mechanizm utrzymania grządek/pól: stan zadbania pogarsza się z czasem, wpływa na produktywność, długotrwałe zaniedbanie usuwa grządkę/pole; wspólne dla gracza i NPC, bez `GardenManager`/`FarmManager` | 🟡 | M | ~~174~~ ~~126~~ |
| `2026-08-19--168--settlement-lodging-and-sleep.md` | Nocowanie w osadzie: wybór łóżka, przyjaciela, płatnego noclegu lub siana; „Nocuj w mieście” prowadzi gracza do miejsca i dopiero wtedy uruchamia sen | 🔴 | L | ~~165~~ |
| `2026-08-19--169--house-interior-furniture-and-bed-anchors.md` | Wyposażenie domów w łóżko, stół, lampę i skrzynię z authorowaniem placementu przez Asset Alignment Browser; łóżko dostarcza miejsce noclegu dla planu 168 | 🟡 | L | ~~168~~ ~~111~~ |
| `2026-08-18--151--social-places-and-social-behaviour.md` | Social Places v1: istniejący settlement campfire jako `PlaceType: 'social'`, NPC↔NPC `conversation` przez istniejący Schedule/FSM, partner tylko spośród NPC przy tym samym ognisku, symetryczna zmiana relacji; bez nowego social managera/schedulera | 🟡 | M | ~~020~~ |
| `2026-08-18--152--npc-player-food-drink-help.md` | NPC dobrowolna pomoc graczowi jedzeniem/piciem z carried inventory (V1 celowo bez `Household.stock`/`.water` i bez teleportu NPC do domu); decyzja z relacji + traits + istniejący `reactionChance`; nowa opcja dialogu NPC v2 (`request_food`/`request_water`) | 🟡 | M | ~~106~~ ~~069~~ ~~122~~ ~~156~~ |
| `2026-08-19--167--npc-helper-resource-delivery.md` | NPC who gathers food for player | 🟡 | M | ~~164~~ |
| `2026-08-20--175--cooking-vessels-grates-and-iron-rods.md` | Patelnia (do 2 kawałków mięsa) i ruszt (do 4) rozszerzają istniejący system gotowania; żelazny pręt jako nowy przedmiot świata/inventory (m.in. do budowy rusztu); bez nowego craftingu ani równoległego systemu gotowania | 🟡 | M | ~~106~~ |
| `2026-08-21--180--npc-healing.md` | NPC używa opatrunków w razie obrażeń | 🟡 | M | ~~177~~ |
| `2026-08-20--178--hunter-profession-and-household.md` | Profesja myśliwego + gospodarstwo wyspecjalizowane w polowaniu/łukach/przetwórstwie i sprzedaży; wykorzystuje istniejące NPC combat/fauna/inventory/household/storage/economy/cooking, bez równoległych systemów | 🟡 | L | ~~177~~ ~~162~~ ~~159~~ 175 |
| `2026-08-21--182--deep-forest-biome-and-forest-generation-overhaul.md` | Wielki, ciemny las | 🟡 | M | ~~063~~ |
| `2026-08-14--104--underground-caves.md` | Prawdziwe jaskinie podziemne (`CaveVolume`, siatka 500 m); wstępny, do review | 🟡 | XL | ~~097~~ |
| `2026-08-20--173--terrain-aware-procedural-placement.md` | Dopasowanie props do wysokości terenu (kamienne kręgi, cmentarze) | 🟡 | M | - |
| `2026-08-19--171--weapon-browser-observatory.md` | Weapon Browser w Observatory/Admin: pokazuje wszystkie zdefiniowane bronie (nie tylko obecne w świecie) z istniejącego `ITEM_CATALOG`, bez równoległego rejestru statystyk broni; dev/debug tool, nie blokuje przyszłego katalogu dla gracza | 🟡 | M | - |

### Fresh new

> Place for plans links

---

## Todo

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-11--070--world-observatory.md` | Panel obserwacji życia świata | ⚪ | XL | 071 (archived, verification needed), ~~069~~ |
| `2026-08-08--037--npc-genealogy-lineages.md` | Rody NPC (kompas N → ~~067~~) | ⚪ | L | ~~022~~ ~~031~~ |

### Issues without plans

- Merchant UX / Handel:
  - Podczas handlu brakuje podglądu kupowanego przedmiotu. Nie wiemy, co kupujemy, jakie ma obrażenia, wagę itp.
  - Pewnie można dodać inne poprawki UX, szczególnie pod mobile.

---

## Verification needed

Implementation complete; needs play/browser check. Do not treat as normal backlog — a plan here is not "ready to build", it is "already built, waiting on confirmation" (or, for `111`, a known bug from a playtest that already happened). Status matches each plan's own `Status:` header, not just this table — when in doubt, open the plan.

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-20--179--animal-attack-and-npc-defense.md` | `frenzied` `AnimalAgent` state reuses the existing predator-human decision unchanged (no new "reduced fear" branch); frenzied wolf → NPC targeting via a bounded/local NPC candidate list (never a world scan), only once the player isn't the active threat. New NPC-side `ImmediateAnimalThreat` pressure (mirrors the existing predator-human decision shape) drives defend/flee, wired ahead of `NpcAgent`'s phase switch so it fires before damage and outranks the player look-at-me pause but never interrupts combat/sleep; defend reuses 177's `beginCombat()`. No new combat/threat-manager/flee system — [implementation notes](./2026-08-20--179--animal-attack-and-npc-defense-implementation-notes.md) | 🔴 | M | ~~177~~ |
| `2026-08-21--184--item-capability-abstraction.md` | Declarative `ItemCatalogEntry.capabilities` becomes the single source of truth for tool gating; old per-capability boolean helpers (`isChopTool` etc.) removed, all derived from the catalog. `melee`/`ranged`/`defense` intentionally untouched — [implementation notes](./2026-08-21--184--item-capability-abstraction-implementation-notes.md) | 🟡 | M | - |
| `2026-08-14--111--house-construction.md` | House Builder (MegaKit). Playtest 2026-08-18: **niektóre domki źle złożone** — wymaga poprawy assembly — [implementation notes](./2026-08-14--111--house-construction-implementation-notes.md) | 🔴 | XL | ~~109~~ |
| `2026-08-16--129--coins-and-land-sales.md` | `coin` as a second, near-weightless `ItemKind` next to `shell` (shell stays low-value barter currency; coin covers quest rewards 10–50 and plot prices 500–3200 where shell's weight would exceed carry limit) + deterministic sale plots as new `VillagePlot.role: 'sale'` (same picker/scorer, no second generator) + `LandOwnershipRegistry`/`purchaseLandPlot()` (full validation before mutation) + SaveData v14. No settlement treasury — `SettlementEconomy` still has no money concept | 🔴 | L | ~~093~~ |
| `2026-08-16--132--landmark-quests.md` | Deterministic bounded ring-search landmark resolver (no global registry) + new `interact_landmark` objective matched by `landmarkId`, resolved once at startup (landmarks never change, so no reload rebind needed) + reuses the existing generic `[E]` interactable branch (zero `gameLoop.ts` changes); 3 quests | 🟡 | M | ~~049~~ ~~093~~ ~~110~~ |
| `2026-08-19--170--npc-simulation-inspector-and-trace.md` | Bounded ring-buffer trace (150 events/agent) at authoritative `NpcAgent` transitions + read-only `why()` snapshot + console API. Ctrl+click had to become Ctrl+mousedown-while-gazing — pointer-lock FPS has no cursor raycast, worth remembering for any future debug-overlay work | 🔴 | L | - |
| `2026-08-18--159--natural-food-fishing-preservation-and-bait.md` | Natural food via existing spawner/flora pool + fishing (deterministic catch roll, no fish population sim) + bait (shared `food.bait` flag, traps+fishing) + freshness (`FoodBatch[]`, Fresh→Medium→Spoiled) + dryer/wild beehive as deterministic settlement landmarks (not player-placed). SaveData v20 | 🟡 | L | ~~155~~ ~~156~~ ~~106~~ |
| `2026-08-18--161--weapon-maintenance-and-sharpening.md` | 13 melee kinds extend the plan-155 `ItemInstance` model with durability/sharpness; sharpness modifies damage before the critical roll (shared resolver with 162); wear applies once per resolved hit; `whetstone` sharpens; old count-based weapons migrate to full-condition instances on load. No SaveData bump | 🟡 | M | ~~155~~ ~~160~~ |
| `2026-08-18--162--bows-arrows-ranged-combat-and-critical-hits.md` | 3 bows + 3 arrow kinds; draw→release→recovery lifecycle mirrors player melee; swept-segment projectile flight (no visual arrow, no Raycaster); shared critical-hit resolver used by both ranged and melee. **Player-only** — NPC ranged combat intentionally not implemented (no NPC attack-decision flow to extend yet; avoided a consumerless `ArcherAI`) | 🟡 | L | ~~150~~ ~~155~~ |
| `2026-08-19--165--vigor-hunger-thirst-and-rest.md` | Vigor/hunger/thirst drain tuned (passive idle cut, movement/sprint drain added); hunger/thirst below a 20%-of-pool threshold now drains Vigor/Stamina first, HP loss only after a multi-day severe gate (was instant HP loss at 0 before). Also fixed a real pre-existing bug: sleep/time-skip was applying ~180× too much hunger/thirst/vigor drain; fixed by scaling `worldDt` with `timeMultiplier` instead of freezing it during a skip | 🟡 | M | - |
| `2026-08-20--172--natural-crop-lifecycle.md` | Wild natural-crop lifecycle (young→mature→spoiled) + deterministic terrain placement — a **second, independent source** of the same items alongside the existing garden-renewable pickups (159), which stay untouched. Cycles periodically as a pure fn of seed+worldDays (not a one-shot day-0 anchor), so late-explored chunks aren't permanently spoiled. SaveData v21 | 🟡 | M | ~~140~~ |
| `2026-08-19--164--player-storage-and-container-system.md` | Generic `Container`/`ItemSize` gabarite system (independent of weight) — `chest` is the only concrete kind for now. Buy/place/open (two-column transfer screen)/pick-up-with-contents. New encumbrance model (smoothstep 10–30% speed falloff, blocked ≥30%) wired once/frame. SaveData v22 | 🔴 | M | - |
| `2026-08-21--183--slope-movement-constraint.md` | Shared `slopeConstraint.ts` (finite-difference slope probe + smoothstep falloff 35°–55°) scales/blocks only the **uphill** component of per-frame movement; across/downhill unchanged. Wired independently into player, NPC, and animal movement — three loops sharing one math function, no navmesh/new physics | 🟡 | S | - |
| `2026-08-20--177--npc-combat.md` | Melee **and** ranged NPC combat: neutral windUp→hitWindow→recovery / draw→release→recovery timer core extracted from player melee/ranged (player code now wraps it) + weapon/ammo/defense resolution from `NpcAgent.carried` + new `combat` phase/`beginCombat()`/`cancelCombat()`/death. An NPC owns at most one in-flight projectile on itself, not a shared world registry (no `NpcCombatManager`/global projectile pool). Animal-defense (179) is the first live caller of `beginCombat()`; hunter/bandit deciders are future callers | 🔴 | M | ~~150~~ ~~162~~ |

---

## Recent context

Done plans kept visible here (not archived) because a current plan above still depends on them. Everything else that reached `done`/`verification needed` before this snapshot (2026-08-19) is in [archive/](./archive/README.md#snapshot-2--2026-08-14--2026-08-19); after this snapshot, new `done` work stays in this file and only gets pulled in here if it becomes load-bearing for the backlog above — see [Index completeness](#index-completeness).

| File | Why it's here |
|------|----------------|
| `2026-08-14--106--player-needs-food-and-cooking.md` | Głód/pragnienie/stamina/vigor + jedzenie/gotowanie — dependency of `126`, `152`, `159` |
| `2026-08-11--069--npc-household-resources.md` | Gospodarstwa NPC + przepływ zasobów — dependency of `152`, `070` |
| `2026-08-14--109--megakit-construction-catalog.md` | Audyt 176 MegaKit GLB + `ConstructionCatalog` — dependency of `111` |
| `2026-08-14--110--quests-v3-closure-world-identity-and-lifecycle.md` | Domknięcie 093: lifecycle `failed`/`invalidated`, `landmarkId`/rebind — dependency of `132`, narrative closure for the in-progress `093` |
| `2026-08-15--122--natural-resource-gathering-and-water-distribution.md` | Studnia → NPC → household barrel/trough — dependency of `126`, `127`, `152` |
| `2026-08-18--150--combat-mode-defense-and-downed-state.md` | Combat mode + soft lock, defense resolver, player `downed`; save v18 — dependency of `162` (own status note: browser verification pending) |
| `2026-08-18--155--inventory-item-instances-and-trap-lifecycle.md` | Generyczny `ItemInstance` + lifecycle pułapek — dependency of `159`, `161`, `162` |
| `2026-08-18--156--npc-household-and-settlement-storage-logistics.md` | Fizyczny household/settlement crate + `[E]` stock — dependency of `152`, `159` |
| `2026-08-18--160--high-quality-melee-weapons.md` | Sześć HQ broni białych, Kupiec + quest rewards — dependency of `161` |
| `2026-08-19--166--named-save-slots.md` | Nazwane sloty IndexedDB; browser verified 2026-08-19 — kept until the next archive snapshot |

---

## Index completeness

Every `docs/plans/YYYY-MM-DD--NNN--*.md` in **this folder** (except `*-implementation-notes.md`, `*-review.md`, `README.md`, `NEXT-IDEAS.md`, `LOOSE-ENDS.md`, `archive/`) belongs in exactly one section above (`In progress` / `Planned` / `Todo` / `Verification needed` / `Recent context`), regardless of status.

New plan: `YYYY-MM-DD--{NNN}--slug.md` (next sequential NNN), a `domain:`/optional `tags` per [Plan domains](#plan-domains) above, then a row in the matching section. When a plan reaches `done` and nothing above still depends on it, it stays here until the next archive snapshot — do not move it to `archive/` yourself; that only happens as a deliberate periodic snapshot (see [archive/README.md](./archive/README.md)).

**Keep `Summary` short — this file must stay small enough to load whole (e.g. into ChatGPT) as a planning map.** One sentence, or a few short clauses. Include only what a *future plan* needs as context: key architectural decisions (reuse vs new system, explicit scope exclusions/deferrals), SaveData version bumps, known bugs. Do not restate the filename/slug, list touched file or function names, quote test counts, or repeat the standard tech-verification sentence (already covered once under [Verification](#plans--current-planning-map) above) — that detail belongs in the plan's own `*-implementation-notes.md`/`*-review.md`, not in this index. If a row is ballooning past 2-3 sentences, cut it and move the detail to the plan file.

---
