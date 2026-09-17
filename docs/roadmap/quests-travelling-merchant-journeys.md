# Travelling Merchant Journeys, Equipment and Quest Consequences Roadmap

## Purpose

This roadmap develops the Travelling Merchant into a systemic world actor whose journey is built from existing Seedvale mechanisms rather than merchant-only scripting.

Target direction:

```text
settlement economy / transport need
→ real Trader prepares for travel
→ real equipment + provisions + animal/cart cargo
→ journey between settlements
→ optional rest/camp/resupply
→ arrival and trade
OR
→ real failure/death on the road
→ persistent evidence and lost cargo
→ NPC/player discovery
→ systemic quest opportunity
→ possible persistent route/world consequence
```

The merchant is not a quest prop. The same NPC, items, animal, cargo and world state should continue existing whether or not the player observes the journey.

This roadmap complements:

- `settlements-npcs-038-travelling-merchant-inter-settlement-role.md`;
- `quests-professions-and-world-consequences.md`;
- existing transport, NPC survival, combat, inventory, animal/cart and quest systems.

Do not implement this roadmap as one large feature.

---

## Current foundations verified in code/plans

### Travelling Merchant lifecycle

`settlements-npcs-038` already owns the first Travelling Merchant lifecycle:

```text
home Trader
→ real inter-settlement transport opportunity
→ outbound travel
→ destination visit
→ return travel
→ normal home Trader work
```

It deliberately excludes escorts, caravans, pack animals/carts and journey encounters. Those remain follow-up work.

### NPC personal inventory and Player → NPC transfer

`NpcAuthoritativeState.personalInventory` is persistent ownership for personal belongings.

`items-player-027` already implements:

```text
Player Inventory
→ NPC personalInventory
→ normal NPC systems decide how/when to use the item
```

Do not create merchant-only or guard-only inventory.

### NPC combat equipment

NPC combat already resolves weapons from ordinary inventory/action context.

The remaining important gap for this roadmap is richer selection and especially worn armor integration for NPCs. Prefer reuse of the existing item/armor domain rather than a parallel NPC armor model.

### Weapon maintenance

Weapon instances already support durability and sharpness.

`sharpenWeapon()` and whetstones already exist.

Merchant/guard preparation should call the same domain operation through normal NPC actions rather than inventing a merchant maintenance shortcut.

### NPC provisions and off-screen survival

NPC personal food/water and off-screen survival already exist.

Merchant travel preparation and travel survival must extend these mechanisms rather than create `MerchantFood`, `MerchantWater` or another off-screen simulation.

### Animals and carts

Horse, donkey and persistent carts/hitching already exist.

Pack inventory / saddlebags should extend stable animal identity and normal inventory ownership, and later be reusable by the player, merchants, couriers and expeditions.

### Existing relevant items

Current item catalog already includes, among others:

- `knife`;
- `damascus_knife`;
- `short_sword`;
- `long_sword`;
- `damascus_short_sword`;
- `damascus_long_sword`;
- `battle_axe`;
- `masterwork_sword`;
- `hunting_bow`;
- `whetstone`;
- `leather_armor`;
- `chainmail`;
- `signet_ring`.

Therefore new weapon work should add missing niches rather than duplicate existing premium weapons under new names.

---

# Design rules

## 1. Real ownership

A merchant's dagger, a guard's sword, an animal's pack cargo and a lost merchant's signet must be real owned items.

Avoid authored fake equivalents such as:

- `merchantQuestRing`;
- `guardFakeSword`;
- `merchantTravelFood`;
- `merchantQuestCargo`.

## 2. Same mechanisms for player and NPC where practical

If the player and NPC can both sharpen a weapon, use the same weapon-maintenance domain.

If horse/donkey cargo can later be used by the player, do not make a merchant-only cargo container.

If an NPC receives a desired gift, use normal Player → NPC transfer.

## 3. Persistent consequences before quests

Road death must first be a world/simulation event.

The quest observes the consequence:

```text
merchant dies
→ journey fails
→ corpse/cart/cargo/evidence remain
→ somebody notices
→ quest opportunity
```

not:

```text
quest starts
→ spawn dead merchant prop
```

## 4. Hybrid simulation

Near/important journeys may materialize detailed agents, animals, camps and combat.

Remote journeys should use existing generic/off-screen continuity and bounded event resolution.

Do not add a world-global per-frame merchant simulation.

## 5. Stable identity

