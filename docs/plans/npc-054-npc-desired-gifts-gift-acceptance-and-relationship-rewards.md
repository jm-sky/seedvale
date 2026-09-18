# Plan: NPC desired gifts, gift acceptance and relationship rewards

**Created:** 2026-09-18
**Status:** `planned` 📋
**Priority:** high · **Effort:** L
**Depends on:** npc-053
**Domain:** `npc`
**Type:** `feature`
**Roadmap:** `quests-travelling-merchant-journeys.md`

## Goal

Dodać system prezentów, w którym NPC:

- może powiedzieć graczowi, o jakim przedmiocie marzy;
- wybiera pragnienie na podstawie profesji i realnego wyposażenia;
- przyjmuje lub odrzuca prezent zależnie od przydatności;
- dostaje realny item do `NpcAuthoritativeState.personalInventory`;
- reaguje dialogiem zależnym od jakości prezentu;
- może zwiększyć relację z graczem;
- nie pozwala farmić relacji przez wielokrotne wręczanie tanich, równych lub gorszych przedmiotów;
- po otrzymaniu lepszego wyposażenia może odłożyć redundantny słabszy gear do własnego household, zamiast bez końca przeciążać `personalInventory`.

Nie tworzyć osobnego gift inventory, gift relation store ani player-only wyjątku dla wyposażenia NPC.

---

## 1. Existing foundations to reuse

Reuse istniejące mechanizmy:

```text
Player Inventory
→ existing Player → NPC transfer
→ NpcAuthoritativeState.personalInventory
```

oraz:

- existing NPC dialogue/menu composition;
- existing one-way Give Item sheet;
- canonical Player↔NPC relation owner/mutation path;
- `npc-053` dla profession-aware weapon/armor selection;
- canonical item definitions, item instances i trade values;
- existing `Household.items` jako realny household-owned item store.

Nie tworzyć:

```text
GiftInventory
GiftManager
GiftRelationshipStore
GiftEquipmentRegistry
```

---

## 2. Core dialogue flow

W odpowiedniej grupie relacyjnej/osobistej dodać:

```text
"Czy jest coś, o czym marzysz?"
"Chcę ci coś podarować..."
```

Flow:

```text
Player pyta o marzenie
→ resolve current desired gift
→ NPC odpowiada konkretnym desire albo "niczego nie potrzebuję"

Player wybiera "Chcę ci coś podarować..."
→ filtered Give Item sheet
→ wybór itemu
→ fresh gift evaluation
→ reject OR accept
→ accepted item trafia do personalInventory
→ optional equipment reconciliation
→ reaction dialogue
→ optional relationship reward
```

Nie tworzyć nowego dialogue systemu ani drugiego item-transfer UI.

---

## 3. Gift categories

Jeżeli current equipment/item metadata nie daje już wystarczającej klasyfikacji, wprowadzić mały gift-domain adapter:

```ts
export type GiftCategory =
  | 'melee_weapon'
  | 'compact_weapon'
  | 'bow'
  | 'ammunition'
  | 'armor'
```

Preferować reuse istniejących capabilities/equipment families z `npc-053` zamiast równoległej klasyfikacji.

---

## 4. Profession preferences

V1:

### Guard

Preferencje:

```text
melee weapon
armor
compact weapon (secondary)
```

### Hunter

Preferencje:

```text
bow
ammunition
light/leather armor
compact weapon (secondary)
```

### Trader / Merchant

Preferencje:

```text
compact weapon
light armor (secondary)
```

Przykładowe progresje:

```text
Guard:
weaker sword → better sword → premium/masterwork sword
weaker armor → better armor

Hunter:
weaker bow → better hunting bow → masterwork hunting bow
basic arrows → better arrow tier
weaker light armor → better light armor

Trader:
knife → dagger → premium/damascus compact weapon
```

Nie wymyślać na siłę pełnego profilu dla każdej profesji. Role bez sensownego V1 progression mogą odpowiedzieć, że obecnie o niczym konkretnym nie marzą.

---

## 5. Desired gift means real upgrade

Resolver bierze:

```text
role
+ current personalInventory
+ npc-053 equipment usefulness/selection semantics
+ meaningful prior gift history
→ desired category/item
```

NPC nie sugeruje przedmiotu gorszego ani równoważnego temu, co już sensownie posiada.

Przykład:

```text
Guard ma short sword
→ może chcieć long sword

Guard ma long sword
→ nie chce short sword

Guard ma najlepszy sensowny sword
→ sword category exhausted
→ spróbuj armor
```

---

## 6. Reuse npc-053 ranking

