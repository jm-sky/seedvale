# Plan: Animal Variants & Exceptional Dangerous Animals

**Created:** 2026-09-11
**Status:** `planned` 📋
**Type:** feature
**Priority:** high · **Effort:** M
**Depends on:** none
**Domain:** `fauna`
**Subdomains:** `predation` `population` `lifecycle`
**Tags:** `variants` `alpha-wolf` `combat` `renown`
**Roadmap:** -

## Cel

Dodać lekki, deterministyczny mechanizm indywidualnych wariantów zwierząt, zaczynając od **alpha wolf** jako wyjątkowo groźnego osobnika w istniejącej watasze `wolfDen`.

Rozwiązanie ma rozszerzać istniejące `AnimalAgent`, species taxonomy, habitat/spawner lifecycle i combat. Nie tworzyć nowych `AnimalKind` takich jak `alpha_wolf`, osobnego systemu bossów ani równoległego combat pipeline.

Pierwszy gameplay consumer:

```text
wolfDen
├── alpha wolf
└── normal wolf
```

Alpha pozostaje gatunkowo zwykłym `wolf`; wariant opisuje cechy konkretnego osobnika.

## 1. Model wariantu

Dodać mały fauna-owned typ indywidualnego wariantu, np. semantyczny odpowiednik:

```ts
type AnimalVariant = 'normal' | 'alpha'

type AnimalVariantDef = {
  scaleMultiplier: number
  healthMultiplier: number
  damageMultiplier: number
  speedMultiplier: number
  visualDarken: number
  dangerMultiplier: number
}
```

Guardrails:

- `AnimalKind` nadal oznacza gatunek,
- nie dodawać `alpha_wolf` do `AnimalKind`,
- wariant nie kopiuje diet, habitatów, `role`, `sociability` ani innych species-level capabilities,
- normalny wariant zachowuje neutralne mnożniki `1` / `0` dla presentation,
- brak explicit wariantu w istniejących call-sites zachowuje dotychczasowe zachowanie.

Jeżeli implementation recon pokaże, że pełny `AnimalVariantDef` jest nadmiarowy, można zmniejszyć shape, ale ownership musi pozostać per-animal i fauna-owned.

## 2. Resolved effective stats

Obecnie istotne statystyki są species-level: `MAX_HP[def.kind]`, `damageVsHuman(kind)`, `damageFor(predator, prey)` oraz `AnimalDef.walkSpeed` / `sprintSpeed`.

Wprowadzić jeden mały mechanizm rozstrzygający efektywne wartości osobnika:

```text
species base stats
+ individual variant
→ effective animal stats
```

Nie rozrzucać `if (variant === 'alpha')` po `AnimalAgent`, `faunaCombat.ts`, movement i questach.

Minimalny zakres V1:

- max HP,
- outgoing animal damage,
- walk/sprint speed,
- presentation scale,
- presentation darkening,
- danger significance dla downstream systems.

Species baseline pozostaje authoritative; wariant stosuje tylko mnożniki.

## 3. Alpha wolf tuning V1

Początkowe tunables:

```text
scaleMultiplier   1.15
healthMultiplier  1.60
damageMultiplier  1.45
speedMultiplier   1.05
visualDarken      0.20
dangerMultiplier  1.75
```

Alpha ma być wyraźnie groźniejszy przez HP i damage, a nie przez skrajnie większą prędkość.

Nie dodawać nowych ataków, animacji, armor ani specjalnych status effects w V1.

## 4. Spawn ownership — wolf den

Pierwszy wariant ma być deterministycznie związany z istniejącym `wolfDen`.

Dla inicjalnej watahy:

```text
1 stabilny slot → alpha wolf
pozostałe sloty → normal wolf
```

Wybór alfy musi być deterministyczny względem stabilnego pack/spawn slotu lub stabilnego animal id, nie `Math.random()` i nie kolejności klatek.

Nie zmieniać semantyki:

- `WOLF_DEN_ID`,
- `spawnPointId`,
- depletion,
- `clear_wolf_den`,
- istniejącego one-shot pack lifecycle.

Alpha liczy się do tej samej populacji i spawner lifecycle co normalny wilk. Nie tworzyć osobnego alpha spawnera ani osobnej watahy.

## 5. Relacja do `frenzied` i rabies

Wariant jest cechą osobnika, nie stanem zachowania.

```text
variant  = alpha | normal
frenzied = scenario / behaviour state
rabid    = disease state
```

Alpha może niezależnie zostać `frenzied` albo `rabid`.

