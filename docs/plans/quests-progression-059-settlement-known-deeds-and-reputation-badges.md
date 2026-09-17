# Plan: Settlement Known Deeds & Reputation Badges

**Created:** 2026-09-17
**Status:** `verification needed` 🔍
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** quests-progression-001, quests-progression-011, items-player-046
**Domain:** `quests-progression`
**Subdomains:** `progression` `relationships` `rewards`
**Tags:** `badges` `reputation` `renown` `known-deeds` `settlements`
**Roadmap:** `quests-and-reputation.md`
**Model:** Sonnet, Composer

## Cel

Rozszerzyć istniejące Reputation Badges / Achievements o **lokalne, settlement-scoped known deeds**: trwałe fakty o powtarzalnym zachowaniu gracza, które społeczność danej osady mogła zauważyć i zapamiętać.

System ma łączyć trzy istniejące mechanizmy zamiast tworzyć równoległą reputację:

```text
real player action
→ opcjonalny, już rozstrzygnięty SocialConsequence
→ opcjonalny socially-known deed dla konkretnej osady
→ lokalny progress/counter
→ threshold
→ settlement badge / achievement
→ opcjonalny jednorazowy bonus reputation/renown
```

Badge ma być trwałym faktem historycznym, nie dodatkowym morality score ani zamiennikiem reputation/renown.

## Stan wejściowy

Repozytorium posiada już:

- `src/badges/badges.ts` — `BadgeManager`, globalne `treasure_hunter` / `relic_seeker`, trwały earned state i event-driven progress;
- `src/reputation/ReputationManager.ts` — per-settlement reputation w pięciu wymiarach oraz renown;
- `SocialConsequence` + `applySocialConsequence()` jako canonical seam dla już rozstrzygniętych społecznych skutków;
- `src/reputation/socialExposure.ts` — social exposure dla grave disturbance;
- `src/fauna/animalCorpse.ts` — player shovel-bury carcass;
- `src/app/actions/medicalTreatmentActions.ts` + `src/player/medicalTreatment.ts` — skuteczne leczenie NPC/livestock;
- `QuestDef.availability.prerequisites` — relation, quest outcome, settlement reputation i renown jako istniejące quest availability gates.

Wcześniejszy globalny `grave_robber` / `desecrator` został celowo usunięty. Nie przywracać go jako globalnego badge. Grave-related known deed musi być lokalny i powstawać wyłącznie wtedy, gdy naruszenie stało się społecznie znane.

## 1. Ownership i model

Rozszerzyć istniejący `BadgeManager`; nie tworzyć `AchievementManager`, `KnownDeedManager` ani drugiego reputation store.

Zachować obecne globalne badges i dodać osobny lokalny stan keyed by `settlementId`.

Docelowy model logiczny:

```ts
type SettlementBadgeId =
  | 'caretaker'
  | 'healer'
  | 'grave_robber'

type SettlementBadgeProgress = {
  earned: SettlementBadgeId[]
  animalCorpsesBuried: number
  entitiesHealed: number
  exposedGraveDisturbances: number
}
```

Dokładny persisted shape dobrać do obecnego `BadgeManager.exportState()` / `SaveData.badges`, ale stan ma pozostać sparse per settlement.

Globalne `BadgeId` (`treasure_hunter`, `relic_seeker`) i settlement badge IDs powinny pozostać typowo rozróżnialne; nie należy udawać, że każdy badge ma ten sam scope.

## 2. Znane czyny, nie magiczna obserwacja

`BadgeManager` nie może samodzielnie skanować świata, NPC, settlementów ani zgadywać, czy czyn stał się znany.

Caller raportuje deed dopiero po rozstrzygnięciu:

- co realnie się wydarzyło,
- z którą osadą zdarzenie jest związane,
- czy istnieje podstawa wiedzy społecznej.

Wprowadzić mały event-driven seam, np. semantycznie:

```ts
recordSettlementDeed(settlementId, deed)
```

lub równoważne typed methods, jeśli będą prostsze i bezpieczniejsze.

Nie wykonywać progress evaluation per-frame.

## 3. Pojedyncza akcja vs próg zauważalności

Pojedyncze działanie **może, ale nie musi** powodować natychmiastowy mały `SocialConsequence`.

