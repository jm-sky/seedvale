# Plan: Character stats

**Created:** 2026-09-09
**Status:** `planned` 📋
**Type:** feature
**Priority:** medium · **Effort:** M
**Depends on:** ~~npc-024~~, ~~npc-025~~, ~~items-player-021~~
**Domain:** `ui-input`
**Subdomains:** `menus` `feedback`
**Tags:** `character` `attributes` `skills` `conditions`
**Roadmap:** -

## Cel

Przebudować ekran **Postać** tak, aby był głównym miejscem prezentacji aktualnego stanu gracza, jego atrybutów, kompetencji oraz aktywnych efektów. Ekran **Skills** ma natomiast służyć wyłącznie do uruchamiania umiejętności, które gracz może świadomie aktywować lub wybrać jako akcję.

Docelowe sekcje Character Screen:

- Stan: HP, Stamina, Vigor, Hunger, Thirst.
- Atrybuty: Strength, Perception, Endurance, Agility.
- Umiejętności: wszystkie skills gracza.
- Effects / Illnesses / Injuries.
- Reputation, Renown i Known-for badges.

## Atrybuty — effective / base

Dla SPEA Character Screen prezentuje `effective / base`, np.:

```text
Strength        55 / 60    [Illness −3] [Fatigue −2]
Perception      60 / 60
Endurance       57 / 60    [Illness −3]
Agility         57 / 60    [Illness −3]
```

- `base` pochodzi z bazowego `PhysicalAttributes`.
- `effective` jest rzeczywistą wartością używaną przez gameplay.
- badge pokazuje zagregowany wpływ jednej kategorii modifierów na dany atrybut.
- Vue nie wylicza effective values ani modifierów.

## Modifier breakdown i agregacja

Badge reprezentuje sumę wpływu kategorii, nie pojedynczy efekt. Dwie choroby dają jeden badge `Illness`, natomiast szczegółowe źródła są widoczne w sekcji stanu zdrowia.

Nie zakładać procentowej reprezentacji. Obecne SPEA używają additive penalties, dlatego przy display scale `0–100` preferowany jest np. `[Illness −3]`. Procent może być użyty dopiero dla źródła, którego rzeczywisty kontrakt jest procentowy.

Kategorie takie jak `illness`, `injury`, `fatigue`, `effect` powinny być metadanymi modifier contribution/source, a nie mapowaniem utrzymywanym w Vue. Nie tworzyć nowych gameplay systems tylko dla tych kategorii.

Przepływ:

```text
authoritative condition / injury / effect
        ↓
modifier contribution
        ↓
effective resolver
        ↓
category aggregation
        ↓
Character presentation snapshot
        ↓
CharacterScreen.vue
```

Condition pozostaje pojedynczym authoritative źródłem. Badge jest wyłącznie wyliczaną projekcją i nie jest persistowany ani przechowywany jako osobny state.

## Effective physical attributes

Bazowe SPEA pozostają własnością `PlayerController.attributes`. Effective values nadal pochodzą z istniejącego `src/shared/effectivePhysicalAttributes.ts` i `PlayerController.effectiveAttributes(...)`.

Rozszerzyć istniejący effective-attribute seam tak, aby mógł dostarczyć breakdown contributions używany do prezentacji. Nie tworzyć równoległego Character-only resolvera i nie kopiować wzorów conditions.

Orientacyjny kontrakt, do dopasowania do aktualnego stylu kodu:

```ts
type AttributeModifierContribution = {
  category: ModifierCategory
  sourceId: string
  delta: Partial<PhysicalAttributes>
}

type EffectivePhysicalAttributesResult = {
  effective: PhysicalAttributes
  contributions: readonly AttributeModifierContribution[]
}
```

Istniejący prosty resolver może pozostać dla konsumentów potrzebujących wyłącznie `PhysicalAttributes`.

Najważniejszy invariant: breakdown i gameplay muszą korzystać z tej samej logiki, a wynik `effective` musi być identyczny z wartością faktycznie używaną przez gameplay.

## Stan gracza

Zachować istniejące ownership:

- HP → `player.health`.
- Stamina/Vigor/Hunger/Thirst → `player.needs`.

Character Screen pokazuje bieżące wartości, np. `Stamina 72 / 106`. Jeżeli resource ma rzeczywisty modifier capacity, można pokazać np. `[Illness −11 max]`. Utrata bieżącej Stamina/HP nie jest modifierem.

Max Stamina i recovery nadal korzystają z istniejącego `enduranceStamina` pipeline i effective Endurance. Nie duplikować tych wzorów na potrzeby UI.

## Umiejętności na Character Screen