Nie tworzyć kombinowanych typów typu `rabid_alpha`.

## 6. Presentation

Alpha wolf używa tego samego modelu i animacji co zwykły wilk.

V1:

- finalny model scale × `scaleMultiplier`,
- materiał przyciemniony o `visualDarken`,
- nie mutować współdzielonego material instance w sposób wpływający na inne wilki,
- zachować juvenile scaling jako osobną transformację.

Implementation notes mają zweryfikować dokładny model/material setup i ustalić jedną kolejność composition:

```text
base species/model scale
× life-stage scale
× variant scale
```

Nie dodawać osobnego GLB dla alfy.

## 7. Combat integration

`MAX_HP`, `DAMAGE_TABLE` i `HUMAN_DAMAGE` pozostają species-level baseline.

Dodać narrow variant-aware resolver albo metody `AnimalAgent`, tak aby:

- konstrukcja `HealthState` używała effective max HP,
- outgoing attack używał species baseline × variant damage multiplier,
- NPC/player incoming damage nadal przechodził przez istniejący shared damage pipeline,
- `HealthState.maxHp` konkretnego osobnika odpowiadał jego wariantowi.

Nie dodawać alpha-only defense systemu.

## 8. Movement and awareness

Speed modifier stosować do istniejących gatunkowych `walkSpeed` / `sprintSpeed`.

Nie zmieniać w V1:

- detect range,
- player notice/panic range,
- roaming radius,
- water traversal,
- diet/foraging,
- predator target selection.

Alpha ma zachowywać się jak wilk, tylko być fizycznie i bojowo groźniejszy.

## 9. Persistence i determinism

Zwykła dzika fauna nadal nie staje się per-individual persisted tylko z powodu wariantów.

Dla wolf-den alpha V1 źródłem prawdy ma być deterministyczny spawn slot/identity, dzięki czemu ten sam świat po rebuildzie nadal generuje alfę w tym samym logicznym miejscu.

Implementation notes muszą zweryfikować:

- jak stabilnie identyfikowana jest inicjalna wataha `wolfDen`,
- czy restored/persistent animal path obejmuje ten pack,
- czy wariant można zawsze odtworzyć z deterministic slot/id zamiast snapshotu.

Nie rozszerzać `AnimalSaveState` bez realnego V1 call-site. Jeśli code recon wykaże, że bez snapshotu wariant może się zmienić po save/load, wtedy dodać najmniejsze niezbędne pole do istniejącego save shape zamiast nowego persistence subsystemu.

## 10. Dangerous animal deed / renown seam

Plan jest bezpośrednio powiązany z `quests-progression-019-dangerous-animal-deeds-local-reputation.md`.

Species-only significance jest niewystarczające, ponieważ normalny wilk i alpha wolf mają ten sam `AnimalKind`, ale czyn nie ma tego samego znaczenia.

Preferowany seam player-caused kill:

```ts
type PlayerAnimalKillContext = {
  animalId: string
  animalKind: AnimalKind
  dangerSignificance: number
  position: { x: number; z: number }
}
```

Fauna rozstrzyga significance konkretnego zwierzęcia. `quests-progression-019` pozostaje ownerem mapowania czynu na `competence`, `courage`, `renown`, exposure i distance attenuation.

```text
normal wolf dangerSignificance = baseline
alpha wolf  dangerSignificance > normal wolf
```

Nie przekazywać `alpha` do reputation domain, jeżeli wystarczy już rozstrzygnięte `dangerSignificance`.

Fauna nie aplikuje reputacji bezpośrednio.

## 11. Quest overlap

Zachować zasadę z `quests-progression-019`: quest-owned social outcome może suppressować generic dangerous-animal deed.

Alpha status nie może omijać suppression.

Nie hardkodować quest IDs w fauna variant resolverze.

## 12. Future consumers

Mechanizm ma być wystarczająco mały i ogólny, aby później obsłużyć bez nowych `AnimalKind`:

```text
great / old bear
great boar
exceptional stag
inne rzadkie osobniki
```

To extension points, nie zakres V1.

W szczególności `great boar` nie zastępuje osobnego mechanizmu defensive aggression / charge. Variant określa siłę konkretnego osobnika; behaviour capability określa zachowanie gatunku.

## 13. Performance

Wariant jest stałą cechą konkretnego `AnimalAgent`.

Nie dodawać:

- per-frame losowania wariantu,
- pollingu/spatial scans tylko dla wariantów,
- workerów,
- osobnego managera,
- event busa.

