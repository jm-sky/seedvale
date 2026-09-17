# Plan: Medicine targeted treatment for player, NPCs and livestock

**Created:** 2026-09-17
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** ~~items-player-021~~, ~~npc-025~~, ~~items-player-043~~
**Domain:** `items-player`
**Subdomains:** `interaction` `items` `player-needs`
**Tags:** `medicine` `injury` `treatment` `livestock`
**Roadmap:** `physical-attributes-health-and-medicine`

## Cel

Dodać pierwszy pełny vertical slice aktywnego leczenia przez gracza z użyciem skilla `Medicine` dla:

- gracza (self-treatment),
- NPC,
- livestock.

Leczenie ma korzystać ze wspólnego modelu urazu i treatmentu, nie z osobnych mechanik dla Player/NPC/Animal. `Medicine` opisuje kompetencję leczącego, materiały medyczne opisują potency i zakres zastosowania, a narzędzia medyczne mogą dawać bonus albo stanowić twardy wymóg dla zaawansowanych procedur.

## Stan obecny

### Skills / targeted actions

`src/player/PlayerSkills.ts` zawiera `medicine` jako `SkillId` z `SKILL_USE.medicine === 'targeted'`.

`src/interaction/targetedSkillAction.ts` wystawia na Skills Screen wyłącznie stance z realnym handlerem lub targeted skill posiadający realnego consumera. Obecnie targeted consumery istnieją tylko dla:

- `traps → inspect-trap`,
- `repair → repair-camp`.

Dlatego `Medicine` jest poprawnie ukryte do czasu dodania rzeczywistej akcji gameplay.

### Injury

`src/shared/injurySeverity.ts` jest wspólnym źródłem semantyki physical injury:

```text
none
minor
serious
critical
```

Severity jest derived z authoritative `physicalInjury / maxHp`, nie jest persistowane osobno. Obecne granice to `serious >= 25% maxHp` oraz `critical >= 55% maxHp`.

NPC ma już authoritative `health`, `physicalInjury` i `injuryRecoveryUpdatedAtDays`. Existing self-healing używa injury severity, katalogowego `injuryTreatment` i `NpcAgent.beginHeal()`.

Player ma `HealthState`, lecz nie ma pełnego authoritative `physicalInjury` spiętego z damage/healing.

`AnimalAgent` jest authoritative ownerem health zwierzęcia; livestock to zwykły persisted `AnimalAgent`. Fauna nie ma obecnie odpowiednika NPC-owego `physicalInjury` używanego przez shared injury resolver.

### Treatment items

`src/items/itemCatalog.ts` ma już:

```ts
injuryTreatment?: {
  immediateHp: number
  maxSeverity: TreatableInjurySeverity
}
```

To pozostaje source of truth dla zużywalnych materiałów leczących fizyczne rany. Nie utożsamiać `consumable.need === 'health'` z wound treatment.

`src/player/medicinalTreatmentEffectiveness.ts` oraz `src/player/skillEvaluation.ts` dostarczają istniejące seams dla bounded wpływu skilla; przed implementacją sprawdzić, które fragmenty można reużyć bez mieszania poisoning treatment z physical-injury treatment.

## Model

Rozdzielić cztery odpowiedzialności:

```text
Medicine skill
= kompetencja leczącego

medical tool
= niezużywalne wsparcie / bonus / requirement

injuryTreatment item
= zużywalny materiał o potency i maxSeverity

physicalInjury
= authoritative stan rany celu
```

Docelowy przepływ:

```text
actor + target
      ↓
Medicine targeted action
      ↓
physicalInjury + derived severity
      ↓
wybór dostępnego treatment mode
      ↓
Medicine competence
+ optional medical tool
+ optional injuryTreatment material
      ↓
shared treatment resolver
      ↓
actual HP restored
      ↓
physicalInjury reduced by actual restored HP
      ↓
Medicine XP if real treatment happened
```