Use stable NPC, animal, cart, item-instance and world-object identities.

Stream-out, save/load, world rebuild or camera distance must not duplicate or reset a merchant party.

---

# Stage A — Finish the travelling NPC foundation

## Existing plan — Travelling Merchant inter-settlement role

**Existing plan:** `settlements-npcs-038-travelling-merchant-inter-settlement-role.md`

Keep its current scope.

It should establish:

- same persistent Trader travelling between settlements;
- real `TransportOrder` cargo;
- foreign visitor materialization;
- off-screen visit expiry;
- return home;
- one live NPC identity;
- trade at destination.

Do not extend 038 with guards, pack animals, camps or death quests.

This remains the foundation for all later stages.

---

# Stage B — Equipment and new weapon niches

## Plan candidate — Additional weapons and premium variants

**Suggested domain:** `items-player`  
**Priority:** medium-high  
**Effort:** M

Create one coherent item plan instead of one plan per weapon.

Candidate additions:

### Dagger

Role:

- clearly better personal weapon than `knife`;
- light, compact and fast;
- thematically appropriate for ordinary merchants and other civilians.

Expected trade-off:

- more damage than knife;
- still short range;
- low weight;
- fast wind-up/recovery.

### Cleaver or compact hatchet

This should fill the niche between dagger and sword.

It is **not**:

- the existing work `axe`;
- the existing large `battle_axe`.

Expected identity:

- compact one-handed weapon;
- heavier/slower than dagger;
- more damage;
- shorter reach than sword.

Final name/model should be chosen from available assets during plan recon.

### Premium dagger

Prefer first checking whether the existing `damascus_knife` already fills this role.

If yes, reuse/rebalance/rename presentation rather than adding a duplicate item.

If a separate premium dagger is justified, it should have a real gameplay distinction.

### Premium balanced/masterwork sword

First evaluate existing:

- `masterwork_sword`;
- Damascus short/long swords.

Only add another sword if it owns a distinct gameplay niche.

Possible niche:

- lower weight;
- faster recovery;
- slightly lower raw damage than a heavier premium sword;
- very high value.

### Master hunting bow

Rare, expensive, high-quality hunting bow.

Intended primarily as:

- quest reward;
- exceptional loot;
- rare premium merchant stock where explicitly justified.

It should be clearly stronger than normal `hunting_bow`, but not merely by raw damage.

### Premium item balancing rule

Higher-tier weapons should justify price through actual stats.

Possible advantages:

- damage;
- lower weight;
- shorter wind-up;
- shorter recovery;
- lower stamina cost;
- durability;
- slower sharpness loss;
- ranged accuracy/range where the existing ranged model supports it.

Do not make every premium weapon best in every stat.

Prices should reflect meaningful mechanical advantage and rarity.

### Scope guardrails

Do not add:

- a generic rarity system solely for these items;
- duplicate Damascus/masterwork weapons that existing items already cover;
- merchant-specific weapon definitions.

---

## Plan candidate — NPC weapon choice and worn armor integration

**Suggested domain:** `npc`  
**Priority:** high  
**Effort:** M/L

Goal:

Allow ordinary NPCs, including merchants and guards, to benefit from real equipment they own.

Required direction:

- deterministic sensible weapon selection from `personalInventory`;
- current action/combat context chooses the weapon;
- transferred weapons remain ordinary inventory items;
- armor owned by NPC can become worn/active through the existing armor rules;
- incoming NPC damage should use the same armor-domain semantics where practical;
- death/corpse loot preserves real owned equipment.

Do not create:

- `MerchantEquipment`;
- `GuardEquipment`;
- companion-only equipment;
- synthetic profession weapons that do not exist in inventory.

Persistent worn-slot state should only be introduced if current armor semantics genuinely require durable slot occupancy.

---

# Stage C — Pack animals and light cargo

## Plan candidate — Animal saddlebags / pack inventory

**Suggested domain:** `fauna`  
**Subdomain:** `domestication`  
**Priority:** high  
**Effort:** L

Goal:

Allow saddlebags/pack equipment to be mounted on suitable domesticated animals and hold real inventory.

Initial supported animals:

- donkey;
- horse.

Target ownership:

```text
stable AnimalId
+ equipped saddlebags
→ persistent pack inventory
```

Required behaviour:

- saddlebags are real equipment/items;
- attach/remove interaction;
- cargo belongs to that animal/pack equipment;
- persistent across stream-out, save/load and world rebuild;
- inventory capacity is finite;
- player and NPC systems may use the same mechanism;
- death of the animal does not silently destroy cargo;
- removing saddlebags with cargo needs explicit safe semantics;
- no duplicated `DonkeyInventory` and `HorseInventory`.

Likely future consumers:

- poor travelling merchant;
- player pack animal;
- courier;
- NPC expedition;
- hunting/mining expedition;
- settlement light transport.

### Relationship with carts

Pack inventory is light transport.

It should coexist with, not replace:

- carts;
- hitching;
- `TransportOrder`;
- `NpcAuthoritativeState.transportCargo`.

A later integration plan decides how merchant logistics chooses pack animal vs cart capacity.

---

# Stage D — Merchant party profiles

## Plan candidate — Merchant wealth tiers, escort and transport profile

**Suggested domain:** `settlements-npcs`  
**Priority:** high  
**Effort:** L  
**Depends on:** Travelling Merchant foundation, NPC equipment, pack inventory

Do not create three professions.

Use one Trader plus a travel profile.

Initial tiers:

### Poor merchant

Typical composition:

- merchant;
- donkey with saddlebags;
- no guard;
- small cargo;
- cheap personal weapon, initially knife or dagger.

Potentially travels mostly on foot.

### Normal merchant

Typical composition:

- merchant;
- horse and/or cart depending on resolved transport design;
- one guard;
- larger cargo;
- guard with ordinary sword and leather protection.

### Rich merchant

Typical composition:

- merchant;
- better transport;
- one or two guards;
- valuable cargo;
- merchant with premium dagger;
- guards with premium weapons/armor where appropriate.

The profile should be deterministic and world-grounded.

Long-term inputs may include:

- merchant/stock wealth;
- home-settlement prosperity;
- shipment value;
- route risk;
- previous trade success;
- reputation/business progression.

V1 may use a simpler deterministic profile if deeper economic wealth is not yet authoritative.

### Guard identity

Guards must remain real NPC identities with:

- real health;
- real personal inventory;
- real weapons/armor;
- normal combat/death;
- persistent consequences.

Do not spawn disposable escort combat props.

---

# Stage E — Journey preparation and settlement resupply

## Plan candidate — NPC journey provisioning and readiness

**Suggested domain:** `npc` or `settlements-npcs` after recon  
**Priority:** high  
**Effort:** L

Before departure, resolve actual readiness.

Target flow:

```text
journey commitment
→ estimate bounded needs
→ inspect real party state
→ resolve shortages
→ depart when sufficiently prepared
```

Readiness should consider at least:

- food;
- drinking water;
- weapon availability;
- weapon sharpness/condition;
- required transport animal/cart;
- escort readiness where present.

### Settlement actions

Possible real preparation actions:

- fill waterskin/bucket from usable well/water source;
- obtain food from valid personal/household/settlement source;
- sharpen owned weapon with whetstone;
- obtain service/resource from Blacksmith where normal systems support it;
- load pack animal/cart.

Do not create a merchant-only preparation inventory.

### Scope boundary

This plan should establish preparation/resource acquisition.

It should not yet build detailed overnight camp presentation.

---

# Stage F — Generic travel rest and camp

## Plan candidate — NPC travel camp / overnight stay

**Suggested domain:** `npc` / `world` after ownership recon  
**Priority:** medium-high  
**Effort:** L

This must be a generic travel mechanism, not `MerchantCampSystem`.

Potential consumers:

- merchant;
- merchant guards;
- couriers;
- expedition parties;
- accompanying NPCs.

Target detailed flow:

```text
travel
→ night / fatigue / unsafe continuation
→ choose viable local stop
→ stop
→ optional tent
→ optional fire
→ eat/drink
→ rest/sleep
→ resume travel
```

Use existing:

- NPC needs;
- stamina/vigor;
- personal provisions;
- tent/campfire/rest concepts where architecture allows;
- weather exposure;
- generic travel continuity.

### Hybrid/off-screen rule

When remote, preserve meaningful consequences without materializing a full tent/fire scene.

The remote model should account for:

- elapsed time;
- provisions;
- fatigue/rest;
- weather/risk where existing simulation supports it.

When detailed, presentation may materialize real camp objects if a clean reusable lifecycle exists.

---

# Stage G — Desired gifts and relationships

## Plan candidate — NPC desired gifts and relationship reward

