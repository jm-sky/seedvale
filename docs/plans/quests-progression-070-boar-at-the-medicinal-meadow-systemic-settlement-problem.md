# Plan: Boar at the medicinal meadow — systemic settlement problem

**Created:** 2026-09-18
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** npc-057, world-terrain-042
**Domain:** `quests-progression`
**Subdomains:** `quests` `world-problems` `settlement`
**Tags:** `boar` `herbs` `fauna` `npc` `world-state`
**Roadmap:** -
**Model:** Sonnet, Composer

## Goal

Przebudować istniejący quest `dzik-przy-szlaku`, aby wynikał z realnego stanu świata zamiast z narracyjnej abstrakcji.

Obecnie:

```text
tekst mówi o dziku blokującym szlak
→ quest binduje dowolnego żywego boara
→ gracz zabija go
→ tekst twierdzi, że szlak znów jest przejezdny
```

Docelowo:

```text
realna produktywna polana ziół
→ realny mieszkaniec ma powód tam chodzić
→ konkretny persistent boar mieszka przy tej polanie
→ NPC ocenia destination jako zbyt niebezpieczne
→ realny problem istnieje jeszcze przed ofertą questa
→ Marek oferuje quest dotyczący tego konkretnego problemu
→ gracz usuwa konkretnego dzika
→ problem dzika zostaje rozwiązany
→ NPC przy kolejnej decyzji ponownie ocenia bezpieczeństwo
→ jeśli nie ma innych zagrożeń, faktycznie może wrócić po zioła
```

Quest obserwuje i opisuje świat. Nie jest właścicielem polany, dzika ani bezpieczeństwa destination.

## 1. Existing quest to replace

`src/quests/quests.ts` zawiera obecnie:

```text
dzik-przy-szlaku

Marek
→ talk_to_npc Piotr
→ kill_target_animal boar
→ report to Marek
```

Narracja mówi o:

- szlaku,
- mieszkańcach omijających teren,
- udrożnieniu trasy po śmierci dzika.

Nie istnieje jednak odpowiadający temu world state:

- realny blocked route,
- realny ruch mieszkańców po tej trasie,
- concrete problem location,
- związek wybranego boara z tym miejscem.

Usunąć narrację o blokowaniu szlaku.

Przebudować istniejący `dzik-przy-szlaku` zamiast dodawać drugi, równoległy quest. Zachować istniejący quest id tam, gdzie nie koliduje to z lifecycle/persistence istniejących save'ów.

## 2. Dependency: real medicinal meadow

`world-terrain-042` dostarcza:

- `medicinalMeadowSuitability`,
- productive-patch classification,
- bounded nearby meadow lookup,
- real `mint` / `yarrow` / `herb` world items.

Quest musi korzystać z realnego productive patch.

Preferowany wybór:

```text
home settlement
→ bounded nearby productive medicinal meadow lookup
→ prefer forest-edge / natural clearing
→ poza settlement core
→ rozsądna odległość od osady
```

Quest nie może:

- tworzyć własnej polany,
- generować quest-only herbs,
- przechowywać osobnej meadow inventory,
- materializować chunków tylko po to, żeby znaleźć miejsce.

Jeżeli `world-terrain-042` nie znajduje odpowiedniego patcha, problem nie powinien istnieć.

## 3. Stable medicinal meadow identity

`world-terrain-042` jest właścicielem stable patch identity. Ten plan tylko konsumuje jego contract i nie może implementować drugiego systemu meadow identity w questach.

Preferowany contract dependency:

```ts
type MedicinalMeadowRef = {
  patchKey: string
  x: number
  z: number
}
```

`patchKey` musi być:

- deterministic dla tego samego world seed i lookup context,
- derivable bez persistence,
- niezależny od float string formatting,
- stabilny między save/load i `WorldBundle` rebuild.

Nie budować identity w tym planie jako:

```text
`${x}:${z}`
```

na podstawie runtime floatów.