To pozostaje decyzją domeny/call-site. Badge system nie nalicza automatycznie reputation za każdą akcję.

Przykładowy model:

```text
1 znany dobry czyn
→ opcjonalnie mała zmiana reputation

5 podobnych znanych czynów
→ badge
→ jednorazowy większy reputation/renown bonus
```

W innych przypadkach pojedyncze działania mogą nie zmieniać reputacji wcale, a społeczność reaguje dopiero po przekroczeniu progu.

Nie wymuszać jednego globalnego schematu balansu dla wszystkich deed types.

## 4. Pierwsze settlement badges

### `caretaker`

Znaczenie: gracz wielokrotnie usuwa problem sanitarny dla konkretnej społeczności.

Pierwszy zakres:

- progress zwiększa player-driven pochowanie/usunięcie animal corpse związane z daną osadą;
- obejmuje szczury i inne zwierzęta, jeśli zdarzenie spełnia settlement/knowledge contract;
- nie liczyć automatycznego decay ani cleanup wykonanego przez NPC;
- nie liczyć tego samego corpse wielokrotnie.

Początkowy threshold: **5** znanych cleanupów. Wartość trzymać jako named/config constant, nie magic number w call-site.

Po osiągnięciu threshold nadać badge i jednorazowy dodatni bonus, preferencyjnie `benevolence` + mały `renown`. Dokładne wartości dobrać przy implementacji wraz z istniejącymi skalami `SocialConsequence`.

### `healer`

Znaczenie: społeczność zna gracza z udzielania skutecznej pomocy medycznej.

Progress zwiększać wyłącznie po **skutecznym** treatment completion (`actualRestored > 0`) dla:

- NPC należącego do settlementu,
- household-owned livestock przypisanego do settlementu.

Nie liczyć self-treatment. Nie liczyć failed/no-op attempt.

Początkowy threshold: **5** skutecznych znanych treatments.

Badge daje jednorazowy dodatni bonus przede wszystkim do `benevolence` / `competence` oraz mały `renown`.

### `grave_robber`

Znaczenie: lokalna społeczność wie, że gracz naruszał groby.

Progress zwiększać **wyłącznie po socially exposed grave disturbance**. Samo tajne kopanie nie daje badge progress.

Nie przywracać globalnego `grave_robber`, `desecrator` ani globalnego `gravesDisturbed`.

Pierwsza wersja może nadać lokalny `grave_robber` już przy pierwszym ujawnionym zdarzeniu albo po małym thresholdzie; przed implementacją dobrać próg na podstawie aktualnej częstotliwości/siły istniejącego `GRAVE_DISTURBANCE_EXPOSURE`. Badge nie może dublować kary za to samo zdarzenie bez świadomego balansu: per-action social consequence i threshold bonus/penalty są dwoma jawnie authored efektami.

## 5. Settlement association

Nie wprowadzać globalnego `currentSettlement` jako źródła prawdy.

Każdy producer deed ma używać istniejącego authoritative context:

- exposed grave disturbance już posiada settlement context potrzebny do `SocialConsequence`;
- NPC treatment ma wyprowadzać settlement z istniejącej tożsamości/membership NPC, nie z nazwy ani proximity-only heurystyki;
- household-owned livestock ma użyć owner/household → settlement ownership chain;
- carcass cleanup musi zostać przypisany do osady przez istniejący settlement/world spatial context w miejscu, które już rozstrzyga zdarzenie; nie przenosić spatial scan do `BadgeManager`.

Jeśli focused implementation recon ujawni brak canonical read seam dla któregoś z tych przypadków, dodać najwęższy read-only lookup w composition root zamiast duplikować membership state.

## 6. Reputation / renown integration

`ReputationManager` pozostaje jedynym ownerem wartości social standing.

Badge unlock może zwrócić lub wyemitować already-resolved consequence, ale **nie powinien bezpośrednio posiadać ani importować `ReputationManager`**.

Preferowany przepływ:

```text
BadgeManager.recordSettlementDeed(...)
→ returns newly earned badge(s) + optional authored unlock consequence descriptor
→ caller/composition seam
→ applySocialConsequence(reputationManager, consequence)
```

Alternatywnie definicja badge może przechowywać statyczny unlock consequence, jeśli nie tworzy to dependency na runtime manager.