Resolved multipliers mają być O(1) i bez alokacji w hot update loop. Ewentualny material clone wykonuje się raz podczas inicjalizacji presentation wariantu.

## 14. Relevant files / seams do implementation recon

Implementation notes powinny co najmniej zweryfikować:

- `src/fauna/animalDefs.ts` — `AnimalKind`, `AnimalDef`, species baselines,
- `src/fauna/AnimalAgent.ts` — constructor, health init, movement speeds, model presentation, `AnimalSaveState`, outgoing attack call-sites,
- `src/fauna/faunaCombat.ts` — `MAX_HP`, `DAMAGE_TABLE`, `HUMAN_DAMAGE`,
- `src/fauna/createFauna.ts` — deterministic wild spawn i initial `wolfDen` pack,
- `src/fauna/AnimalSpawner.ts` — `wolfDen`, `spawnPointId`, population/depletion lifecycle,
- `src/fauna/wolfDenScenario.ts` — scenario modifiers/pressure,
- current frenzy seam,
- rabies state seam,
- player combat death attribution używany przez `quests-progression-019`,
- `docs/plans/quests-progression-019-dangerous-animal-deeds-local-reputation.md`.

Code jest source of truth; implementation notes mają skorygować symbole/pliki, jeśli zostały przeniesione.

## 15. Tests

Dodać targeted tests obejmujące co najmniej:

### Variant resolution

- normal wolf zachowuje dokładnie bazowe HP/damage/speed/scale,
- alpha wolf otrzymuje oczekiwane multipliers,
- inne species bez wariantu są niezmienione,
- nie istnieje alpha-specific `AnimalKind`.

### Combat

- alpha wolf ma większe `maxHp` niż normal wolf,
- alpha outgoing damage > normal wolf dla animal target,
- alpha damage vs human > normal wolf,
- incoming player/NPC damage nadal korzysta z istniejącego shared pipeline.

### Spawn / determinism

- wolfDen initial pack zawiera dokładnie jedną alfę,
- ten sam seed/spawn identity daje ten sam alpha slot,
- alpha nadal ma `kind === 'wolf'`,
- alpha zachowuje właściwy `spawnPointId`,
- śmierć alfy liczy się normalnie do den depletion,
- rebuild/reload nie zmienia liczby/assignment alf.

### Behaviour compatibility

- alpha używa normalnego wolf predator behaviour,
- frenzy działa niezależnie od variant,
- rabies działa niezależnie od variant.

### Presentation

- final scale składa species/life-stage/variant bez double-application,
- darkening jednego wilka nie zmienia innych współdzielących asset.

### Renown seam

- kill context normalnego wilka niesie baseline significance,
- kill context alfy niesie większe significance,
- downstream resolver może rozróżnić czyn bez `alpha_wolf` kind,
- quest-owned social outcome nadal suppressuje generic deed.

## 16. Manual verification

Browser verification wykonuje User:

1. znaleźć wolf den — wataha zawiera jednego wyraźnie większego i ciemniejszego wilka,
2. normalny wilk zachowuje dotychczasowy wygląd i combat,
3. alpha ma zauważalnie większą przeżywalność i damage, ale nie nienaturalną prędkość,
4. alpha uczestniczy normalnie w chase/hunger/water/rabies/frenzy flows,
5. zabicie normalnego wilka i alfy daje różne significance dla renomy po implementacji `quests-progression-019`,
6. reload tego samego świata nie zmienia alpha assignment.

## 17. Non-goals

Plan nie obejmuje:

- nowych gatunków,
- lwa,
- defensive aggression / charge dzika,
- boss UI / boss health bar,
- nowych animacji,
- nowych GLB,
- loot tiers / trophies,
- globalnej reputacji,
- losowych elite spawnów w całej dzikiej faunie,
- genetyki / inheritance,
- per-individual persistence całej dzikiej fauny.

## 18. Dokumentacja i implementation notes

Przed implementacją przygotować `docs/plans/implementation-notes/fauna-022-animal-variants-and-exceptional-dangerous-animals-implementation-notes.md` na podstawie aktualnego kodu.

Po implementacji zaktualizować `docs/state/fauna.md` oraz tylko te dokumenty, których faktyczny stan się zmienił.

Dla ważnych nowych publicznych/architektonicznych resolverów dodać użyteczny JSDoc i `@domain fauna`, jeśli pomaga preflight discovery.

`quests-progression-019` ma zostać zaktualizowany przed jego implementacją tak, aby kill-context uwzględniał variant-derived `dangerSignificance` zamiast utrwalać species-only classification.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