Exact format i sposób derivation należą do `world-terrain-042`.

## 4. Affected NPC selection

Affected NPC to mieszkaniec, któremu dzik rzeczywiście przeszkadza w korzystaniu z polany.

Selection:

```text
1. living adult Herbalist in home settlement
2. otherwise Anna
```

Nie używać:

- spouse Huntera,
- przypadkowego dorosłego,
- family-member heuristics.

### Herbalist

Jeżeli osada posiada żywego dorosłego Herbalista:

- jest affected NPC,
- po rozwiązaniu problemu korzysta z normalnego `planHerbalistWork()`,
- nie potrzebuje quest-specific activity.

### Anna fallback

Anna pozostaje:

```text
role === farmer
```

Nie zmieniać jej profesji.

Jeżeli nie ma Herbalista, narracja może mówić, że Anna zbiera medicinal herbs dla gospodarstwa/domowych potrzeb, ale aktywność musi być prawdziwa i ograniczona zgodnie z §19.

## 5. Real problem exists before quest acceptance

Nie tworzyć dzika w momencie akceptacji questa.

Preferowany lifecycle:

```text
WorldBundle composition
→ real medicinal meadow selected
→ meadow-associated fauna habitat/spawner created
→ persistent problem boar declared
→ boar physically exists in world
→ NPC destination assessment może widzieć threat
→ quest availability observes unresolved problem
→ Marek may offer quest
```

Dzięki temu:

- gracz może spotkać dzika przed questem,
- NPC może naprawdę unikać polany przed rozmową,
- dzik może umrzeć bez udziału gracza,
- świat nie powstaje dopiero po kliknięciu Accept.

## 6. Reuse existing fauna habitat/spawner path

Nie tworzyć:

- `QuestBoarManager`,
- osobnego incident simulation,
- quest-owned movement logic.

Preferować istniejący `extraHabitatSpawners` path.

Dla wybranej medicinal meadow utworzyć deterministic surface habitat/spawner:

```text
id:
<settlementId>:medicinal-meadow:<patchKey>

position:
selected meadow anchor

kind:
boar

maxPreyCount:
1
```

Najpierw reuse istniejącego `PreySpawner['type']`, który semantycznie najlepiej pasuje do neutralnego surface habitat.

Nowy spawner type można dodać tylko wtedy, gdy:

- closed union faktycznie nie ma właściwego neutralnego typu,
- istniejący typ niósłby błędną gameplay/presentation semantykę.

Jeżeli nowy type jest konieczny, ma być generyczny dla surface habitat, nie nazwany `questBoar`.

## 7. Stable persistent boar identity

Reuse:

`src/fauna/persistentOccupants.ts`

Declare:

```ts
PersistentOccupantDecl {
  habitatId: `<settlementId>:medicinal-meadow:<patchKey>`,
  occupantKey: 'resident',
  kind: 'boar'
}
```

To daje:

```text
stable habitatId + occupantKey
→ stable persistentAnimalId()
→ ordinary AnimalAgent
→ snapshot/hydrate
→ corpse persistence
→ tombstone after permanent removal
```

Nie dodawać nowego SaveData ani persistence systemu.

Ordinary wild fauna pozostaje niepersistowana.

## 8. Problem boar remains an ordinary boar

Nie nadawać mu automatycznie:

- alpha variant,
- dangerous quest trait,
- dodatkowego HP,
- sztucznie podbitego damage,
- quest-only aggression.

To ma być zwykły `boar`, którego problem wynika z:

- realnej lokalizacji,
- bliskości ważnego resource hotspotu,
- realnego destination-risk scoringu.

Jeżeli zwykły boar okaże się systemowo zbyt nieszkodliwy, aby `npc-057` traktował go jako uzasadnione zagrożenie, poprawić ogólną fauna human-danger semantykę dla boara w odpowiednim systemie.

Nie rozwiązywać balance problemu przez quest-specific buff.

## 9. Boar locality

Persistent occupant ma być realnie związany z meadow habitat.