## Zakres

### 1. Player physical injury

Dodać authoritative `physicalInjury` przy istniejącym player health ownerze.

- accepted physical damage zwiększa `physicalInjury` o faktycznie utracone HP,
- physical wound treatment zmniejsza je o faktycznie przywrócone HP,
- severity zawsze liczy `resolveInjurySeverity()`,
- nie tworzyć Player-specific thresholds.

Generic HP recovery nie może przypadkiem usuwać physical injury bez jawnego kontraktu.

### 2. Animal / livestock physical injury

Dodać `physicalInjury` do `AnimalAgent` jako runtime state i użyć tych samych helperów accountingowych co NPC:

- `increaseInjuryFromDamage()`,
- `decreaseInjuryFromHeal()`,
- `resolveInjurySeverity()`.

Livestock persistence ma round-tripować authoritative injury amount w istniejącym animal capture/save/restore pipeline. Severity pozostaje derived. Nie tworzyć `LivestockHealthState`.

Wild fauna może posiadać ten sam runtime field, jeśli nie wymaga to dodatkowego persistence ani drugiego pipeline; player-facing Medicine v1 nadal nie musi pozwalać leczyć wildlife.

### 3. Shared physical-treatment resolver

Wydzielić mały pure resolver niezależny od klas Player/NPC/Animal.

Orientacyjny kontrakt:

```ts
type PhysicalTreatmentMode = 'stabilize' | 'material'

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
  consumeTreatment: boolean
  reason?: 'no-injury' | 'severity-unsupported' | 'requires-material' | 'requires-tool'
}
```

Finalny typ dopasować do obecnego stylu kodu. Resolver nie mutuje health ani inventory; adapter domenowy aplikuje wynik do authoritative ownerów.

### 4. Leczenie bez materiałów — stabilizacja

Bare-hands Medicine ma być użyteczne, ale nie może zastępować materiałów.

Polityka v1:

```text
minor
→ można częściowo leczyć bez materiałów

serious
→ można częściowo leczyć,
  ale nie zejść poniżej ustalonego floor bez materiału

critical
→ można ustabilizować do granicy critical → serious,
  ale nie przejść poniżej niej bez odpowiedniego materiału
```

Dla critical wykorzystać istniejące `criticalInjuryFloor(maxHp)` zamiast powielać `0.55 * maxHp`.

Dla serious podczas implementation-notes reconu ustalić jedną politykę i ją zamknąć: preferowane jest użycie istniejącej granicy `serious → minor` jako floor, chyba że aktualny healing balance uzasadnia konserwatywnie wyższy próg.

Bare-hands treatment niczego nie konsumuje.

### 5. Treatment materials

Reuse:

```ts
ITEM_CATALOG[kind].injuryTreatment
```

`immediateHp` = bazowa potency, `maxSeverity` = twardy limit applicability.

Nie tworzyć drugiego registry medical items.

Inventory selection powinien używać istniejących katalogowych helperów; jeśli kilka treatmentów pasuje, wybór ma być deterministyczny i preferować najmniejszy wystarczający materiał zamiast automatycznie marnować najmocniejszy, o ile obecne API pozwala to zrobić bez równoległej logiki sortowania.

### 6. Medical tools

Jeśli recon potwierdzi brak właściwej istniejącej capability, rozszerzyć `ItemCapability` o operację w rodzaju:

```ts
'medical_treatment'
```

Nie gate'ować po konkretnym `ItemKind`.

V1 może mieć jeden tool tier. Tool może:

- dawać bounded bonus do effective Medicine competence,
- stanowić hard requirement dla bardziej zaawansowanego treatmentu.

Nie tworzyć globalnego equipment-bonus framework tylko dla Medicine.

### 7. Medicine effectiveness

Medicine wpływa na skuteczność leczenia, ale nie omija hard requirements.

Wymagania:

- novice nadal może udzielić podstawowej pomocy,
- wysoki Medicine wyraźnie poprawia wynik,
- multiplier jest bounded i deterministyczny,
- skill/tool nie omija `injuryTreatment.maxSeverity`,
- skill/tool nie omija bare-hands injury floor.

Przed dodaniem nowego wzoru sprawdzić `medicinalTreatmentEffectiveness.ts` i `skillEvaluation.ts`. Reuse obecnego competence/effectiveness seam tam, gdzie semantyka pasuje.

### 8. Medicine targeted consumer

Rozszerzyć `src/interaction/targetedSkillAction.ts` o realny Medicine consumer, np. action family:

```ts
'provide-medical-treatment'
```

Obsługiwane cele v1:

- self/player,
- żywy NPC,
- żywy livestock.

Dead/corpse target jest niedostępny. Wildlife jest poza player-facing v1.

Nie robić allowlisty gatunków w Vue. Dla zwierzęcia użyć istniejącego ownership/domestic/livestock seam.

Po dodaniu realnego consumera `listActionablePlayerSkills()` ma automatycznie pokazać `Medicine` w `SkillsScreen.vue`; nie hardcodować go w UI.

### 9. Self-treatment

Self-treatment używa dokładnie tego samego resolvera co NPC/livestock.

Jeśli aktualny targeted-skill UX wymaga world target, dodać minimalny self-action seam do istniejącego targeted-skill flow zamiast osobnej inventory action.

Preferowany UX:

```text
Medicine selected
→ Lecz siebie
```

oraz gaze/world target dla NPC/livestock.

### 10. Execution / Busy Action

Preferować istniejący Busy Action seam zamiast instant heal:

```text
query
→ availability only

execute
→ start busy treatment

complete
→ revalidate target + inventory
→ apply treatment atomically
→ consume material
→ award XP
```

Pozwala to przerwać leczenie ruchem/walką/utratą celu bez specjalnego treatment state machine.

Jeśli obecny targeted action API jest synchroniczny, rozszerzyć go minimalnie tak, aby uruchamiał domenową akcję zamiast bezpośrednio mutować HP.

### 11. Medicine XP

Awardować XP tylko po successful completion, gdy rzeczywiście zaszło leczenie:

- `actualHpRestored > 0`,
- physical injury realnie spadło.

Query, selection, cancel, failed completion i zero-effect nie dają XP.

Nie awardować XP per frame. Severity może wpływać na wielkość XP przez mały jawny mapping, bez nowego generic XP framework.

### 12. Existing NPC self-healing

Nie zostawiać równoległego treatment math dla NPC.

Obecny `NpcAgent` self-healing ma reużyć shared treatment resolver co najmniej dla:

- suitability severity,
- potency materiału,
- physical injury accounting.

NPC zachowuje własne pressure/decision/action orchestration i inventory ownership. Nie wkładać `PlayerSkills` do NPC.

Jeżeli NPC nie ma jeszcze realnego Medicine competence, istniejący self-healing może użyć neutral competence input lub zachować aktualny efekt przez adapter; resolver ma być gotowy pod późniejszego NPC-healera.

## Hard requirements vs bonusy

### Hard requirements

Przykłady:

- treatment item nie obsługuje aktualnej severity,
- zejście poniżej bare-hands floor wymaga materiału,
- zaawansowana procedura może wymagać `medical_treatment` capability.

### Soft modifiers

- Medicine zwiększa skuteczność,
- medical tool może zwiększać effective competence,
- support skill tylko wtedy, gdy ma realne uzasadnienie i reuse istniejącego `skillEvaluation`.

Niski Medicine nie jest uniwersalnym „nie możesz leczyć”.

## Ownership

- Player: istniejący player health owner + `physicalInjury`.
- NPC: `NpcAuthoritativeState.health` + `physicalInjury` + aktualny inventory owner.
- Animal: `AnimalAgent.health` + `physicalInjury`; persisted dla livestock przez obecny animal snapshot.
- Items: `ITEM_CATALOG[kind].injuryTreatment` + ewentualna `medical_treatment` capability.
- Shared: pure severity/treatment eligibility/effectiveness helpers.