Gift desire i gift evaluation nie mogą posiadać drugiego niezależnego combat/equipment ranking systemu.

Jeżeli `npc-053` udostępnia lub może udostępnić shared pure helper:

```text
which weapon/armor is better for this NPC role
```

gift system ma go reuse.

Jeżeli potrzebne, wydzielić mały shared helper tak, aby:

```text
npc combat equipment selection
gift desire
gift evaluation
post-gift reconciliation
```

korzystały z tej samej semantyki.

Cena itemu może być tylko secondary signal/tie-break.

---

## 7. Desired gift stability

Desired gift nie zmienia się przy każdym otwarciu dialogu.

Po wybraniu pozostaje stabilne, dopóki:

- NPC dostanie ten item lub lepszy qualifying upgrade;
- item przestanie być upgrade'em z powodu realnej zmiany inventory/equipment;
- dana category zostanie exhausted.

Nie robić runtime losowania przy każdej rozmowie.

---

## 8. Deterministic selection

Jeżeli jest kilka kandydatów:

```text
profession preference priority
→ upgrade magnitude/usefulness
→ stable ItemKind tie-break
```

Jeżeli potrzebna jest różnorodność między NPC, można użyć stable hash z `npcId`, ale nie runtime `Math.random()`.

Ten sam authoritative state → ten sam desire.

---

## 9. Asking about dreams

Przykłady odpowiedzi:

Guard:

```text
"Przydałby mi się porządny miecz."
```

Hunter:

```text
"Marzy mi się naprawdę dobry łuk."
```

Trader:

```text
"Chętnie nosiłbym przy sobie porządny sztylet."
```

Jeżeli resolver wskazuje exact item, odpowiedź może użyć canonical label tego itemu.

---

## 10. No remaining desire

Jeżeli wszystkie V1 categories są exhausted:

```text
"Chyba mam już wszystko, czego mi potrzeba."
```

Nie generować sztucznego gorszego desire tylko po to, by NPC zawsze czegoś chciał.

---

## 11. Gift picker

`Chcę ci coś podarować...` reuse existing Give Item sheet w gift-filter mode.

Picker pokazuje only roughly eligible gifts:

- desired category;
- inne profession-relevant categories;
- meaningful upgrades;
- opcjonalnie relevant equal/slightly weaker items, jeśli mają neutral acceptance.

Nie pokazywać przypadkowych itemów bez semantic reason.

Nie tworzyć osobnego `GiftScreen.vue`.

---

## 12. Gift evaluation

Pure resolver:

```ts
export type GiftReaction =
  | 'reject'
  | 'neutral'
  | 'good'
  | 'excellent'
```

Semantyka:

```text
irrelevant / unwanted
→ reject

profession-relevant, but no meaningful improvement
→ neutral

meaningful useful upgrade
→ good

current desired item OR exceptionally strong useful upgrade
→ excellent
```

---

## 13. Rejection

Reject:

```text
item remains in Player Inventory
no gift memory mutation
no relationship change
```

Przykład:

```text
"To mi się raczej nie przyda."
```

Evaluate first, mutate second. Nie transferować i potem oddawać.

---

## 14. Neutral acceptance

NPC może przyjąć relevant, ale nieznaczący prezent:

```text
"Dziękuję. To miłe z twojej strony."
```

Item trafia do `personalInventory`.

V1 preferencja:

```text
neutral → no relationship reward
```

żeby nie tworzyć łatwego farmingu.

---

## 15. Good and excellent gifts

Good:

```text
meaningful profession-relevant upgrade
→ moderate positive relationship reward
```

Przykład:

```text
"Naprawdę? Bardzo mi się przyda. Dziękuję."
```

Excellent:

```text
current desired gift OR very strong useful upgrade
→ strong positive relationship reward
```

Przykład:

```text
"Od dawna o czymś takim marzyłem. Nie wiem, jak ci dziękować."
```

Exact deltas ustalić dopiero po reconie current canonical relation range/mutation API.

---

## 16. Relationship ownership

Nie dodawać nowego relation store.

Reuse canonical Player↔NPC relation mutation owner.

Nie używać `NpcRelationships` — to osobny NPC↔NPC store.

---

## 17. Anti-farming invariant

```text
same or worse repeated gift
cannot repeatedly generate meaningful relationship reward
```

Resolver bierze pod uwagę:

- current best owned gear;
- best previously accepted meaningful rank;
- current desire.

Przykład:

```text
Guard dostał long sword
→ reward

Player daje drugi long sword
→ neutral/reject
→ no repeated reward
```

---

## 18. Gift memory

Nie przechowywać pełnej historii wszystkich prezentów.