Reuse:

- `spawnPointId`,
- fauna roaming home,
- `currentRoamHome()`,
- existing return/rest/home behaviour.

Required outcome:

```text
problem boar
→ normal fauna behaviour
→ roaming centered around medicinal meadow
→ may leave immediate herb patch temporarily
→ remains meaningfully associated with that area
```

Nie sterować pozycją z questa.

Jeżeli obecny generic roaming radius dla takiego spawnera okaże się zbyt szeroki, rozszerzyć existing habitat/spawner contract o opcjonalną generyczną bounded roam konfigurację.

Nie dodawać quest-specific movement mode.

## 10. Quest materialization observes existing problem

Quest runtime context musi znać:

```text
settlementId
MedicinalMeadowRef / patchKey
affectedNpcId
affected NPC display name
persistent problem boar animalId
```

Preferować istniejący contextual/world-driven quest materialization pattern.

Runtime matching używa:

- stable `NpcId`,
- stable persistent `animalId`.

Nie wracać do runtime matching po display name.

Quest builder nie skanuje fauna co klatkę.

## 11. Marek remains quest giver

Marek pozostaje giverem.

Semantyka:

```text
resident reports dangerous animal
→ settlement guard knows about local problem
→ Marek asks player to help
```

Oferta może mówić:

```text
<affected NPC> chodzi na polanę po zioła.
Od pewnego czasu kręci się tam duży dzik i miejsce zrobiło się zbyt niebezpieczne.
Porozmawiaj z <affected NPC>, wskaże ci polanę.
```

Nie mówić o zablokowanym szlaku.

## 12. Quest flow

### Stage 1 — talk to affected NPC

```text
talk_to_npc affectedNpcId
```

Affected NPC potwierdza:

- rzeczywiście korzysta z tej polany,
- rosną tam realne medicinal herbs,
- dzik jest powodem unikania miejsca,
- wskazuje konkretny area context.

Piotr wypada z questa.

### Stage 2 — remove exact boar

Objective nadal używa exact animal identity:

```text
kill_target_animal
target = persistent problem boar
```

Zabicie innego boara nie postępuje questa.

### Report

Powrót do Marka.

Player line:

```text
Dzika już nie ma.
```

Nie:

```text
Szlak znowu jest przejezdny.
```

## 13. Exact target binding

Nie używać dla tego questa zwykłego:

```text
AnimalTargetResolver('boar')
→ first live boar
```

Context zna stable persistent `animalId` konkretnego occupant slot.

Quest binduje właśnie ten identity.

Generic `kill_target_animal` semantics pozostają exact-target semantics.

Nie zmieniać ich na „dowolny osobnik danego gatunku”.

## 14. External resolution

Świat działa bez gracza.

Problem boar może umrzeć przez:

- NPC,
- inne zwierzę,
- systemic damage,
- gracza przed przyjęciem questa.

### Before quest offer

Jeżeli boar jest już dead/resolved:

```text
quest is not offered
```

Nie odradzać zwierzęcia dla narracji.

### While quest active

Jeżeli boar ginie bez udziału gracza:

```text
world problem resolved externally
```

Quest powinien wejść w truthful alternate outcome, np.:

```text
problem_resolved_externally
```

Ten outcome:

- nie udaje player kill,
- nie daje pełnego combat reward,
- nie daje player-kill courage credit,
- może pozwolić na krótki raport u Marka,
- kończy problem bez failowania gracza za coś, co świat rozwiązał sam.

Reuse istniejący external-resolution quest lifecycle pattern.

## 15. Player kill outcome

Jeżeli gracz zabije exact problem boar:

zachować główny reward:

```text
book_defense_intermediate
```

Zachować zbliżone consequences:

```text
Marek relation +2
competence
courage
benevolence
renown
```

Dodać mały relation gain do affected NPC.

Uważać na generic dangerous-animal/deed reputation, aby nie naliczyć dwukrotnie tego samego czynu.