**Suggested domain:** `npc` + `quests-progression` integration  
**Priority:** medium  
**Effort:** M

Dialogue concept:

```text
Player: "Może chcesz jakiś prezent?"
NPC: "Marzę o ..."
```

The desired item should be derived from real context rather than a static universal wishlist.

Candidate inputs:

- profession;
- current personal inventory;
- current needs/problems;
- wealth;
- traits;
- current equipment quality;
- local availability.

Examples:

- guard → weapon, armor, whetstone;
- hunter → arrows, dagger, bow;
- blacksmith → iron, coal, quality tool;
- farmer → useful farm tool;
- merchant → premium personal weapon or travel-related useful item.

Giving uses existing Player → NPC transfer.

After successful transfer:

```text
real ownership transfer
→ compare against expressed desire
→ relationship consequence
```

Required anti-farming rules:

- remembered/cooldown desire;
- diminishing or one-time reward for fulfilling the expressed wish;
- no repeated unlimited relation gain from the same cheap item.

Do not create a separate gift inventory.

---

# Stage H — Journey failure and persistent road evidence

## Plan candidate — Travelling NPC journey failure evidence

**Suggested domain:** `world` / `npc` / `settlements-npcs` boundary after recon  
**Priority:** high  
**Effort:** L

Goal:

A real merchant-party death/failure leaves persistent, discoverable consequences.

Possible evidence:

- merchant corpse, later bones if ordinary post-death lifecycle supports it;
- dead guard;
- dead donkey/horse;
- abandoned/damaged cart;
- remaining pack/cart cargo;
- dropped personal items;
- signet ring;
- location/time/cause facts required for later investigation.

The evidence must originate from actual owned state.

### Signet ring

Prefer using existing `signet_ring`.

Target rule:

```text
merchant owns signet
→ merchant dies
→ signet remains in normal death/loot ownership path
```

No quest-only duplicate.

### Predator interaction

A narrow systemic extension may allow a scavenging predator involved with the corpse to acquire selected evidence such as the signet.

Potential flow:

```text
merchant corpse
→ predator scavenges
→ signet transfers to that animal/evidence state
→ animal later dies
→ signet becomes recoverable from its corpse
```

Do not create a universal simulated digestive inventory just for this quest.

Exact ownership should be decided during recon against current fauna feeding/corpse/loot systems.

### Failure invariants

- no merchant respawn merely because home settlement reloads;
- cargo does not teleport to destination;
- guards/animals remain genuinely dead if killed;
- quest discovery is not required for evidence persistence.

---

# Stage I — Missing Merchant quest package

## Plan candidate — Missing merchant investigation

**Suggested domain:** `quests-progression`  
**Priority:** high  
**Effort:** L  
**Depends on:** Travelling Merchant + journey failure evidence

The quest observes real world state.

Possible starts:

### A. Discovery-first

```text
player discovers corpse/cart/evidence
→ identifies merchant
→ quest/problem becomes known
```

### B. Missing-arrival-first

```text
expected journey does not arrive
→ family / guard / Trader / destination settlement notices
→ investigation quest
```

Possible objectives are selected from the actual event:

- locate merchant;
- identify corpse;
- recover signet;
- recover cargo;
- recover or inspect cart;
- determine cause;
- locate responsible predators/bandits;
- kill specific threat;
- clear den/camp where justified.

Do not force every occurrence through the same authored checklist.

### Quest giver

Depending on real social/world context:

- family member;
- home guard;
- another Trader;
- destination settlement representative;
- other NPC with a justified relationship/role.

---

# Stage J — Dangerous route and persistent consequence

## Existing roadmap direction

`quests-professions-and-world-consequences.md` already contains:

- Travelling Merchant — Missing transport;
- Travelling Merchant — Dangerous road.

This roadmap refines the prerequisites for those quests.

## Plan candidate — Dangerous merchant route

**Suggested domain:** `quests-progression`  
**Priority:** medium-high  
**Effort:** L

Target:

```text
real repeated/important route threat
→ merchant/settlement recognizes problem
→ player investigates/removes threat
→ route/world consequence
```

Possible threats:

- predator pack/den;
- bandits;
- another implemented route hazard.

Possible persistent consequence:

- guard post;
- safe camp;
- road stop;
- authored outpost.

Reuse the authored persistent world-consequence foundation where the result is authored rather than fully emergent.

