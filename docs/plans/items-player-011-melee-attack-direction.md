# Plan: Melee attack direction consistency

**Created:** 2026-09-01  
**Status:** `planned` 📋  
**Priority:** low · **Effort:** S  
**Depends on:** ~~177~~  
**Domain:** `items-player`

## Cel

Naprawić realny bug, w którym kierunek wizualnego obrotu gracza (`faceToward()`) może różnić się od kierunku używanego przez melee hit test.

Po poprawce każdy rozpoczęty melee attack musi mieć jeden **committed attack direction**, używany przez cały hit window niezależnie od bieżącego kierunku kamery.

## Recon

Istnieją dwie różne konwencje yaw:

- `PlayerController.faceToward(x, z)` ustawia `mesh.rotation.y` przez `Math.atan2(dx, dz)`.
- `resolveMeleeHits()` interpretuje yaw jako kierunek `(-sin(yaw), -cos(yaw))`.
- `yawToward()` w `combat/meleeAttack.ts` zwraca yaw zgodny z konwencją używaną przez `resolveMeleeHits()`.

W `gameLoop.ts` istnieje już `attackYaw`, ale obecna logika nie gwarantuje, że każdy melee attack ma własny committed yaw. W szczególności ścieżka `pointer` może po obrocie przez `faceToward()` wykonać hit test względem aktualnego `mouseLook.state.yaw`.

Problem nie wymaga zmiany globalnej konwencji yaw ani refaktoru `PlayerController`.

## Zakres

### 1. Ustalić `attackYaw` przy rozpoczęciu każdego melee attack

W istniejącej ścieżce rozpoczęcia melee w `src/app/gameLoop.ts`:

- wykorzystać istniejący target wybrany przez `playerMelee`,
- wykorzystać istniejący `yawToward()` z `src/combat/meleeAttack.ts`,
- ustawić `attackYaw` dla **każdego** rozpoczętego melee attack,
- nie uzależniać committed direction od `mouseLook.state.yaw`.

Jeżeli `gapClose()` zmienia pozycję gracza, yaw należy policzyć względem pozycji **po zakończeniu gap-close**, ale nadal wobec tego samego committed targetu.

Nie dodawać nowego systemu targetowania.

### 2. Używać committed `attackYaw` w hit teście

W istniejącym wywołaniu `resolveMeleeHits()`:

- dla aktywnego ataku używać `attackYaw`,
- nie pobierać bieżącego `mouseLook.state.yaw` jako normalnego fallbacku,
- nie przeliczać ponownie kierunku z aktualnej pozycji/camery podczas hit window.

`resolveMeleeHits()` pozostaje odpowiedzialne wyłącznie za sprawdzenie trafienia na podstawie przekazanego kierunku.

### 3. Zachować istniejący visual facing

Nie zmieniać semantyki:

```ts
PlayerController.faceToward()
```

Nie zmieniać globalnej konwencji `mesh.rotation.y`.

Nie zastępować `faceToward()` przez `faceAimYaw()`.

Aktualny podział pozostaje celowy:

```text
target position
    ↓
yawToward()
    ↓
combat attack direction
    ↓
resolveMeleeHits()

target position
    ↓
faceToward()
    ↓
visual model facing
```

Obie ścieżki muszą jednak reprezentować ten sam fizyczny kierunek ataku.

### 4. Zachować lifecycle `attackYaw`

Sprawdzić istniejący lifecycle zmiennej `attackYaw` i doprowadzić go do następującego kontraktu:

```text
idle
  → attackYaw = null

attack starts
  → attackYaw = committed direction

wind-up / hit window / recovery
  → attackYaw unchanged

attack finishes / cancels
  → attackYaw = null
```

Nie przechowywać tego stanu w `PlayerController`; `attackYaw` jest stanem konkretnego melee action i pozostaje w istniejącym ownerze combat flow.

### 5. Nie zmieniać mechaniki melee

Poza naprawą źródła kierunku nie zmieniać:

- attack range,
- attack arc,
- damage,
- cooldown/recovery,
- target selection,
- gap-close distance,
- collision resolution,
- animation timing,
- NPC combat,
- ranged combat.

## Testy

Rozszerzyć istniejące testy `src/combat/meleeAttack.ts` / odpowiadający plik testowy, zamiast tworzyć nowy system testów.

Zweryfikować:

1. `yawToward()` + `resolveMeleeHits()` mają zgodną konwencję dla celu przed attackerem.
2. To samo działa dla kierunków:
   - +X,
   - -X,
   - +Z,
   - -Z,
   - diagonalnych.
3. Cel poza melee arc nadal nie jest trafiany.
4. Zmiana yaw kamery po rozpoczęciu ataku nie zmienia kierunku tego ataku.
5. Istniejące testy range/arc/damage nadal przechodzą.

Jeżeli obecna architektura utrudnia testowanie lifecycle `attackYaw` bez testowania całego `gameLoop`, nie tworzyć dużego mocka. W takim przypadku testować przede wszystkim seam:

```text
target position
→ yawToward()
→ resolveMeleeHits()
→ expected hit
```

a lifecycle potwierdzić przez istniejące testy/integrację.

## Kryteria akceptacji

- Gracz po `faceToward(target)` wykonuje melee hit w kierunku celu.
- Hit test nie może użyć przeciwnego kierunku wynikającego z różnicy konwencji yaw.
- Po rozpoczęciu ataku obrót kamery nie zmienia kierunku trwającego swing.
- `attackYaw` jest ustawiany dla wszystkich ścieżek rozpoczęcia melee.
- Po zakończeniu/anulowaniu ataku `attackYaw` nie pozostaje stale aktywny.
- Brak zmian w zasięgu, arcu, damage i timingach melee.

## Weryfikacja manualna

W browserze sprawdzić:

1. Cel dokładnie przed graczem.
2. Cel po lewej i prawej stronie.
3. Cel diagonalnie.
4. Atak po `gapClose()`.
5. Obrót kamery podczas wind-up — hit nadal powinien nastąpić w kierunku committed przy rozpoczęciu ataku.
6. Kolejny atak po zakończeniu poprzedniego powinien ponownie wyznaczyć kierunek.

## Poza zakresem

Nie wykonywać przy okazji:

- refaktoru `PlayerController`,
- ujednolicania wszystkich konwencji yaw w projekcie,
- zmian movement,
- zmian ranged combat,
- zmian NPC combat,
- zmian target selection,
- zmian collision system.

To jest **lokalna poprawka błędnego źródła kierunku melee**, nie przebudowa systemu combat.

## Implementacja

Preferować najmniejszą zmianę w istniejącym `gameLoop.ts` + istniejącym `combat/meleeAttack.ts`.

Przed zmianą sprawdzić wszystkie miejsca zapisu/odczytu `attackYaw`, aby nie pozostawić drugiej ścieżki wyznaczania kierunku.

Jeżeli `yawToward()` wymaga doprecyzowania kontraktu, uzupełnić jego JSDoc tak, aby jawnie dokumentował konwencję yaw używaną przez `resolveMeleeHits()`.

Przy modyfikacji istotnych funkcji combat dodać JSDoc z `@domain`, jeśli jest potrzebny do preflight discovery.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
