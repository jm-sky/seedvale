# Plan: Medicine targeted treatment for player, NPCs and livestock

**Created:** 2026-09-17
**Status:** `planned` 📋
**Priority:** medium · **Effort:** L
**Depends on:** ~~items-player-021~~, ~~npc-025~~, ~~items-player-043~~
**Domain:** `items-player`  
**Type:** `feature`  
**Roadmap:** `physical-attributes-health-and-medicine`   

## Cel

Dodać pierwszy pełny, wspólny vertical slice aktywnego leczenia przez gracza z użyciem skilla `Medicine`:

- self-treatment gracza,
- leczenie NPC,
- leczenie livestock,
- leczenie bez materiałów jako ograniczona stabilizacja,
- leczenie z materiałami medycznymi (`injuryTreatment`),
- opcjonalne narzędzia medyczne jako bonus do skuteczności i/lub dostępności bardziej zaawansowanych procedur,
- XP `Medicine` wyłącznie za rzeczywiście wykonane, skuteczne leczenie.

Nie tworzyć osobnego systemu „leczenia konia”, osobnego modelu ran dla każdego typu encji ani player-only healing pipeline. Wspólne powinny być semantyka urazu, kwalifikacja treatmentu i obliczenie efektu; ownership stanu pozostaje lokalny dla Player/NPC/Animal.

## Stan obecny

### Player skills / targeted actions

`src/player/PlayerSkills.ts` zawiera już `medicine` jako `SkillId` oraz klasyfikuje go jako `targeted`.

`src/interaction/targetedSkillAction.ts` pokazuje na `SkillsScreen` wyłącznie skill mający realnego consumera. Obecnie istnieją tylko:

- `traps → inspect-trap`,
- `repair → repair-camp`.

Dlatego `Medicine` jest poprawnie ukryte do czasu dodania rzeczywistej akcji gameplay.

### Injury model

`src/shared/injurySeverity.ts` jest wspólnym źródłem semantyki ran:

```text
none
minor
serious
critical
```

Severity jest derived z authoritative `physicalInjury / maxHp` i nie jest persistowane osobno.

Obecne progi:

```text
serious >= 25% maxHp outstanding injury
critical >= 55% maxHp outstanding injury
```

`physicalInjury` ma oznaczać wyłącznie healable physical damage, a nie dowolny brak HP.

### NPC

NPC posiada już authoritative:

- `health`,
- `physicalInjury`,
- `injuryRecoveryUpdatedAtDays`.

Self-healing NPC używa istniejącego injury severity + inventory treatment selection + `beginHeal()`.

### Player

Player posiada `HealthState`, ale nie ma obecnie pełnego authoritative `physicalInjury` podłączonego do damage/healing flow.

### Fauna / livestock

`AnimalAgent` jest authoritative ownerem health i stanu konkretnego zwierzęcia. Livestock jest zwykłym `AnimalAgent` z persistence, a nie osobnym typem agenta.

Fauna nie ma obecnie wspólnego odpowiednika NPC-owego `physicalInjury` używanego przez shared injury resolver.

### Treatment items

`src/items/itemCatalog.ts` posiada już niezależne metadata:

```ts
injuryTreatment?: {
  immediateHp: number
  maxSeverity: TreatableInjurySeverity
}
```

To jest właściwy mechanizm dla materiałów/opatrunków leczących fizyczne urazy. Nie rozszerzać zwykłego `consumable.need === 'health'` tak, aby każdy health consumable automatycznie stawał się wound treatment.

`items-player-043` dodatkowo wprowadził bounded wpływ `Medicine` na medicinal treatment effectiveness. Recon implementacji powinien zdecydować, czy obecny resolver można rozszerzyć/reużyć dla wound treatment bez mieszania condition-treatment z injury-treatment.

## Główna zasada architektoniczna

Rozdzielić:

```text
Medicine skill
= kompetencja leczącego

medical tool
= niezużywalne wsparcie procedury / bonus kompetencji

injuryTreatment item
= zużywalny materiał o konkretnej skuteczności i maxSeverity

physicalInjury
= authoritative stan rany celu
```

Docelowy przepływ:

```text
actor + target
      ↓
Medicine targeted action
      ↓
current target injury + severity
      ↓
available treatment mode
      ↓
Medicine competence
+ optional medical tool
+ optional injuryTreatment material
      ↓
shared treatment resolution
      ↓
actual HP restored
      ↓
physicalInjury reduced by actual restored HP
      ↓
Medicine XP if real treatment happened
```

## Zakres

### 1. Player physical injury state

Dodać authoritative `physicalInjury` dla Player.

