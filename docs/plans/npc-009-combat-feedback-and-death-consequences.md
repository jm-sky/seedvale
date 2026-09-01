# Plan: NPC Combat Feedback

**Created:** 2026-09-01
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** 177
**Domain:** `npc`

## Cel

Dodać czytelny, spójny feedback wizualny i dźwiękowy do istniejącego combat lifecycle NPC i zwierząt.

Plan obejmuje wyłącznie **prezentację combat/death**. Stan śmierci, corpse, loot, decay, reputation, burial i grave pozostają odpowiedzialnością kolejnych planów.

Zasada:

```text
existing combat state/events
        ↓
animation + audio feedback
```

Nie tworzyć równoległego combat systemu ani death systemu.

## Zakres

### 1. Combat animation

Zweryfikować i zintegrować istniejące GLB animation clips dla NPC i zwierząt:

- attack,
- hit/hurt,
- death/collapse.

Jeżeli istnieją odpowiednie dodatkowe klipy, wykorzystać je tam, gdzie pasują do istniejącego combat lifecycle.

Wykorzystać istniejący AnimationClip[] / AnimationMixer pipeline.

Jeżeli assety używają różnych nazw clipów, rozwiązać je przez istniejące lub minimalnie rozszerzone semantic mapping zamiast hard-code'ować nazwy w combat logic.

Synchronizować prezentację ataku i trafienia z istniejącym combat lifecycle tak, aby widoczny impact był zgodny z istniejącym momentem rozstrzygnięcia damage.

Objąć NPC ↔ animal, animal ↔ NPC oraz NPC ↔ NPC, bez zmiany wspólnych mechanizmów damage/combat.

Jeżeli oczekiwany animation clip nie istnieje: zastosować bezpieczny fallback, odnotować brak assetu i nie rozszerzać planu o produkcję nowych animacji.

### 2. Death presentation

Po przejściu istniejącego combat/health state do śmierci odtworzyć właściwy death/collapse feedback.

Death animation jest **prezentacją istniejącego stanu**, a nie mechanizmem, który ten stan ustala.

Nie implementować tutaj corpse creation, corpse lifecycle, removal NPC ani loot transfer. Te odpowiedzialności należą do npc-010.

### 3. Combat audio

Rozszerzyć istniejący world audio mechanism o semantic combat feedback dla:

- attack,
- hit/impact,
- hurt,
- animal attack/hurt,
- NPC death,
- animal death.

Wykorzystać istniejące sounds/assets tam, gdzie są odpowiednie.

Nie używać player-specific kill audio jako uniwersalnego death sound, jeśli zawiera human-specific vocal/fall content.

Audio powinno być wywoływane na podstawie istniejących combat/death events lub centralnego feedback seam'u, a nie przez rozproszone wywołania w wielu niezależnych systemach.

Jeżeli odpowiedni sound asset nie istnieje, użyć bezpiecznego fallbacku i odnotować asset gap.

### 4. Feedback state and interruption

Feedback musi poprawnie obsługiwać szybkie zmiany stanu:

- NPC umiera podczas aktualnego attack animation,
- NPC otrzymuje kolejne hit events,
- combat kończy się przed zakończeniem animacji,
- target znika/unloads.

Death presentation ma mieć pierwszeństwo przed zwykłym combat feedback.

Nie pozostawiać NPC w aktywnej pętli attack/hurt po przejściu do dead state.

Wykorzystać istniejący animation state handling zamiast tworzyć osobny combat animation state machine, jeśli obecny system może zostać rozszerzony.

### 5. Off-screen / rendering boundary

Combat feedback jest warstwą prezentacji.

Brak obecności kamery nie może zmieniać combat result, damage ani death state.

Dla entities poza aktywnym obszarem rendering/audio może zostać pominięty zgodnie z istniejącym LOD/simulation behaviour.

Nie dodawać specjalnego off-screen combat simulation.

## Ownership

Preferowany podział:

```text
Combat
  → damage/combat resolution

HealthState
  → alive/dead state

npc-009
  → animation/audio presentation

npc-010
  → death/corpse lifecycle

npc-011
  → social response/burial/grave
```

Nie przenosić ownership state między tymi warstwami.

## Powiązanie z npc-010

Po przejściu do dead:

```text
HealthState → dead
       ├── npc-009 → death animation + audio
       └── npc-010 → death/corpse lifecycle
```

npc-009 nie może usuwać NPC z symulacji, tworzyć corpse, przenosić inventory, rozpoczynać burial ani tworzyć grave.

## Debug

Wykorzystać istniejące debug conventions.

Jeżeli potrzebne, dodać minimalne informacje pozwalające ustalić:

- current combat animation,
- ostatni combat feedback event,
- death presentation triggered/not triggered,
- semantic audio event,
- brakujący animation/audio mapping.

Nie tworzyć osobnego debug UI.

## Verification

### Animation

1. NPC wykonuje attack animation.
2. Hit/hurt animation odpowiada rzeczywistemu trafieniu.
3. Death animation uruchamia się po przejściu do dead state.
4. Death ma pierwszeństwo przed attack/hurt.
5. NPC ↔ animal działa w obu kierunkach.
6. NPC ↔ NPC działa poprawnie.
7. Brakujący clip nie powoduje crasha ani zablokowania combat.

### Audio

1. Attack, hit, hurt i death generują odpowiedni semantic feedback.
2. NPC i animal korzystają z właściwych sound mappings.
3. Player-specific kill sound nie jest używany jako uniwersalny death sound.
4. Brakujący asset ma bezpieczny fallback.
5. Audio nie zmienia wyniku symulacji.

### State transitions

1. NPC nie pozostaje w attack loop po śmierci.
2. Wielokrotne hit/death events nie powodują wielokrotnego death presentation.
3. Unload/streaming nie pozostawia błędnego animation state.
4. Death feedback nie tworzy corpse ani nie usuwa entity.

### Off-screen

1. Combat/death simulation działa bez kamery.
2. Feedback może zostać pominięty poza aktywnym obszarem bez zmiany wyniku symulacji.
3. Po ponownym załadowaniu entity animation state jest spójny z aktualnym world state.

### Regression

Uruchomić istniejące testy i build.

Nie zmieniać bez potrzeby damage calculation, critical hits, defense, combat decisions, HealthState semantics, NPC death/corpse lifecycle, inventory ani burial.

## Poza zakresem

- NPC death/corpse lifecycle — npc-010,
- NPC personal loot — npc-010,
- corpse harvesting/decay — npc-010,
- corpse looting reputation — npc-010,
- household death awareness — npc-011,
- burial — npc-011,
- graves/markers — npc-011,
- new animation asset production,
- new combat mechanics,
- new damage/health system,
- new player combat mechanics,
- full funeral/mourning system.

## Powiązane plany

- **177 — NPC Combat**
- **179 — Animal Attack & NPC Defense**
- **007 — Interaction Destination Approach**
- **010 — NPC Death & Corpse Lifecycle**
- **011 — NPC Burial & Graves**

**Zrób git commit i push do main, rebase jeżeli trzeba**
