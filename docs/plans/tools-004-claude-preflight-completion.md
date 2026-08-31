# Plan: Claude Preflight Completion

**Created:** 2026-08-29
**Status:** `verification needed` 📋
**Priority:** medium · **Effort:** S
**Depends on:** none
**Domain:** `tools`

## Cel

Dokończyć mechanizm `pnpm claude:preflight <plan>`, aby przed implementacją dostarczał Claude Code mały, ale wystarczający kontekst architektoniczny i implementacyjny, bez konieczności otwierania dużych plików w ciemno.

V8 jest obecnie wersją bazową. Nie projektować kolejnego systemu od zera. Rozszerzać istniejący mechanizm AST/JSDoc/dependency-map.

## Kontekst

Dotychczasowy flow:

```text
ChatGPT
  ↓
plan
  ↓
implementation-notes.md
  ↓
claude:preflight <plan>
  ↓
Claude Code
  ↓
targeted source reads
  ↓
implementation
```

V8 rozwiązał główne problemy v6/v7:

- eksportowane symbole są wykrywane z AST,
- dokumentowane internal methods mogą być key symbols,
- qualified references `Owner.method()` są rozpoznawane,
- dependencies pochodzą z istniejącego dependency map,
- implementation anchors pokazują krótkie fragmenty źródła,
- output pozostaje ograniczony,
- `world-005` nie generuje dumpu metod dużego pliku.

Testy referencyjne:

- `npc-002`
- `items-player-001`
- `world-005`

## Zakres

### 1. Owner-aware API discovery

Rozszerzyć v8 tylko o przypadki, w których wybrany symbol jest właścicielem istotnego API.

Przykład:

```text
ItemInstance
  ↓
Inventory
  ├── cloneItemInstance()
  ├── instancesToJSON()
  └── instancesFromJSON()
  ↓
SaveData
```

Preflight powinien potrafić znaleźć takie API na podstawie:

- planu,
- implementation-notes,
- istniejących relacji AST,
- architectural metadata,
- qualified references.

Nie hard-code'ować nazw `Inventory`, `instancesToJSON` itd.

### 2. Explicit references mają najwyższy priorytet

Jeżeli plan lub implementation-notes wskazuje konkretny symbol/metodę, np.:

```text
Inventory.instancesToJSON()
NpcAgent.applyIncomingCombatDamage()
```

powinien on otrzymać najwyższy priorytet nawet wtedy, gdy jest internal method.

### 3. Ograniczenie broad discovery

Zachować:

- maks. 12 key symbols,
- maks. 8 implementation anchors,
- kompaktowy dependency graph.

Nie zwiększać limitów w celu naprawienia brakujących informacji.

Preferować:

```text
explicit implementation reference
  >
direct API/lifecycle relation
  >
architectural symbol
  >
broad dependency
```

### 4. Per-file limit

Zweryfikować obecne ograniczenie `maxSymbolsPerFile`.

Nie może ono odrzucać kilku wysoko-relewantnych symboli z jednego centralnego pliku tylko dlatego, że należą do tego samego ownera.

Limit może ograniczać broad discovery, ale nie powinien blokować:

- explicit plan/notes references,
- direct implementation points,
- wysoko ocenionych lifecycle/integration symbols.

Nie usuwać limitu całkowicie.

### 5. JSDoc

Nie dodawać JSDoc masowo.

Doc blocks dodawać tylko wtedy, gdy brak metadanych uniemożliwia stabilne wykrycie rzeczywiście ważnego architectural/integration point.

Wykorzystywać istniejące tagi:

```text
@domain
@system
@role
@owns
@uses
@produces
@consumes
@simulation
@performance
@lifecycle
@integration
```

Nie inventować metadata tylko dla poprawienia outputu.

### 6. Output

Preflight ma być narzędziem redukcji kontekstu, nie dokumentacją całego systemu.

Nie dodawać:

- pełnych klas,
- pełnych plików,
- pełnego dependency graph,
- redundantnych sekcji,
- `Recommended reads`.

Implementation anchors powinny być krótkie i celowane.

## Pliki

Podstawowe:

```text
scripts/claude/pre-implementation.ts
scripts/docs/utils.ts
```

Referencyjne outputy:

```text
docs/tmp/npc-002-claude-preflight-v8.md
docs/tmp/items-player-001-claude-preflight-v8.md
docs/tmp/world-005-claude-preflight-v8.md
```

Po zakończeniu testów pliki z `docs/tmp` mogą pozostać jako aktualne referencje tylko jeśli są nadal potrzebne; starsze wersje powinny być usunięte.

## Kryteria akceptacji

### npc-002

Preflight nadal pokazuje:

```text
need/pressure
  ↓
decision
  ↓
beginNeed()
  ↓
startAction()
  ↓
NpcPlannedAction / ActionLifecycle
```

oraz:

```text
combat damage
  ↓
applyIncomingCombatDamage()
  ↓
takeDamage()
  ↓
HealthState
```

### items-player-001

Preflight powinien umożliwiać rozpoczęcie implementacji bez ręcznego przeszukiwania całego `Inventory.ts`:

```text
ItemInstance
  ↓
Inventory
  ├── creation/cloning
  ├── serialization
  └── deserialization
  ↓
SaveData
```

oraz:

```text
LiquidContainerItemInstance
  ↓
liquid-container definition/rules
  ↓
capacity / allowed-liquid
```

Jeżeli konkretne symbole nie istnieją w aktualnym codebase, preflight nie może ich wymyślać.

### world-005

Preflight pozostaje kompaktowy i nie pokazuje wszystkich metod `createApp()`.

## Verification

Wygenerować:

```bash
pnpm --silent claude:preflight npc-002 > docs/tmp/npc-002-claude-preflight-v9.md
pnpm --silent claude:preflight items-player-001 > docs/tmp/items-player-001-claude-preflight-v9.md
pnpm --silent claude:preflight world-005 > docs/tmp/world-005-claude-preflight-v9.md
```

Porównać z v8.

Sprawdzić:

1. brak regresji `npc-002`,
2. brak regresji `world-005`,
3. poprawę owner-aware API discovery dla `items-player-001`,
4. brak hard-coded plan-specific logic,
5. brak niekontrolowanego wzrostu outputu,
6. brak duplikacji parsera/indexu,
7. poprawność redirected output.

Uruchomić tylko focused lint/typecheck/test dla zmienionych skryptów, jeśli są dostępne. Nie uruchamiać niepowiązanych drogich testów.

## Poza zakresem

- nowy parser AST,
- nowy indeks danych,
- cache/database dla preflight,
- pełna analiza repozytorium,
- automatyczne czytanie całych plików,
- automatyczne projektowanie architektury,
- specjalne wyjątki dla konkretnych planów,
- dalsze rozszerzanie JSDoc bez konkretnej potrzeby.

## Completion criteria

Plan jest kompletny, gdy preflight:

- dostarcza kluczowe implementation points z planu i notes,
- potrafi zejść z architectural symbol do bezpośredniego API/lifecycle boundary,
- nie wymaga masowego JSDoc,
- pozostaje ograniczony rozmiarem,
- nie generuje dumpów dużych klas,
- przechodzi testy `npc-002`, `items-player-001`, `world-005`,
- zachowuje istniejącą architekturę skryptów/docs.

**Zrób git commit i push do main, rebase jeżeli trzeba**