Wymagania:

- physical damage przyjęte przez playera zwiększa `physicalInjury` o faktycznie utracone HP,
- healing fizycznej rany zmniejsza `physicalInjury` o faktycznie przywrócone HP,
- generic HP healing, które nie jest leczeniem rany, nie może automatycznie usuwać physical injury bez jawnej decyzji w istniejącym health pipeline,
- severity zawsze pochodzi z `resolveInjurySeverity()`.

Nie tworzyć Player-specific severity thresholds.

### 2. Livestock physical injury state

Rozszerzyć `AnimalAgent` o authoritative `physicalInjury` przynajmniej dla persisted livestock.

Preferowany kierunek:

- ten sam accounting helper `increaseInjuryFromDamage()` / `decreaseInjuryFromHeal()`,
- ten sam `resolveInjurySeverity()`,
- livestock persistence zapisuje authoritative injury amount,
- restore nie persistuje derived severity,
- wild fauna może używać tego samego runtime field, jeśli koszt jest mały i nie wymaga persistence.

Nie dodawać osobnego `LivestockHealthState`.

### 3. Shared treatment resolver

Wydzielić mały shared resolver opisujący jedną próbę aktywnego leczenia.

Orientacyjny kontrakt do dopasowania do aktualnego stylu kodu:

```ts
type PhysicalTreatmentMode =
  | 'stabilize'
  | 'material'

type PhysicalTreatmentInput = {
  physicalInjury: number
  maxHp: number
  medicineSkill: number
  toolBonus?: number
  treatment?: {
    immediateHp: number
    maxSeverity: TreatableInjurySeverity
  }
}

type PhysicalTreatmentResult = {
  allowed: boolean
  restoredHp: number
  injuryFloor: number
  consumedTreatment: boolean
  reason?: 'no-injury' | 'severity-unsupported' | 'requires-material' | 'requires-tool'
}
```

Nie przywiązywać shared resolvera do Player/NPC/Animal klas.

Resolver nie powinien sam mutować health/inventory. Ma zwrócić deterministyczny wynik, a adapter domenowy stosuje wynik do authoritative ownerów.

### 4. Leczenie bez materiałów

`Medicine` ma być użyteczne nawet bez przedmiotów.

Bare-hands treatment działa jako **stabilizacja**, nie pełne leczenie.

Docelowa polityka v1:

```text
minor
→ można częściowo leczyć bez materiałów

serious
→ można częściowo leczyć bez materiałów,
  ale nie przejść poniżej ustalonego floor bez treatment material

critical
→ można ustabilizować do granicy critical → serious,
  ale nie zejść poniżej tej granicy bez odpowiedniego materiału
```

Dla `critical` wykorzystać istniejący próg `criticalInjuryFloor(maxHp)` zamiast powielać `0.55 * maxHp`.

Dla `serious` recon ma zdecydować, czy bare-hands floor powinien być dokładnie granicą `serious → minor`, czy konserwatywnie pozostać wewnątrz serious band. Decyzję zapisać jawnie w implementation notes/testach.

Bare-hands nie zużywa inventory itemu.

### 5. Injury treatment materials

Reuse istniejącego:

```ts
ITEM_CATALOG[kind].injuryTreatment
```

Materiały określają:

- bazową potency przez `immediateHp`,
- maksymalną severity przez `maxSeverity`.

Nie tworzyć drugiej listy „medical items”.

Targeted treatment powinien wyszukać odpowiedni treatment w inventory gracza przez istniejące katalogowe helpery albo mały współdzielony selector oparty o `injuryTreatment`.

Jeżeli więcej niż jeden item pasuje, preferować deterministycznie najmniejszy wystarczający treatment zamiast automatycznie marnować najlepszy materiał, o ile obecny Inventory API pozwala to zrobić bez równoległego sortowania.

### 6. Medical tools

Dodać declarative item capability, jeśli recon potwierdzi brak istniejącej capability nadającej się do leczenia.

Preferowany kierunek:

```ts
'medical_treatment'
```

Tool jest niezużywalny przez sam fakt wykonania treatmentu.

Nie wiązać leczenia z konkretnym `ItemKind` (`kind === ...`).

V1 może mieć jeden medical tool tier. Metadata jakości/bonusu powinny powstać dopiero wtedy, gdy istnieje realny item wymagający różnego tuningu.

Tool ma wspierać jeden lub oba mechanizmy:

1. bonus do effective Medicine competence,
2. hard requirement dla bardziej zaawansowanej procedury.

Nie dodawać globalnego equipment-bonus framework tylko dla Medicine.

### 7. Medicine effectiveness