Do not create a quest-specific safe-road flag if a normal world consequence/place can represent the result.

---

# Recommended implementation order

## Wave 1 — Core merchant exists

1. Implement and verify `settlements-npcs-038`.

Do not begin merchant-specific quest content before the same persistent Trader can actually travel and return.

## Wave 2 — Real gear and light cargo

2. Additional weapons and premium variants.
3. NPC weapon choice and worn armor integration.
4. Animal saddlebags / pack inventory.

This wave establishes the physical belongings needed by later merchant profiles.

## Wave 3 — Merchant party

5. Merchant wealth tiers, escort and transport profile.

At this point poor/normal/rich variants can be composed from real NPCs, equipment, animals and cargo.

## Wave 4 — Journey continuity

6. NPC journey provisioning and readiness.
7. Generic NPC travel camp / overnight stay.

This makes long-distance travel believable independently of the player.

## Wave 5 — Social integration

8. NPC desired gifts and relationship reward.

This plan can technically be implemented earlier, but it is grouped here because merchant/guard item desires benefit from the richer equipment catalog.

## Wave 6 — Failure becomes content

9. Travelling NPC journey failure evidence.
10. Missing merchant investigation quest.
11. Dangerous merchant route / persistent route consequence.

This is the target emergent narrative chain:

```text
merchant has a real journey
→ party and cargo exist physically
→ journey can genuinely fail
→ persistent evidence remains
→ people react to the failure
→ quest emerges
→ world may permanently change
```

---

# Dependency outline

```text
settlements-npcs-038
        │
        ├───────────────┐
        │               │
new weapons       NPC equipment/armor
        │               │
        └──────┬────────┘
               │
        pack animal cargo
               │
               ▼
merchant tiers + escorts
               │
               ▼
journey preparation
               │
               ▼
generic travel camp
               │
               ▼
journey failure evidence
               │
               ▼
missing merchant quest
               │
               ▼
dangerous route consequence
```

Desired gifts depend primarily on existing Player → NPC item transfer and relations, but benefit from the new weapon/equipment catalog.

---

# Plan creation policy

This roadmap intentionally does not reserve future plan IDs.

When converting each roadmap item into an implementation plan:

1. read `docs/plans/PLANNING.md`;
2. use the then-current next ID for the owning domain;
3. recon current code and implementation notes again;
4. verify whether earlier waves changed the best ownership boundary;
5. create a focused plan with explicit dependencies;
6. create implementation notes only after current-code recon;
7. keep browser/gameplay verification assigned to the User.

Likely domains:

| Roadmap item | Likely domain |
|---|---|
| Additional weapons and premium variants | `items-player` |
| NPC weapon choice and worn armor | `npc` |
| Animal saddlebags / pack inventory | `fauna` |
| Merchant tiers / escort / transport profile | `settlements-npcs` |
| Journey provisioning/readiness | `npc` or `settlements-npcs` after recon |
| Generic travel camp | `npc` or `world` after recon |
| Desired gifts | `npc` with `quests-progression` relation integration |
| Journey failure evidence | ownership to be resolved by recon; likely `world` + existing NPC/fauna owners |
| Missing merchant quest | `quests-progression` |
| Dangerous route consequence | `quests-progression` consuming normal world consequence mechanisms |

---

# Explicit non-goals for this roadmap

- a second travelling-merchant profession;
- merchant-only inventory;
- merchant-only combat;
- merchant-only food/water meters;
- a new global caravan simulation manager;
- full dynamic trade-route economy;
- universal digestive inventories for fauna;
- disposable escort NPCs;
- quest-only fake cargo;
- quest-only fake corpses;
- duplicating existing Damascus/masterwork weapons without a distinct niche;
- implementing every caravan size/formation before the first poor/normal/rich merchant slice works.

---

# Success criteria

The roadmap is successful when Seedvale can produce a story like this without spawning fake quest state:

```text
a real Trader prepares a real shipment
→ fills provisions and maintains equipment
→ loads a donkey/cart
→ travels with the protection justified by his wealth
→ rests if the journey requires it
→ encounters ordinary world danger
→ survives and trades

or

→ dies together with part of the party
→ real cargo/equipment/signature belongings remain
→ the world remembers the failed journey
→ relatives/settlements/player can discover what happened
→ recovery/revenge/safety work becomes a quest
→ solving the underlying problem can leave a persistent world consequence
```

The player participates in this chain but does not cause the chain to exist.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
