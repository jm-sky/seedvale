---
domain: items-player
tags: [fauna]
---

# Plan: Universal Melee Combat

**Created:** 2026-08-15
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** none

## Cel

Rozszerzyć istniejący combat gracza ze zwierzętami do małego, wspólnego systemu melee. Miecz, nóż i pozostałe istniejące melee tools mają działać jak prawdziwe ataki: animacja → wind-up → hit → recovery/cooldown, z użyciem istniejącego `HealthState` i obecnego damage modelu.

Zakres pozostaje celowo wąski:

```text
Player
  ↓
Melee attack
  ↓
Animation / timing
  ↓
Hit detection
  ↓
Fauna target
  ↓
HealthState damage
```

Nie dodawać na tym etapie NPC jako targetów, NPC combat AI, konsekwencji społecznych, block/parry/combo ani systemu armor.

## Aktualny stan

Istnieją już:

- `HealthState` współdzielony przez playera i faunę,
- player melee przeciw zwierzętom przez `[E]`,
- `MeleeToolKind` i `playerToolDamage()` w `src/fauna/faunaCombat.ts`,
- melee damage dla `long_sword`, `axe`, `pitchfork`, `knife`, `sickle`, `shovel`,
- modele GLB dla istniejących melee tools,
- `PlayerNeeds` / stamina.

Nie tworzyć równoległego systemu health ani drugiego katalogu broni.

## Zakres

### 1. Wspólna akcja melee

Wydzielić lub rozszerzyć istniejący player interaction flow tak, aby atak był reprezentowany jako jedna akcja melee niezależna od konkretnego gatunku zwierzęcia.

Minimalny lifecycle:

```text
request attack
    ↓
attack wind-up
    ↓
hit window
    ↓
resolve target(s)
    ↓
apply damage
    ↓
recovery
    ↓
cooldown complete
```

Atak nie może wielokrotnie zadawać damage w jednej animacji.

### 2. Timing / cooldown

Każda broń melee powinna mieć konfigurowalne parametry:

- `damage`,
- `range`,
- `attackDuration` lub równoważny timing,
- `cooldown` / recovery,
- `staminaCost`.

Różne bronie mogą mieć różne tempo ataku. Nie hardcodować cooldownu w kodzie obsługi konkretnego zwierzęcia.

Nie rozbudowywać tego jeszcze o pełny system weapon stats.

### 3. Hit detection

Dodać prosty, deterministyczny hit test oparty o:

- odległość od gracza,
- kierunek patrzenia / facing,
- szerokość łuku ataku.

Preferować prostą geometrię / dystans + dot product zamiast kosztownego raycastowania całego świata.

Hit detection powinien działać dla aktualnie aktywnych `AnimalAgent` i respektować ich aktywny/alive state.

### 4. Animacja ataku

Wykorzystać istniejący pipeline modeli/animacji po audycie assetów.

Jeżeli odpowiednia animacja postaci nie istnieje, użyć minimalnego proceduralnego ruchu / transformacji ręki i narzędzia zamiast blokować cały plan na nowym asset packu.

Ważne jest zsynchronizowanie wizualnego momentu trafienia z hit window.

### 5. Stamina

Atak zużywa istniejącą `PlayerNeeds` stamina.

- brak wystarczającej staminy → brak ataku,
- cięższa broń może kosztować więcej,
- nie dodawać nowego stamina systemu.

### 6. Existing fauna combat

Przepiąć obecny player → fauna melee na nową ścieżkę.

Zachować istniejące wartości damage i zachowanie questów opartych o śmierć zwierzęcia.

W szczególności nie zmieniać semantyki `AnimalAgent.collapse()` ani istniejącego hooka `onDeath` tylko dlatego, że zmienia się sposób zadawania obrażeń.

### 7. Item catalog jako source of truth

Rozszerzyć istniejący `ITEM_CATALOG` / odpowiedni istniejący mechanizm konfiguracji tak, aby parametry melee nie były duplikowane pomiędzy katalogiem przedmiotów i `faunaCombat.ts`.

Docelowo:

```text
ITEM_CATALOG
    ↓
melee config
    ↓
player melee action
    ↓
fauna damage
```

Jeżeli podczas implementacji okaże się, że obecna struktura `meleeDamage` jest wystarczająca i można ją bezpiecznie rozszerzyć, nie tworzyć nowego katalogu.

