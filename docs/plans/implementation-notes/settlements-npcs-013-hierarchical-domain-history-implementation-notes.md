# Implementation Notes: Hierarchical Domain History

## Current-state corrections

- The existing NPC trace is not debug-gated: NpcAgent always records a bounded NpcTraceBuffer (150 events); only the read/debug surface is gated. Do not add another always-on telemetry layer or make the existing trace conditional.
- NpcTraceEvent currently has only simTime plus event-specific fields. It has no NPC/household/settlement context and no sequence number.
- npcInspector.ts deliberately re-resolves live NPCs through SettlementsManager.getLoaded() on every call. Handles must not retain NpcAgent or Settlement references.
- HouseholdRegistry already survives settlement streaming and has get(id), but SettlementsManager currently exposes only household snapshots, not direct household lookup.
- SettlementEconomy is also registry-owned and survives streaming. Settlement itself is rebuilt/disposed when streamed, so settlement history must not be owned only by the transient Settlement object.
- Household food is now concrete Inventory items; wood remains EconomicStock. Do not instrument the old scalar-food model from earlier plans.
- NPC trace timestamps are per-agent monotonic simClock seconds, not world elapsedDays/time-of-day.

## Recommended architecture

Keep the existing NPC trace as the source of NPC events. Do not turn it into a generic event bus.

Use a small typed history-record/envelope for hierarchical aggregation rather than changing every NpcTraceEvent literal to contain three IDs. The envelope can carry:
- scope: npc | household | settlement
- stable npcId / householdId / settlementId where applicable
- simTime
- deterministic sequence
- typed payload (NpcTraceEvent for NPC events, typed household/settlement events for domain-owned mutations)
- optional source
- optional correlationId

Keep NpcTraceEvent as a typed union. This avoids breaking the existing trace tests/API and avoids turning the trace into an untyped generic event.

Store events once at their authoritative owner. Hierarchical histories are read-time aggregation/filtering, not three physical copies:
- NPC-owned events → existing NPC trace.
- Household state transitions → bounded history on Household.
- Settlement/economy transitions → bounded history on the already long-lived SettlementEconomy (or the closest existing authoritative settlement owner).
- Household history may contain a resource mutation caused by an NPC, while the NPC trace separately contains the decision/action that caused it; these are distinct events, not duplicates.

Do not introduce a global history/event registry or EventBus.

## Context, ordering and correlation

- Give all domain history records a deterministic secondary order. Prefer a shared per-settlement sequence allocator over sorting by object/map iteration order. The allocator is only sequencing metadata, not a new event system.
- Do not use the NPC's local simClock as a cross-NPC ordering key by itself.
- Preserve existing natural identifiers where they already exist: queueId, action, NPC plan goal, etc. Do not add UUID generation.
- correlationId should remain optional. Only propagate an existing natural process identity if it can be done cheaply. Chronology plus domain IDs is sufficient otherwise.
- source should be a short typed enum/string identifying the authoritative producer, not a stack trace or formatted diagnostic string.

## Authoritative instrumentation points

Start with mutation points already owning the state rather than adding logging around callers:
- src/settlement/household.ts: deposit, depositFood, takeFood, and meaningful water reserve changes if required by the verification scenario. Shortage/resolution should be derived from real mutations; do not add per-frame polling events.
- src/economy/settlementEconomy.ts: bulk stock add/remove, concrete food deposit/withdraw, and development reservation/completion transitions if they are part of the selected settlement-history scenario.
- src/ai/NpcAgent.ts: preserve all existing trace sites. Do not duplicate every NPC event into household/settlement storage.
- src/settlement/createSettlement.ts: use the existing household/economy/settlement ownership passed into NPC creation; do not add another ownership graph.

The first vertical slice should cover the existing household shortage → NPC decision/plan/action → resource mutation → shortage resolution path. Avoid instrumenting unrelated systems just to make the API look complete.

## Streaming/lifecycle

- Household and SettlementEconomy are the important long-lived owners: both survive settlement unload/reload through registries.
- Do not store a Settlement or NpcAgent reference inside a debug handle/history record.
- debug.household(id) and debug.settlement(id) should resolve the current owner on every history() call, just like npc(id)/village(id) already do.
- Add narrow manager-level lookup methods if needed (getHousehold, getEconomy/history access), rather than exposing registries or creating a second global registry.
- Existing NPC trace lifetime remains tied to the NpcAgent instance. Do not silently move NPC trace ownership into NpcStateRegistry; that would change the explicit plan-170 ownership/lifecycle contract.
- Consequently, a settlement history assembled from child NPC traces can only include currently-loaded NPC trace history. Persistent household/economy history should remain available while the settlement is unloaded.

## Debug API

Extend src/debug/npcDebugApi.ts; it is already the single window.seedvale.debug surface.

Target handles should be ID-based and fresh-resolving:
- debug.household(id).history()
- debug.settlement(id).history()

Prefer implementing lookup/aggregation in npcInspector.ts or a narrowly scoped sibling helper rather than putting domain traversal logic directly into npcDebugApi.ts.

For the first implementation, only add filters that materially help the verification scenario: since, limit, types, and correlationId if correlation exists. Keep results plain-data/JSON-serializable.

settlement(id) should resolve an unloaded settlement using the existing settlement definition/registry model, while its history comes from long-lived domain owners rather than a disposed Settlement.

## Tests

Reuse the existing test style in:
- src/debug/npcTrace.test.ts
- src/debug/npcInspector.test.ts
- src/debug/npcDebugApi.test.ts

Add focused tests for:
1. context/envelope correctness;
2. household and settlement aggregation without duplicate logical records;
3. settlement/household isolation;
4. deterministic ordering when timestamps are equal;
5. bounded eviction;
6. fresh lookup after simulated settlement reload;
7. existing NPC trace compatibility.

Prefer pure history-buffer/aggregation tests over constructing real Three.js settlements.

## Important pitfalls

- Do not make history strings during simulation. Store typed/plain data and format only at the debug boundary.
- Do not emit events from update() merely because a value was observed; record semantic transitions/mutations only.
- Do not scan the whole world on every event. Settlement aggregation can traverse the settlement's existing household list/registry and currently loaded NPCs.
- Be careful with food: household shortage/resolution must use foodItemCount(items), not stock.query('food').
- Do not confuse Settlement streaming lifetime with the persistent SettlementEconomy/Household registry lifetime.
- Keep debug API installation cheap and unchanged outside ?debug=1/admin mode.
- Add JSDoc for new public architectural APIs and suggest @domain settlements-npcs so Claude preflight can discover the ownership boundaries.

## Suggested implementation order

1. Add the typed domain-history record/buffer primitive and tests.
2. Integrate it with the existing NPC trace without changing NpcTraceEvent semantics/API.
3. Add household mutation history at authoritative Household methods.
4. Add settlement/economy mutation history at authoritative SettlementEconomy methods.
5. Expose narrow SettlementsManager lookups needed by debug.
6. Add fresh-resolving household/settlement debug handles and aggregation.
7. Add bounded/order/isolation/lifecycle tests.
8. Verify the real household-shortage chain in the browser and compare NPC → household → settlement timelines.