Nie przechowywać treatment availability ani severity jako osobnego authoritative state.

## Persistence

### Player

Recon musi sprawdzić aktualny `SaveData` przed implementacją. Jeżeli player HP nadal nie jest persistowane, nie wolno persistować samego `physicalInjury` i tworzyć po reloadzie niespójnego `(HP, injury)`.

Plan ma przyjąć jedną spójną opcję:

- persistować HP + physicalInjury razem, albo
- pozostawić oba runtime-only i jawnie udokumentować ograniczenie.

Preferować persistence obu wartości, jeśli aktualna migracja SaveData jest lokalna i bezpieczna.

### NPC

Istniejący `physicalInjury` pozostaje source of truth. Nie persistować severity.

### Livestock

Dodać `physicalInjury` do istniejącego persisted animal capture/save/restore path. Wild fauna nie wymaga persistence.

## UI / feedback

Prompty powinny rozróżniać co najmniej:

```text
[E] Opatrz: <target>
[E] Ustabilizuj: <target>
Medicine — brak obrażeń wymagających leczenia
Medicine — potrzebujesz odpowiedniego opatrunku
Medicine — potrzebujesz narzędzi medycznych
```

Nie ujawniać surowego `physicalInjury` w normalnym UI.

Jeśli observation/Perception ogranicza wiedzę o stanie celu, presentation nie może ujawnić dokładniejszej severity niż pozwala obecny observation system.

## Relevant files and seams

Zweryfikować przed implementacją przede wszystkim:

- `src/player/PlayerSkills.ts`
- `src/player/skillEvaluation.ts`
- `src/player/medicinalTreatmentEffectiveness.ts`
- `src/player/PlayerController.ts`
- `src/interaction/targetedSkillAction.ts`
- `src/app/actions/survivalActions.ts`
- `src/shared/injurySeverity.ts`
- aktualny shared health owner / `HealthState`
- `src/items/itemCatalog.ts`
- `src/items/Inventory.ts`
- `src/items/items.ts`
- `src/ai/NpcAgent.ts`
- `src/settlement/npcState.ts`
- `src/fauna/AnimalAgent.ts`
- livestock capture/save/restore seam wskazany przez `docs/state/fauna.md`
- `src/persistence/saveData.ts`
- existing Busy Action implementation używany przez world actions
- `src/ui-vue/screens/SkillsScreen.vue`
- `src/ui-vue/store.ts`

Zmieniać wyłącznie pliki wymagane przez finalny kontrakt.

Dla ważnych nowych publicznych/shared resolverów dodać JSDoc z `@domain`, ownership i invariants tak, aby były łatwe do znalezienia przez preflight.

## Testy

### Shared resolver

- no injury → unavailable,
- minor + bare hands → bounded treatment,
- serious + bare hands → nie przechodzi poniżej floor,
- critical + bare hands → nie przechodzi poniżej `criticalInjuryFloor(maxHp)`,
- critical + odpowiedni material → może przejść poniżej critical floor,
- `maxSeverity: minor` jest odrzucone dla serious/critical,
- high Medicine > low Medicine dla tego samego materialu,
- tool bonus/requirement działa zgodnie z finalną polityką,
- over-heal nie daje negative physicalInjury.

### Player

- accepted physical damage zwiększa HP loss i physicalInjury tym samym rzeczywistym delta,
- treatment zmniejsza physicalInjury o actual restored HP,
- unrelated HP changes nie korumpują injury state.

### NPC

- existing self-healing nadal respektuje `maxSeverity`,
- przechodzi przez shared resolver,
- treatment item konsumowany dokładnie raz,
- physicalInjury spada o actual restored HP.

### Livestock