Character Screen pokazuje wszystkie obecne skills:

- Sneak
- Survival
- Traps
- Defense
- Archery
- Riding
- Medicine
- Repair

Obecnie `PlayerSkills` nie posiada wspólnego effective-skill modifier pipeline. W v1 pokazywać istniejącą wartość, np. `Archery 50`, zamiast sztucznego `50 / 50`.

Nie tworzyć generic skill modifier framework bez pierwszego realnego gameplay consumera. Jeśli obecny model XP pozwala tanio pokazać progress do kolejnego wzrostu, można wykorzystać go wizualnie bez zmiany progression logic.

## Skills Screen — tylko actionable skills

Skills Screen odpowiada na pytanie „jakiej umiejętności chcę teraz użyć?”, a nie „jakie mam umiejętności?”.

Obecnie pokazywać:

- Sneak — realny stance toggle.
- Traps — realny targeted consumer `inspect-trap`.
- Repair — realny targeted consumer `repair-camp`.

Nie pokazywać obecnie:

- Survival
- Defense
- Archery
- Riding
- Medicine

Medicine jest sklasyfikowane jako targeted, ale aktualny `queryTargetedSkillAction()` nie ma dla niego consumer action. Ma pojawić się na Skills Screen dopiero po dodaniu rzeczywistej akcji gameplay.

Nie hardcodować listy `['sneak', 'traps', 'repair']` w Vue. Widoczność powinna być wyprowadzana z istniejącego `SKILL_USE`, stance actions i obsługiwanych targeted action families, bez tworzenia drugiego niezależnego rejestru.

## Effects / Illnesses / Injuries

Character Screen pokazuje aktywne źródła zmian i ich konkretne skutki, np.:

```text
STAN ZDROWIA

Choroby
Zatrucie — umiarkowane
  Strength −3 · Endurance −3 · Agility −3
```

Puste kategorie ukrywać. Jeżeli nie ma żadnych aktywnych wpisów, można pokazać pojedynczy komunikat `Brak aktywnych efektów`.

Aktualny `TemporaryConditionsState` pozostaje authoritative ownerem poisoning. Poisoning ma używać istniejącego severity/tier/recovery/SPEA penalty; nie przepisywać tej logiki w UI.

Shared effective physical attributes wspierają injury input, ale Player nie posiada obecnie pełnego authoritative physical-injury state wpiętego do player resolvera. Ten plan nie dodaje takiego systemu. HP damage nie jest injury.

`Fatigue` jest kategorią przygotowaną dla rzeczywistego przyszłego źródła; plan nie dodaje tired/fatigue mechanic tylko po to, aby wyświetlić badge.

## Character presentation model

Zachować istniejący przepływ:

```text
gameLoop
→ Hud.setCharacterStats
→ Vue store
→ CharacterScreen.vue
```

Rozszerzyć presentation snapshot zamiast przenosić logikę domenową do Vue. Orientacyjnie:

```ts
type CharacterAttributeView = {
  id: PhysicalAttributeId
  base: number
  effective: number
  modifiers: readonly CharacterModifierBadge[]
}

type CharacterSkillView = {
  id: SkillId
  value: number
  xp: number
}

type CharacterConditionView = {
  sourceId: string
  category: ModifierCategory
  label: string
  severityLabel?: string
  effects: readonly CharacterConditionEffectView[]
}
```

Typy presentation nie są authoritative state. Nie przechowywać w UI condition timers, modifier state ani progression state.

Agregację `contributions → category + stat → badges` wydzielić jako małą czystą/testowalną funkcję. Nie tworzyć globalnego `ModifierManager`.

## Responsive Character Screen

Character Screen ma być responsywny:

- mobile / narrow viewport: jedna kolumna,
- desktop / wide viewport: dwie kolumny.

Preferowany desktopowy układ:

```text
┌─────────────────────────┬─────────────────────────┐
│ STAN                    │ ATRYBUTY                │
├─────────────────────────┼─────────────────────────┤
│ UMIEJĘTNOŚCI            │ STAN ZDROWIA           │
├─────────────────────────┴─────────────────────────┤
│ REPUTACJA / RENOWN / ZNANY Z                     │
└───────────────────────────────────────────────────┘
```

Na mobile zachować logiczną kolejność: Stan → Atrybuty → Umiejętności → Stan zdrowia → Reputation/Renown/Known-for.

Responsive layout implementować wyłącznie w Vue/Tailwind; nie tworzyć osobnych presentation modeli ani osobnych komponentów desktop/mobile.