### 8. Weapon scope

W tym planie objąć istniejące melee tools:

- long sword,
- knife,
- axe,
- pitchfork,
- sickle,
- shovel.

Branch/improvised melee pozostaje poza zakresem, chyba że implementacja pokaże, że dodanie go jest praktycznie bezkosztowe.

## Poza zakresem

- NPC jako target playera,
- NPC combat AI,
- social consequences / reputation za atak,
- NPC weapons,
- block / parry,
- combos,
- charged attacks,
- armor / resistances,
- knockback / stun / bleed,
- durability / weapon breaking,
- ranged combat,
- multiplayer combat.

## Reuse existing systems

Przed implementacją sprawdzić i rozszerzać istniejące:

- `src/fauna/faunaCombat.ts`,
- `src/shared/HealthState.ts`,
- `src/player/PlayerNeeds.ts`,
- `src/items/itemCatalog.ts`,
- `src/items/HeldTool.ts`,
- istniejący player input / interaction flow,
- istniejący `AnimalAgent` target/death flow,
- istniejący model/animation attachment pipeline.

Nie tworzyć:

- `CombatManager` jako monolitycznego singletonu,
- osobnego `AnimalCombatSystem`,
- osobnego `WeaponSystem`, jeśli istniejące moduły mogą zostać rozszerzone.

Ownership powinien pozostać jasny: player input inicjuje akcję, melee resolver rozwiązuje hit, target/`HealthState` posiada health i death.

## Implementation phases

### Phase 1 — Audit

Zweryfikować dokładny flow `[E]` melee, player input, held tool, modele/animacje oraz aktualny animal target lookup.

Wskazać konkretne miejsca, które można rozszerzyć zamiast tworzyć równoległy flow.

### Phase 2 — Melee action + timing

Dodać lifecycle ataku i cooldown oraz konfigurację timingów per weapon.

### Phase 3 — Hit detection

Zastąpić obecne targetowanie zwierzęcia wspólnym hit testem: range + facing/arc + aktywny target.

### Phase 4 — Animation + stamina

Dodać synchronizację animacji z hit window oraz koszt staminy.

### Phase 5 — Existing combat migration

Przepiąć wszystkie obecne melee tools i zachować dotychczasowy damage/death/quest behaviour.

### Phase 6 — Cleanup

Usunąć zbędne specjal-case'y dla player → animal melee i upewnić się, że parametry broni mają jedno źródło prawdy.

## Acceptance criteria

- Każdy z 6 istniejących melee tools może wykonać atak.
- Atak ma widoczny wind-up / hit / recovery.
- Broń ma własny cooldown / tempo ataku.
- Nie można spamować ataku poza skonfigurowanym timingiem.
- Atak ma range i facing/arc.
- Jedna animacja nie zadaje wielokrotnego damage temu samemu targetowi.
- Damage trafia przez istniejący `HealthState`.
- Zwierzę reaguje na damage tak jak obecnie.
- Śmierć zwierzęcia nadal uruchamia istniejący lifecycle/quest hooks.
- Atak zużywa istniejącą stamina.
- Brak staminy blokuje atak.
- Wszystkie melee tools korzystają ze wspólnego mechanizmu.
- Nie powstaje osobny system NPC combat.
- Nie powstaje nowy health system.

## Verification

### Code / tests

- TypeScript / lint / test / build.
- Testy konfiguracji melee i cooldown.
- Testy hit detection dla range/facing/arc.
- Test, że jeden attack event nie zadaje wielokrotnego damage.
- Test stamina gating.

### Browser / gameplay

Zweryfikować desktop i touch/mobile:

1. Wyposażyć nóż i zaatakować zwierzę.
2. Powtórzyć z mieczem.
3. Sprawdzić różne tempo ataku.
4. Sprawdzić zasięg i kierunek ataku.
5. Sprawdzić brak double-hit w jednej animacji.
6. Sprawdzić stamina consumption.
7. Sprawdzić brak ataku przy pustej staminie.
8. Sprawdzić wszystkie pozostałe melee tools.
9. Sprawdzić śmierć zwierzęcia i istniejące questy.
10. Sprawdzić zachowanie na telefonie.

Weryfikacja wizualna animacji musi odbyć się w przeglądarce.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