Skill `Medicine` ma wpływać na wynik treatmentu.

Preferować bounded multiplier zamiast liniowego `healing = base * medicine`.

Wymagania:

- novice nadal potrafi wykonać podstawową pomoc,
- wysoki skill wyraźnie poprawia wykorzystanie materiału,
- wynik jest bounded i deterministyczny,
- skill/tool nie mogą obejść `maxSeverity` treatment itemu,
- skill nie może obejść hard floor stabilizacji bez materiałów.

Przed implementacją sprawdzić `src/player/medicinalTreatmentEffectiveness.ts` oraz `src/player/skillEvaluation.ts` i reużyć istniejący wzorzec tam, gdzie nie miesza semantyki poisoning treatment z wound treatment.

Nie tworzyć drugiego konkurencyjnego modelu effective Medicine, jeśli obecny evaluation seam wystarczy.

### 8. Targeted Medicine consumer

Rozszerzyć `src/interaction/targetedSkillAction.ts` o realny Medicine consumer.

Dodać nowe action family, np.:

```ts
'provide-medical-treatment'
```

Obsługiwane cele v1:

- Player/self,
- żywy NPC,
- żywy livestock.

Nie dopuszczać corpse/dead target.

Wild fauna pozostaje poza zakresem player-facing Medicine v1, chyba że obecny Interactable seam nie pozwala sensownie odróżnić domestic/owned livestock od wildlife. W takim przypadku recon ma dodać jawny ownership/domestic gate, nie `kind` allowlistę w UI.

Po dodaniu realnego consumera `listActionablePlayerSkills()` automatycznie zacznie pokazywać `Medicine` na `SkillsScreen.vue`. Nie hardcodować Medicine w Vue.

### 9. Self-treatment interaction

Self-treatment powinno używać tego samego treatment resolvera co NPC/livestock.

Nie budować drugiej inventory action tylko dla self-treatment.

Jeżeli istniejący targeted-skill UX wymaga world target, można dodać mały self-action seam w targeted-skill systemie, ale nie omijać wspólnego `Medicine` selection/state.

Preferowany UX:

```text
Medicine selected
→ możliwość „Lecz siebie” bez world raycast target
```

oraz normalny gaze target dla NPC/livestock.

### 10. Treatment execution i Busy Action

Leczenie nie powinno być instant, jeśli istniejący Busy Action seam może zostać użyty bez ciężkiego refactoru.

Preferowany kierunek:

```text
query
→ sprawdza dostępność

execute
→ rozpoczyna treatment busy action

complete
→ ponownie waliduje target + inventory
→ stosuje treatment
→ zużywa material
→ awarduje XP
```

Pozwala to później spójnie przerywać leczenie ruchem, walką lub utratą targetu.

Jeżeli obecny targeted action API jest synchroniczny, rozszerzyć go minimalnie tak, aby startował istniejącą akcję domenową zamiast mutować HP bezpośrednio.

### 11. Medicine XP

Dodać XP za skutecznie zakończone leczenie.

XP przyznawać wyłącznie gdy:

- treatment zakończył się,
- target rzeczywiście odzyskał HP / physical injury realnie spadło,
- nie był to query/target selection/cancel.

Preferować większe XP dla poważniejszego leczenia przez wyliczony result/severity, ale bez nowego generic XP framework.

Nie awardować XP per frame.

### 12. Existing NPC self-healing

Nie pozostawiać równoległego treatment math dla NPC.

Obecny NPC self-healing powinien po implementacji korzystać z tego samego shared treatment resolvera w zakresie:

- severity suitability,
- material potency,
- physical injury accounting.

NPC nadal ma własną decyzję/pressure/action orchestration i własny inventory owner. Plan nie przenosi NPC decision-making do player treatment systemu.

Jeżeli NPC nie posiada jeszcze `Medicine` competence w modelu gameplay, nie dodawać sztucznego player `PlayerSkills` do NPC. Dla istniejącego self-healing można zachować neutral competence input lub aktualne zachowanie, ale shared resolver ma zostać seamem gotowym pod późniejsze NPC medical competence.

## Hard requirements vs bonusy

V1 ma jawnie rozróżnić:

### Hard requirements

Przykłady:

- treatment item nie obsługuje aktualnej severity,
- przejście poniżej bare-hands floor wymaga treatment material,
- przyszła procedura może wymagać `medical_treatment` capability.

### Soft modifiers

Przykłady:

- Medicine skill zwiększa wykorzystanie materiału,
- medical tool zwiększa effective competence,
- support skill może zostać uwzględniony wyłącznie jeśli ma realne uzasadnienie w istniejącym `skillEvaluation`.