## 16. NPC destination safety

`npc-057` jest jedynym mechanizmem oceny, czy affected NPC powinien udać się na polanę.

Przed wyprawą:

```text
candidate herb destination
+ bounded local fauna threat snapshot
+ NPC health/equipment/personality
+ gathering activity risk profile
→ acceptable / reject
```

Quest nie dodaje własnych:

```text
if boarAlive
if wolfNearby
if bearNearby
```

jako parallel safety logic.

## 17. Problem resolved != meadow safe

Śmierć problemowego dzika oznacza:

```text
boar incident resolved
```

Nie oznacza:

```text
meadow.safe = true
```

Przykład:

```text
problem boar dead
+ wolves beside herbs
→ quest solved
→ NPC still refuses destination via npc-057
```

Nie dodawać persistent safe flag.

## 18. Herbalist post-resolution behaviour

Jeżeli affected NPC jest Herbalist:

nie dodawać quest-specific work behavior.

Po rozwiązaniu problemu:

```text
normal profession decision
→ planHerbalistWork()
→ candidate herb resources
→ npc-057
→ real harvest
→ household deposit
```

To jest preferowany systemic proof, że problem naprawdę został usunięty.

## 19. Anna fallback: conditional household herb-gather opportunity

Jeżeli affected NPC = Anna:

Anna pozostaje Farmer.

Dodać mały reusable planner/opportunity, np. semantycznie:

```text
planHouseholdHerbGather(...)
```

Nie wywoływać całego `planHerbalistWork()` z fałszywą rolą.

### Activation

Aktywność nie może działać „bo Anna czasem chodzi po zioła” bez żadnego world reason.

Preferować istniejący household need/resource signal, jeśli obecny model już posiada sensowny konsument medicinal herbs.

Jeżeli nie istnieje taki realny household signal, V1 może użyć lekkiego authored/local producer:

```text
home settlement
+ Anna
+ productive meadow
+ cooldown
+ no higher-priority responsibility
→ herb gathering opportunity
```

ale musi być jawnie opisany jako przejściowy producer dla istniejącej realnej aktywności, a nie nowa abstrakcyjna `herbNeed`.

Nie tworzyć fake need tylko po to, aby uruchamiać quest.

### Behaviour

Opportunity:

1. działa okazjonalnie,
2. ma bounded cooldown,
3. nie zmienia profession role,
4. nie nadpisuje workplace,
5. nie przejmuje normalnego farmer schedule,
6. korzysta z realnych medicinal world items,
7. korzysta z `npc-057`,
8. harvestuje przez shared herb-gather seam,
9. przekazuje realny resource do właściwego household/storage path.

### Priority

Aktywność nie może wygrywać z:

- critical needs,
- combat/flee,
- Work Contract / commitments,
- obowiązkową pracą,
- ważniejszym household work.

## 20. Shared herb resource operations

Anna i Herbalist korzystają z tych samych world resources.

Reuse:

`src/world/herbalGathering.ts`

Jeżeli contract jest obecnie zbyt wąski przez samo `queryNearest`, rozszerzyć go zgodnie z `npc-057` o:

- bounded candidate query,
- shared harvest/revalidation.

Nie duplikować:

- resource lookup,
- collection,
- renewable depletion,
- item identity.

## 21. Quest availability

Zachować pacing:

```text
renown >= 10
```

Dodatkowo:

```text
productive medicinal meadow exists
AND
affected NPC exists
AND
persistent problem boar slot is alive/unresolved
```

Jeżeli problem został rozwiązany przed ofertą:

```text
no quest offer
```

Nie respawnować problemu tylko dlatego, że Marek „powinien” mieć quest.

## 22. World composition ownership

Preferowany flow:

```text
build world / home settlement
→ world-terrain-042 selects stable MedicinalMeadowRef
→ stable patchKey determines habitat id
→ compose surface habitat/spawner
→ declare PersistentOccupantDecl
→ createFauna restores/spawns ordinary boar
→ compose world-problem context
→ contextual quest builder consumes stable refs
```

