# Plan: Travelling Merchant road-party travel and threat cooperation

**Created:** 2026-09-19
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** L
**Depends on:** world-035, settlements-npcs-049, settlements-npcs-050, settlements-npcs-048, npc-048, npc-057
**Domain:** `settlements-npcs`
**Subdomains:** `logistics` `social`
**Tags:** `merchant` `travel` `roads` `escort` `threats`
**Roadmap:** `quests-travelling-merchant-journeys.md`
**Model:** Sonnet, Composer

## Goal

Spinać realną Travelling Merchant party z canonical road travel, destination-threat assessment i existing threat/combat cooperation bez tworzenia Merchant-specific movement/combat simulation.

Target:

```text
prepared merchant journey
→ shared RegionalTravelItinerary
→ Merchant + escorts + pack animal follow existing roads
→ bounded destination-risk gate at new detailed leg/commitment
→ immediate threat uses existing defend/flee + assistance
→ detailed when important/loaded
→ generic off-screen continuity when remote
→ arrival / visit / return unchanged
```

## 1. Ownership

Zachować:

- `MerchantJourneyState` = merchant lifecycle only;
- `NpcTravelContinuity` = long-distance spatial/off-screen continuity;
- `NpcAccompanyCommitment` = escort relation;
- pack-animal assignment from 048;
- `world-035` = regional road itinerary;
- `npc-057` = pure destination-risk assessment;
- `npc-048` / `npcAnimalThreat` = live local threat arbitration/assistance.

Nie dodawać `MerchantTravelManager`, `MerchantCombatState` ani drugiego ETA.

## 2. Road-following detailed travel

Gdy Merchant jest materialized i detailed simulation ma sens:

```text
current logical journey destination
→ resolve/reuse world-035 itinerary
→ current road/path leg
→ transient waypoint cursor
→ existing detailed NPC locomotion
```

Escorty followują realnego Merchant NPC przez actor-neutral accompany z 049.

Pack animal używa 048 continuity/follow semantics.

Nie prowadzić Merchant po straight-line wilderness, jeżeli istnieje committed road itinerary.

## 3. Adaptive/off-screen handoff

Remote/low-impact journey nie symuluje każdego waypointu.

Przy stream-out / transition to aggregated simulation:

- capture current logical travel position/leg as needed;
- reuse existing `NpcTravelContinuity`;
- preserve Merchant/escort/animal identities and commitments;
- no per-agent per-frame road following.

Przy reification:

- resolve current itinerary again if needed;
- resume nearest logically valid point/leg;
- do not restart journey from home;
- do not duplicate party.

## 4. Destination threat gate

`npc-057` nie jest full-route risk model.

Use it only when Merchant/party wybiera nowy **concrete bounded detailed target**, e.g.:

- wejście na następny road leg;
- local road rejoin after interruption;
- bounded next route anchor when detailed travel resumes.

Cost shape:

```text
new target decision
→ one bounded fauna threat snapshot
→ one assessDestinationThreat()
→ accept / delay / choose allowed alternative
```

Nigdy:

```text
every tick
→ assess every waypoint
```

Party capability input should reflect real Merchant HP/combat capability and available escort protection only through a small explicit travel risk profile; nie kopiować combat scorer.

If a current visible danger makes the next voluntary target unacceptable, delay/re-evaluate later rather than cross-country reroute.

## 5. Immediate danger and calls for help

Po rozpoczęciu legu `npc-057` przestaje być ownerem. Real danger podczas ruchu przechodzi przez existing immediate threat path.

Extend the bounded threat composition so a travelling party outside a settlement can share **the same local danger candidates** without global fauna scans.

Target:

```text
one bounded local threat candidate set for relevant detailed area
→ Merchant / escorts consume cheap radius filters
→ victim/source may emit call_for_help presentation
→ capable Guard/Hunter escort runs/defends through existing arbitration
→ injured/incapable escort may flee
```

`call_for_help` bark remains presentation only; behavioural authority stays in live threat data and arbitration.

## 6. Party assistance semantics

A real threat against:

- Merchant;
- an escort;
- assigned pack animal;

may become a party-local assistance candidate when the underlying combat/threat facts already exist.

Do not invent danger from proximity alone.

Do not make every escort attack automatically.

Reuse:

- `senseImmediateAnimalThreat()`;
- `senseLocalThreatAssistance()` or a generalized bounded equivalent;
- `arbitrateAnimalThreat()`;
- existing combat targets;
- npc-046 emergency run.

## 7. Performance guardrails

Hard requirements:

- one regional itinerary resolve per journey start/replan, not per tick;
- current waypoint advancement O(1);
- no full-road scan per traveller tick;
- no full-fauna scan per party member;
- compose bounded local threat candidates once for the relevant detailed simulation area, then cheap per-member radius filtering;
- no party threat persistence/timeout registry if live facts can derive the signal;
- off-screen party uses aggregated generic travel, not waypoint simulation;
- no Web Worker unless measured CPU cost later justifies communication overhead.

## 8. Replan policy

Replan only for:

- invalid/removed destination;
- canonical route invalidation/world-network epoch change;
- future explicit persistent route-policy block;
- unrecoverable detailed leg failure after existing local navigation retries.

Do not replan because:

- a predator temporarily appears;
- escort falls a few metres behind;
- local pathfinder performs an ordinary short repath.

Threat changes urgency/behaviour, not canonical road commitment by default.

## 9. Route-history integration

Leave a cheap route-policy seam for `quests-progression-068` / persistent world consequences.

Future known danger/safety may alter edge eligibility/cost only at journey/leg commitment or justified replan.

No global route danger heatmap.

## 10. Failure handoff

This plan does not create evidence.

If normal combat/survival resolves to death/irrecoverable travel state, `world-032` observes that terminal outcome.

A capable living escort must receive the normal chance to respond before Merchant failure is considered terminal.

## 11. Suggested integration points

- `src/settlement/merchantJourney.ts` — semantic journey bridge only;
- `src/ai/npcTravel.ts` — existing off-screen continuity/handoff;
- `src/ai/npcAccompanyCommitment.ts` / `npcAccompanyExecution.ts` — NPC→NPC escort execution from 049;
- `src/ai/npcDestinationThreat.ts` — decision-time gate;
- `src/ai/npcAnimalThreat.ts` — immediate/assistance arbitration;
- `src/settlement/SettlementsManager.ts` or the existing fauna→NPC composition boundary — bounded detailed threat candidate composition;
- `world-035` itinerary resolver.

## 12. Verification

Automated:

- Merchant detailed route uses world-035 road/path legs;
- no straight-line cross-country shortcut while itinerary is valid;
- escorts follow same real Merchant identity;
- pack animal remains the same stable animal;
- one itinerary resolve across many ordinary detailed ticks;
- destination threat assessment runs only on target/leg decisions;
- one bounded threat candidate set can serve party members without per-member fauna scan;
- Merchant attacked + capable escort nearby can produce defend response;
- injured/unarmed escort can flee;
- temporary threat does not rebuild regional route every frame;
- stream-out hands back to generic travel;
- reification resumes without duplicate party/journey;
- terminal outcome remains consumable by world-032.

Manual/browser verification belongs to the User.

## Non-goals

- full caravan formations;
- tactical squad AI;
- road danger heatmap;
- per-frame safe-route search;
- bandit system;
- new combat model;
- new fauna scan registry;
- remote waypoint-by-waypoint simulation;
- merchant-specific worker;
- failure evidence/quests.

Add JSDoc with `@domain settlements-npcs` to important public integration helpers.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