Persistować tylko stan potrzebny do:

- anti-farmingu;
- stabilnego desire;
- pamięci meaningful quality nawet jeśli item później opuści personal inventory.

Candidate shape:

```ts
export type NpcGiftMemory = {
  desiredGift?: ItemKind
  bestAcceptedRankByCategory?: Partial<Record<GiftCategory, number>>
}
```

Final shape dopasować do `NpcAuthoritativeState` i finalnego rank API z `npc-053`.

Nie tworzyć osobnego save registry.

---

## 19. Same ItemKind can still be an upgrade

Tam, gdzie item instances mają meaningful quality/condition:

```text
same ItemKind != automatically same gift quality
```

Lepsza realna instance może kwalifikować się jako upgrade, jeśli `npc-053` również uznaje ją za lepsze wyposażenie.

---

## 20. Ammunition is consumable

Ammo nie może farmić relacji paczkami tego samego tieru.

V1:

- first meaningful ammo-tier improvement może dać reward;
- kolejne ilości tego samego lub gorszego tieru → neutral;
- relation reward nie skaluje się liniowo z liczbą strzał.

---

## 21. Accepted item uses real personal inventory

Accepted item zawsze trafia do:

```text
NpcAuthoritativeState.personalInventory
```

Nie tworzyć:

```text
equippedGift
giftSlot
giftInventory
```

`npc-053` wybiera z tego samego inventory realnie używany weapon/armor.

---

## 22. Post-gift equipment reconciliation

Accepted equipment gift może zmienić preferred combat loadout.

Po udanym transferze:

```text
gift accepted into personalInventory
→ resolve preferred equipment using npc-053 semantics
→ identify redundant lower-quality gear in affected category
→ attempt deposit of eligible surplus into owning Household.items
```

Cel: NPC nie powinien po kilku prezentach bez końca nosić wielu zastąpionych mieczy, łuków i pancerzy.

---

## 23. Reconcile only affected category

Nie skanować i nie reorganizować całego NPC inventory po każdym prezencie.

Przykłady:

```text
gift = sword
→ reconcile melee weapon category

gift = bow
→ reconcile ranged/bow category

gift = armor
→ reconcile affected armor family
```

Bounded reconciliation ogranicza side effects.

---

## 24. Surplus gear eligibility

Do household można przenieść tylko redundant equipment.

Nigdy nie odkładać automatycznie:

- active/best weapon;
- active/best armor;
- provisions;
- money;
- quest/story items;
- tools potrzebnych profesji;
- unrelated personal belongings.

Ammo zwykle pozostaje jako zapas; nie traktować stacka jak replaceable single equipment.

---

## 25. Household deposit rules

Preferowany destination:

```text
NPC own Household.items
```

Jeżeli NPC nie ma owning household albo destination jest niedostępne:

```text
keep weaker item in personalInventory
```

Nic nie może zniknąć.

Nie odkładać do arbitrary household.

---

## 26. Household transfer must be atomic

```text
household can accept?
→ yes: personalInventory → Household.items
→ no: keep item in personalInventory
```

Nie robić:

```text
remove from NPC
→ deposit fails
→ item lost
```

Reuse existing inventory/instance transfer primitives where possible.

---

## 27. Personal inventory intent

Po reconciliation:

```text
personalInventory
≈ currently useful personal equipment + personal belongings + provisions
```

nie:

```text
archive of every historical upgrade
```

To jest preference, nie hard requirement: jeśli household nie może przyjąć surplusu, gear zostaje przy NPC.

---

## 28. Desired-gift logic after cleanup

Gift desire nie może polegać wyłącznie na tym, co aktualnie zostało w `personalInventory`.

Jeżeli stary gear trafił do household, NPC nadal pamięta best meaningful gift rank przez `NpcGiftMemory`.

Nie może ponownie zacząć marzyć o niższym tierze tylko dlatego, że poprzedni item został odłożony.

---

## 29. Desired gift fulfilment

Jeżeli accepted gift spełnia current desire:

```text
update best gift memory
→ clear/advance current desire
→ reconciliation may move replaced gear to household
```

Kolejny desire jest resolve'owany dopiero z nowego authoritative state.

---

## 30. Atomic gift commit order

Preferred commit boundary:

```text
revalidate NPC alive/available
→ revalidate Player still owns item
→ fresh gift evaluation
→ atomic Player → NPC transfer
→ update gift memory
→ apply relationship reward
→ reconcile only affected equipment category
→ show reaction
```

Jeżeli item transfer fail:

```text
no gift memory
no relationship reward
no reconciliation
```