Nie:

```text
QuestManager
→ spawn boar
```

Quest layer nie jest composition authority.

## 23. Persistence

Reuse:

```text
SaveData.persistentHabitatOccupants
SaveData.removedPersistentOccupantSlots
```

No new fauna persistence.

Required:

### Alive

```text
save
→ load
→ same persistent animalId
→ same live state/position/HP
```

### Corpse

```text
save during corpse phase
→ load
→ same corpse lifecycle continues
```

### Tombstone

```text
problem animal permanently removed
→ slot tombstoned
→ load/rebuild
→ not respawned
```

Stable `patchKey` ensures habitat identity survives independently of runtime float formatting.

## 24. Performance guardrails

Hard requirements:

- no per-frame meadow lookup,
- no per-frame quest scan of fauna,
- no scanning all boars for target resolution,
- no repeated world materialization,
- no global medicinal meadow registry,
- no per-frame special loop for Anna,
- no quest-owned polling of boar distance from meadow.

Use:

```text
world composition
→ stable problem references
```

then:

```text
normal NPC decision cadence
→ bounded npc-057 assessment
```

External resolution remains event/state driven through existing animal death / quest lifecycle seams.

## 25. Ownership

```text
world-terrain-042
  owns meadow suitability
  owns productive lookup
  owns stable patchKey / MedicinalMeadowRef

fauna
  owns surface habitat/spawner
  owns ordinary boar behaviour
  owns movement/combat/death/corpse

persistentOccupants
  owns stable occupant identity/save/tombstone

npc-057
  owns destination risk

Herbalist profession
  owns ordinary professional gathering

household herb-gather opportunity
  owns Anna's occasional fallback activity

QuestManager/contextual quest builder
  owns narrative binding
  objectives
  dialogue
  rewards
  outcomes
```

Nie duplikować authoritative state.

## 26. Implementation order

Implementować w trzech zamkniętych etapach, aby fallback Anny nie blokował rdzenia systemowego questa.

### Stage 1 — real meadow problem + persistent boar + quest

- consume `MedicinalMeadowRef` from `world-terrain-042`,
- compose stable meadow habitat,
- reuse `PersistentOccupantDecl`,
- create contextual quest binding,
- replace Piotr/route narrative,
- exact persistent target,
- external-resolution lifecycle,
- save/load.

Po tym etapie quest ma już dotyczyć realnego problemu świata.

### Stage 2 — Herbalist end-to-end

- affected NPC prefers real living adult Herbalist,
- normal Herbalist resource selection integrates `npc-057`,
- unresolved boar can reject meadow target,
- resolved boar allows normal work to resume when otherwise safe.

To jest główny systemic path.

### Stage 3 — Anna fallback

Tylko gdy brak Herbalista:

- Anna is affected NPC,
- add the narrow conditional household herb-gather opportunity,
- reuse shared herbal resource operations,
- integrate `npc-057`,
- do not alter Farmer role/schedule ownership.

Jeżeli Stage 3 wymaga szerszego nowego generic activity framework niż wynika z reconu, nie rozszerzać zakresu Stage 1/2. Udokumentować konkretną przeszkodę i wydzielić ją do follow-up planu; real-meadow/persistent-boar/Herbalist quest path pozostaje wartościowym ukończonym rdzeniem.

## 27. Tests

### Meadow identity / problem composition

1. same seed/context → same `patchKey`,
2. patch identity stable across rebuild,
3. no productive meadow → no problem,
4. same patch → same habitat id.

### Persistent boar

1. stable persistent `animalId`,
2. save/load preserves live occupant,
3. corpse round-trips,
4. tombstone prevents respawn,
5. ordinary habitat fill does not replace reserved slot,
6. boar remains associated with meadow home,
7. boar uses normal species stats/variant.

### Affected NPC