Nie zamieniać niskiego Medicine w uniwersalne „nie możesz leczyć”. Podstawowa pomoc powinna działać także dla novice.

## Ownership

### Player

Authoritative:

- `PlayerController` / istniejący player health owner,
- nowy `physicalInjury` przy tym samym ownerze lub najbliższym istniejącym health-state seam.

### NPC

Authoritative:

- `NpcAuthoritativeState.health`,
- `NpcAuthoritativeState.physicalInjury`,
- NPC inventory owner zgodny z aktualnym self-healing flow.

### Animal / livestock

Authoritative:

- `AnimalAgent.health`,
- `AnimalAgent.physicalInjury`,
- livestock persistence przez istniejący Animal save/capture/restore pipeline.

### Items

Authoritative static treatment metadata:

- `ITEM_CATALOG[kind].injuryTreatment`,
- ewentualna `ItemCapability = 'medical_treatment'`.

### Shared health logic

Pure:

- severity,
- treatment eligibility,
- treatment effectiveness/floor calculation.

Nie przechowywać treatment availability jako osobnego state.

## Persistence

### Player

Jeżeli player health nadal nie jest persistowane na początku implementacji, recon musi sprawdzić aktualny `SaveData` i zdecydować spójnie:

- albo w tym planie persistować player HP + physicalInjury razem,
- albo jawnie pozostawić oba runtime-only i opisać ograniczenie.

Nie wolno persistować `physicalInjury` bez spójnego HP restore, jeśli po reloadzie oba stany mogłyby się logicznie rozjechać.

### NPC

Bez nowego pola severity. Existing `physicalInjury` persistence pozostaje source of truth.

### Livestock

Dodać physical injury do istniejącego persisted animal snapshot/capture/restore path.

Wild fauna nie wymaga persistence w tym planie.

## UI / feedback

Medicine po dodaniu consumera pojawia się automatycznie na Skills Screen.

Prompt powinien rozróżniać przynajmniej:

```text
[E] Opatrz: <target>
[E] Ustabilizuj: <target>
Medicine — brak obrażeń wymagających leczenia
Medicine — potrzebujesz odpowiedniego opatrunku
Medicine — potrzebujesz narzędzi medycznych
```

Nie pokazywać internals takich jak `physicalInjury = 54.8` w normalnym UI.

Jeżeli Perception/observation ogranicza wiedzę gracza o severity celu, targeted action nadal może wiedzieć technicznie, czy treatment jest możliwy, ale presentation nie powinno ujawniać więcej informacji niż aktualny observation system zezwala. Recon powinien sprawdzić ten seam przed dodaniem dokładnych severity labels.

## Relevant files and seams

Zweryfikować przed implementacją co najmniej:

- `src/player/PlayerSkills.ts`
- `src/player/skillEvaluation.ts`
- `src/player/medicinalTreatmentEffectiveness.ts`
- `src/player/PlayerController.ts`
- `src/interaction/targetedSkillAction.ts`
- `src/app/actions/survivalActions.ts`
- `src/shared/injurySeverity.ts`
- `src/shared/HealthState.ts` lub aktualny shared health owner
- `src/items/itemCatalog.ts`
- `src/items/Inventory.ts`
- `src/items/items.ts`
- `src/ai/NpcAgent.ts`
- `src/settlement/npcState.ts`
- `src/fauna/AnimalAgent.ts`
- `src/fauna/animalDefs.ts`
- livestock persistence/capture/restore files wskazane przez aktualny `docs/state/fauna.md`
- `src/persistence/saveData.ts`
- `src/ui-vue/screens/SkillsScreen.vue`
- `src/ui-vue/store.ts`
- existing Busy Action implementation używany przez inne world actions

Nie zmieniać wszystkich tych plików mechanicznie; lista wskazuje seam do reconu.

## Testy

### Shared treatment resolver

- brak injury → treatment niedostępny,
- minor + bare hands → realny, bounded heal,
- serious + bare hands → heal tylko do ustalonego floor,
- critical + bare hands → nie przekracza `criticalInjuryFloor(maxHp)`,
- critical + odpowiedni material → może zejść poniżej critical floor,
- treatment z `maxSeverity: minor` odrzucony dla serious/critical,
- high Medicine daje lepszy wynik niż low Medicine,
- medical tool poprawia wynik / spełnia requirement zgodnie z finalną polityką,
- over-heal nie powoduje negative physicalInjury.

### Player injury accounting

- physical damage zwiększa HP loss i physicalInjury o ten sam accepted physical delta,
- treatment przywraca HP i zmniejsza physicalInjury o actual restored amount,
- non-physical HP changes nie korumpują injury amount.