Household cleanup failure nie cofa już poprawnie przyjętego prezentu; stary gear po prostu zostaje przy NPC.

---

## 31. Dead/unavailable NPC

Dead NPC nie może receive gift.

Stale UI session / cancelled conversation:

```text
no transaction
```

Fresh revalidation jest obowiązkowa przy commit.

---

## 32. Personality

Big Five/traits nie decydują w V1 o podstawowej usefulness prezentu.

Opcjonalnie mogą wpływać tylko na wording/tone reakcji, jeśli current dialogue architecture to ułatwia.

Profession + real equipment state są primary inputs.

---

## 33. No quest-specific gift rules

System jest systemic.

Nie kodować:

```text
specific NPC name → specific gift
```

Authored quests mogą później reuse system, ale nie są jego source of truth.

---

## 34. Suggested modules

Likely:

```text
src/ai/npcGiftPreferences.ts
src/settlement/npcState.ts
src/app/actions/npcItemTransfer.ts
existing dialogue composition module(s)
existing Give Item sheet/store
existing Player↔NPC relation mutation owner
existing Household lookup/Inventory transfer seams
```

Exact files ustalić podczas implementation notes reconu.

---

## 35. Tests — desire

- same authoritative state → same desire;
- Guard prefers melee/armor;
- Hunter prefers bow/ammo/light armor;
- Trader prefers compact weapon;
- worse/equal items are not suggested as new desire;
- exhausted categories → no desire;
- reopening dialogue does not reroll desire.

---

## 36. Tests — evaluation

- irrelevant item → reject;
- relevant but non-upgrade → neutral;
- meaningful upgrade → good;
- current desired gift → excellent;
- repeated same/lower tier → no meaningful reward;
- better instance of same kind can qualify when shared equipment ranking says it is better.

---

## 37. Tests — transfer

- reject leaves Player item untouched;
- accepted gift moves exactly once;
- exact instance identity/state preserved;
- accepted item lands in `personalInventory`;
- failed transfer changes neither memory nor relation.

---

## 38. Tests — relationship

- reject → no change;
- neutral → no farming reward;
- good → medium reward;
- excellent → stronger reward;
- same/worse repeated gift → no repeated meaningful reward;
- save/load does not reset anti-farming state.

---

## 39. Tests — reconciliation

- better sword accepted → best sword stays with NPC;
- replaced weaker sword moves to own `Household.items` when legal;
- better bow behaves analogously;
- armor behaves analogously;
- unrelated personal items stay untouched;
- ammo does not get discarded as replaced equipment;
- no household → old gear stays with NPC;
- destination cannot accept → old gear stays with NPC;
- failed household deposit never loses item;
- only affected category is reconciled.

---

## 40. Tests — persistence

Save/load preserves:

- current desire if still valid;
- best meaningful gift history;
- no repeated reward;
- accepted item ownership;
- post-reconciliation inventory/household ownership.

Legacy NPC state defaults safely to no gift memory.

---

## 41. Explicit non-goals

Nie implementować:

- romantic relationships;
- birthdays;
- gifting animals;
- gifting land/houses;
- bribery;
- NPC→NPC gifts;
- random luxury-preference system;
- crafting/wrapping presents;
- quest-specific hard-coded gift lists;
- selling accepted gifts back to Player as a special gift mechanic;
- general whole-inventory cleanup pass;
- arbitrary relocation of personal belongings to household;
- new equipment registry.

---

## 42. Definition of done

Plan jest wykonany, gdy:

- dialogue ma pytanie o current desired gift;
- NPC odpowiada konkretnym desire albo że niczego nie potrzebuje;
- desire wynika z profession + real equipment/inventory + meaningful gift memory;
- desire jest stabilny między rozmowami;
- `Chcę ci coś podarować...` reuse existing Give Item UI;
- picker filtruje roughly eligible gifts;
- NPC może reject / neutral / good / excellent;
- reject nie zabiera itemu;
- accepted item trafia do realnego `personalInventory`;
- relationship reward korzysta z canonical relation ownera;
- excellent daje wyraźnie większy reward niż good;
- repeated same/worse gifts nie farmią relacji;
- `npc-053` semantics są authority dla weapon/armor usefulness;
- po accepted equipment upgrade redundant weaker gear może atomically trafić do own `Household.items`;
- cleanup dotyczy tylko affected category;
- cleanup failure nigdy nie usuwa itemu;
- NPC bez household zachowuje surplus gear;
- gift memory zapobiega regresji desire po odłożeniu starego gearu;
- persistence zachowuje minimalny gift state potrzebny do consistency/anti-farmingu.

Manualne/browser gameplay verification wykonuje User.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