1. living adult Herbalist → selected,
2. no Herbalist → Anna,
3. dead/non-adult Herbalist ignored,
4. deterministic result.

### Quest materialization

1. unresolved problem → quest eligible subject to normal prerequisites,
2. resolved before offer → absent,
3. correct affected `NpcId`,
4. correct persistent animal id,
5. Piotr no longer required.

### Quest flow

1. talk stage uses affected NPC,
2. unrelated boar kill does nothing,
3. exact target player kill progresses,
4. report to Marek completes once,
5. correct rewards/consequences.

### External resolution

1. boar dies before acceptance → no offer,
2. boar dies externally while active → alternate truthful outcome,
3. no full combat reward/courage credit,
4. no rebinding to another boar,
5. no resurrection.

### Herbalist

1. unresolved boar can make meadow herb destination unacceptable,
2. boar removed + otherwise safe → normal gather can resume,
3. wolves/bear remain → destination may stay unsafe.

### Anna fallback

1. Anna remains Farmer,
2. opportunity is conditional/cooldown-bounded,
3. no fake profession mutation,
4. real herb target selected,
5. uses `npc-057`,
6. shared harvest/depletion works,
7. real resource reaches household/storage path,
8. higher-priority needs/work/combat suppress activity.

### Regression

Keep green:

- generic `kill_target_animal`,
- generic `AnimalTargetResolver`,
- persistent habitat occupants,
- fauna spawner lifecycle,
- Herbalist gathering,
- renewable herbs,
- npc-057,
- quest offer capacity/ranking,
- save/load,
- TypeScript/build.

## Non-goals

This plan does not implement:

- global world-problem framework,
- persistence for all wild fauna,
- changing Anna's profession,
- Hunter spouse fallback,
- new boar combat balance specifically for this quest,
- alpha/dangerous quest boar,
- route-risk/path danger,
- danger-aware pathfinding,
- universal medicinal household need,
- map marker for every herb meadow,
- dynamic quests for every dangerous animal,
- Marek patrol behaviour.

## Implementation guidance

Before coding read current:

- `CLAUDE.md`,
- `docs/STATE.md`,
- `docs/state/fauna.md`,
- `docs/state/quests.md`,
- `npc-057`,
- `world-terrain-042`,
- this plan,
- relevant implementation notes.

Reuse especially:

- `src/fauna/persistentOccupants.ts`,
- `src/fauna/createFauna.ts`,
- existing `extraHabitatSpawners`,
- fauna home/roaming semantics,
- `src/world/herbalGathering.ts`,
- contextual quest materialization,
- existing external-resolution lifecycle.

Do not create parallel managers.

Add JSDoc to important architectural/public helpers where useful for preflight discovery, with appropriate `@domain` tags.

AI does not perform browser verification.

## Verification

Automated:

- meadow identity/problem composition tests,
- persistent occupant tests,
- contextual quest materialization tests,
- exact target lifecycle tests,
- external-resolution tests,
- Anna household-herb opportunity tests,
- Herbalist/npc-057 integration regressions,
- save/load,
- TypeScript/build.

Manual browser verification by user:

1. Przed przyjęciem questa problemowy dzik realnie istnieje przy realnej zielarskiej polanie.
2. Marek wskazuje realnego Herbalista albo Annę.
3. Wskazana polana faktycznie zawiera skupisko ziół.
4. Problemowy dzik pozostaje związany z okolicą polany.
5. Zabicie innego dzika nie zalicza questa.
6. Problemowy dzik jest zwykłym boarem, bez ukrytego questowego buffa.
7. Save/Continue zachowuje ten sam problem i identity.
8. Po rozwiązaniu problemu Herbalist może normalnie wrócić po zioła.
9. Bez Herbalista Anna może okazjonalnie realnie zebrać zioła bez zmiany profesji.
10. Inne realne zagrożenia nadal mogą powstrzymać NPC przed wejściem na polanę.
11. Quest nie używa już fikcyjnej narracji o „udrożnieniu szlaku”.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