Zapewnić dokładnie-once semantics: ponowne zdarzenia po zdobyciu badge nie mogą ponownie wypłacać unlock bonusu.

## 7. UI

Rozszerzyć istniejący Character Screen, który już prezentuje settlement reputation.

Dla wybranej osady pokazywać zdobyte lokalne badges obok/poniżej reputation i renown.

Minimalny model:

```text
Lipowo
Reputation ...
Renown ...

Known deeds
🧹 Opiekun osady
🩺 Uzdrowiciel
🪦 Hiena cmentarna
```

Nie tworzyć osobnego Achievements Screen w tym planie.

Locked/hidden settlement badges nie muszą być widoczne przed zdobyciem. Nie ujawniać thresholdów w UI, jeśli badge ma działać jako odkrycie zachowania gracza.

Globalne badges zachować zgodnie z obecnym UI; nie mieszać ich semantycznie z badge konkretnej osady.

## 8. Persistence

Rozszerzyć istniejące `SaveData.badges` / `BadgeManagerInitial`, zachowując obecne globalne badges i `hiddenFindsFound`.

Persistować tylko stan potrzebny do ciągłości:

- earned settlement badge IDs,
- per-settlement counters, których nie da się bezpiecznie odtworzyć z innego authoritative ledger.

Nie persistować pochodnego `available`, `bonusApplied` ani osobnych reputation snapshots, jeśli exactly-once unlock wynika z `earned`.

Save/load oraz New Game muszą poprawnie zachować/resetować lokalny progress.

Jeśli shape wymaga save migration, wykonać standardową wersjonowaną migrację zamiast silent reinterpretation starego pola.

## 9. Quest integration — przygotowanie, nie content

Ten plan **nie dodaje jeszcze questów zależnych od badges**.

Ma jednak utrzymać badge state w formie nadającej się do późniejszego użycia przez canonical quest availability, bez tworzenia osobnego quest-state mirror.

Późniejszy plan może rozszerzyć `QuestPrerequisite` o np.:

```ts
{ type: 'settlement_badge', badgeId: 'healer' }
```

Evaluation powinno wtedy użyć istniejącego `QuestDef.settlementId` analogicznie do reputation/renown prerequisite.

Nie dodawać tego prerequisite tylko „na zapas”, jeśli żaden quest jeszcze go nie konsumuje. Kierunek zapisać w `docs/vision/quests.md`.

## 10. Testy

Dodać/rozszerzyć testy przede wszystkim przy badge domain i call-site integrations.

Pokryć co najmniej:

- globalne istniejące badges pozostają bez zmian;
- progress jest niezależny dla dwóch settlement IDs;
- `caretaker` unlock dokładnie na thresholdzie;
- ten sam event nie generuje wielokrotnego unlock bonusu;
- NPC/automatic corpse cleanup nie nalicza player badge;
- `healer` liczy tylko successful NPC/livestock treatment, nie self/no-op;
- livestock/NPC deed trafia do właściwego settlementu;
- tajne grave disturbance nie zwiększa lokalnego grave progress;
- exposed grave disturbance zwiększa progress właściwej osady;
- save/load zachowuje earned + counters;
- New Game resetuje lokalny progress;
- Character Screen pokazuje tylko badges wybranej osady.

## 11. Non-goals

Poza zakresem:

- nowe questy odblokowywane badge,
- generic achievement rule engine / DSL,
- global morality/alignment,
- automatyczne reputation za każdą akcję gracza,
- per-frame world scans,
- NPC dialogue reactions na każdy badge,
- ekonomiczne bonusy/ceny wynikające z badges,
- badge tiers typu bronze/silver/gold,
- leaderboard / meta achievements,
- zastępowanie reputation/renown badge'ami.

## 12. Dokumentacja i JSDoc

Zaktualizować canonical docs opisujące BadgeManager, persistence i Character Screen, jeśli implementacja zmieni ich kontrakt.

Dla nowych publicznych/architektonicznych seams dodać JSDoc z odpowiednim `@domain quests-progression` i jasnym ownershipem, aby były wykrywalne przez preflight.

Manual browser verification wykonuje User. AI nie uruchamia browser verification.

Nie uruchamiać `pnpm docs:sync` ręcznie — robi to GitHub workflow.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