Sekcje mają naturalną, niezależną wysokość — nie wymuszać równych kart, szczególnie dla Skills i stanu zdrowia. Modifier badges mogą zawijać się pod wartością na wąskim ekranie zamiast ściskać nazwę i `effective / base`.

## CharacterScreen.vue

Priorytetem jest szybkie skanowanie wartości i modifierów. Przykładowa prezentacja:

```text
STAN
Health          87 / 100
Stamina         72 / 106
Vigor           84 / 100
Hunger          63 / 100
Thirst          48 / 100

ATRYBUTY
Strength        57 / 60    [Illness −3]
Perception      60 / 60
Endurance       57 / 60    [Illness −3]
Agility         57 / 60    [Illness −3]

UMIEJĘTNOŚCI
Sneak           35
Survival        42
Traps           31
Defense         44
Archery         50
Riding          27
Medicine        20
Repair          36
```

Badge powinien być mały i czytelny. Kolor może odróżniać positive/negative, ale znaczenie nie może zależeć wyłącznie od koloru.

Zachować istniejące local reputation, renown i known-for badges; ich system nie jest przedmiotem tego planu.

## Relevant files and seams

Zweryfikowane kluczowe miejsca:

- `src/ui-vue/screens/CharacterScreen.vue`
- `src/ui-vue/screens/SkillsScreen.vue`
- `src/ui-vue/store.ts`
- `src/ui/createHud.ts`
- `src/app/gameLoop.ts`
- `src/player/PlayerController.ts`
- `src/player/PlayerSkills.ts`
- `src/interaction/targetedSkillAction.ts`
- `src/shared/PhysicalAttributes.ts`
- `src/shared/effectivePhysicalAttributes.ts`
- `src/shared/temporaryConditions.ts`
- `src/shared/enduranceStamina.ts`

Zmieniać tylko pliki wymagane przez finalny kontrakt. Nie wykonywać niezwiązanych refaktorów.

## Testy

Dodać testy przede wszystkim dla logiki poza Vue.

### Effective attributes / breakdown

- bez conditions: `effective == base`, contributions puste,
- z poisoning: effective zgodne z istniejącym gameplay resolverem, contribution ma właściwą kategorię/source/delta,
- breakdown nie może zmienić dotychczasowego wyniku gameplay.

### Category aggregation

- kilka illness contributions dla jednego atrybutu → jeden `Illness` badge,
- illness + injury → osobne badges,
- brak contribution → brak badge,
- display delta odpowiada tej samej skali co prezentowana wartość atrybutu.

### Actionable skills

Oczekiwany obecny wynik:

```text
Sneak     visible
Traps     visible
Repair    visible
Survival  hidden
Defense   hidden
Archery   hidden
Riding    hidden
Medicine  hidden
```

Testować domain/query logic, nie ręcznie utrzymywaną listę Vue.

## Manual verification

User sprawdza w przeglądarce:

1. Bez conditions SPEA pokazuje `effective == base` i brak badges.
2. Poisoning pokazuje illness, odpowiednio obniża SPEA i daje zgodne badges.
3. Character Screen pokazuje wszystkie osiem skills.
4. Skills Screen pokazuje tylko actionable skills; Sneak toggle oraz Traps/Repair targeted flow nadal działają.
5. Desktop używa dwóch kolumn; mobile jednej; sekcje i badges poprawnie się zawijają.
6. Reputation, renown i known-for badges nadal działają.

AI nie wykonuje browser verification.

## Non-goals

Nie dodawać w tym planie:

- Player injury gameplay systemu,
- nowych illnesses,
- fatigue/tired mechanic,
- generic skill modifier framework,
- equipment stat bonuses,
- attribute progression,
- perks,
- globalnego modifier managera,
- duplicated effective values,
- condition formulas w Vue,
- redesignu reputation systemu.

## Dokumentacja

Po implementacji zaktualizować `docs/state/player-systems.md` o:

- base vs effective SPEA,
- modifier contributions i category aggregation,
- Character Screen jako pełny presentation view stanu gracza,
- Skills Screen jako ekran actionable skills,
- brak Player injury systemu, jeśli nadal nie istnieje.

Dodać JSDoc dla nowych ważnych resolverów/builderów, szczególnie tam, gdzie opis ownership i source-of-truth pomaga preflightowi; użyć właściwego `@domain`.

## Guardrails

- Character Screen jest obserwatorem stanu, nie właścicielem mechaniki.
- Gameplay i presentation breakdown korzystają z jednego effective calculation path.
- Nie tworzyć równoległych modifier/condition/skill registries.
- Nie dodawać przyszłych mechanik tylko dla kompletności UI.
- Responsive layout pozostaje wyłącznie concernem presentation layer.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