### NPC

- istniejący self-healing nadal respektuje `injuryTreatment.maxSeverity`,
- self-healing przechodzi przez shared resolver,
- inventory item jest konsumowany dokładnie raz,
- physical injury spada o faktycznie przywrócone HP.

### Livestock

- damage tworzy injury,
- Medicine target query rozpoznaje żywy livestock,
- treatment modyfikuje ten sam AnimalAgent health/injury state,
- save/restore zachowuje physical injury,
- dead animal nie jest treatable target.

### Targeted skills

Oczekiwany wynik po implementacji:

```text
Sneak      visible
Traps      visible
Medicine   visible
Repair     visible
```

Medicine query:

- self → dostępne przy treatable injury,
- NPC → dostępne przy treatable injury,
- livestock → dostępne przy treatable injury,
- healthy target → brak executable treatment,
- wildlife → niedostępne w v1.

### XP

- successful treatment → Medicine XP,
- failed/cancelled query → 0 XP,
- zero actual HP restored → 0 XP,
- item zużyty tylko po successful completion.

## Manual verification

User sprawdza w przeglądarce:

1. Medicine pojawia się na Skills Screen po dodaniu realnego consumera.
2. Ranny player może wybrać Medicine i użyć self-treatment.
3. Ranny NPC może zostać opatrzony.
4. Ranny koń/owca/krowa może zostać opatrzony.
5. Bez materiałów critical injury można ustabilizować tylko do granicy dozwolonej przez resolver.
6. Odpowiedni bandage/treatment pozwala kontynuować leczenie poniżej tego floor.
7. Niedostateczny treatment item nie działa dla zbyt wysokiej severity.
8. Medical tool poprawia wynik albo odblokowuje procedurę zgodnie z finalną polityką.
9. Treatment trwa przez busy action i może zostać przerwany, jeśli finalna implementacja używa Busy Action.
10. Reload zachowuje livestock injury; player persistence zachowuje spójność HP/injury zgodnie z finalną decyzją reconu.
11. NPC self-healing nadal działa i zużywa prawidłowy materiał.

AI nie wykonuje browser verification.

## Non-goals

Nie dodawać w tym planie:

- autonomous NPC doctor treating other NPCs,
- autonomous farmer treating livestock,
- veterinary profession,
- surgery system,
- body-part wounds,
- bleeding/infection wound simulation,
- fractures,
- pain resource,
- wild-fauna rescue gameplay,
- new disease taxonomy,
- global status-effect framework,
- generic equipment-bonus framework,
- osobnych treatment systems dla Player/NPC/Animal,
- redesignu całego NPC healing decision systemu.

Te funkcje mogą później konsumować shared treatment resolver z tego planu.

## Dokumentacja

Po implementacji zaktualizować odpowiednio:

- `docs/state/player-systems.md` — player physical injury + Medicine action,
- `docs/state/npc.md` — shared treatment resolver używany przez self-healing,
- `docs/state/fauna.md` — livestock physical injury + treatment + persistence,
- `docs/items/CATALOG.md` — medical capability/tool oraz treatment semantics,
- `docs/roadmap/physical-attributes-health-and-medicine.md` tylko jeśli rzeczywisty stan fazy 6 wymaga aktualizacji.

Dodać implementation notes zgodnie z `docs/plans/PLANNING.md`, opisujące finalne decyzje dotyczące:

- serious bare-hands floor,
- medical-tool hard requirement vs bonus,
- player HP/injury persistence,
- reuse/rozszerzenie `medicinalTreatmentEffectiveness.ts`,
- dokładny inventory owner użyty przez NPC self-healing.

## Guardrails

- `physicalInjury` pozostaje jedynym authoritative wound amount per entity.
- Severity zawsze jest derived przez shared resolver.
- Treatment materials pochodzą z `ITEM_CATALOG.injuryTreatment`.
- Medical tools używają declarative capability, nie `ItemKind` checks.
- `Medicine` nie omija `maxSeverity` treatment itemu ani hard treatment floor.
- Query targeted action nie mutuje świata.
- Item consumption, HP restore, injury decrease i XP award następują atomowo po skutecznym completion.
- Nie persistować derived severity ani treatment availability.
- Player, NPC i Animal zachowują własny authoritative state ownership.
- Nie tworzyć wspólnego God Object typu `HealthManager`/`TreatmentManager`.
- Nie dodawać osobnego player-only ani livestock-only raycast/target systemu.
- Off-screen/living-world independence pozostaje zachowana; shared treatment model ma nadawać się później do autonomous NPC treatment.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