- damage tworzy physical injury,
- żywy livestock jest prawidłowym Medicine targetem,
- treatment mutuje ten sam `AnimalAgent` health/injury state,
- save/restore zachowuje injury,
- dead animal nie jest treatable.

### Targeted skills

Po implementacji:

```text
Sneak      visible
Traps      visible
Medicine   visible
Repair     visible
```

Medicine:

- self → dostępne przy treatable injury,
- NPC → dostępne przy treatable injury,
- livestock → dostępne przy treatable injury,
- healthy target → brak executable action,
- wildlife → unavailable w v1.

### XP

- successful effective treatment → XP,
- query/cancel/failure → 0 XP,
- zero actual heal → 0 XP,
- material konsumowany dopiero przy successful completion.

## Manual verification

User sprawdza w przeglądarce:

1. `Medicine` pojawia się na Skills Screen.
2. Ranny player może użyć self-treatment.
3. Ranny NPC może zostać opatrzony.
4. Ranny koń/owca/krowa może zostać opatrzony.
5. Bez materiałów critical można ustabilizować tylko do dozwolonej granicy.
6. Odpowiedni treatment material pozwala kontynuować leczenie poniżej floor.
7. Materiał o zbyt niskim `maxSeverity` jest odrzucany.
8. Medical tool poprawia wynik albo odblokowuje procedurę zgodnie z finalną polityką.
9. Busy treatment można przerwać, jeśli finalny implementation seam używa Busy Action.
10. Livestock injury przeżywa save/load; player HP/injury zachowują spójność zgodnie z decyzją persistence.
11. Existing NPC self-healing nadal działa i zużywa właściwy materiał.

AI nie wykonuje browser verification.

## Non-goals

Nie dodawać w tym planie:

- autonomous NPC doctor treating other NPCs,
- autonomous farmer treating livestock,
- veterinary profession,
- surgery,
- body-part wounds,
- bleeding/infection wound simulation,
- fractures/pain resource,
- wild-fauna rescue gameplay,
- nowej disease taxonomy,
- global status-effect framework,
- generic equipment-bonus framework,
- osobnych treatment systems dla Player/NPC/Animal,
- redesignu całego NPC healing decision systemu.

Te funkcje mają później konsumować shared treatment resolver z tego planu.

## Dokumentacja

Po implementacji zaktualizować:

- `docs/state/player-systems.md`,
- `docs/state/npc.md`,
- `docs/state/fauna.md`,
- `docs/items/CATALOG.md`,
- `docs/roadmap/physical-attributes-health-and-medicine.md` tylko jeśli rzeczywisty stan roadmapy wymaga korekty.

Implementation notes mają zamknąć finalne decyzje dotyczące:

- serious bare-hands floor,
- medical tool: bonus vs hard requirement,
- player HP/injury persistence,
- reuse/rozszerzenie `medicinalTreatmentEffectiveness.ts`,
- dokładny NPC inventory owner w self-healing.

## Guardrails

- `physicalInjury` pozostaje jedynym authoritative wound amount per entity.
- Severity zawsze jest derived przez shared `injurySeverity`.
- Treatment materials pochodzą z `ITEM_CATALOG.injuryTreatment`.
- Medical tools używają declarative capability, nie `ItemKind` checks.
- `Medicine` nie omija `maxSeverity` ani hard injury floor.
- Targeted query nie mutuje świata.
- Item consumption, HP restore, injury decrease i XP award są atomowym skutkiem successful completion.
- Nie persistować derived severity ani treatment availability.
- Player, NPC i Animal zachowują własne authoritative state ownership.
- Nie tworzyć `HealthManager` / `TreatmentManager` God Object.
- Nie tworzyć osobnego player-only ani livestock-only target/raycast pipeline.
- Off-screen/living-world independence ma zostać zachowana; shared treatment model powinien później obsłużyć autonomous NPC treatment bez nowej mechaniki.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
