# Plan: streaming świata + zapis (później)

**Status:** `planned`  
**Created:** 2026-08-07  
**Priority:** po v0.2–v0.3 (jedna dolina wystarczy na AI / osadę)  

## Potrzeba

1. **Progresywna generacja** — chunki terenu (i potem encji) w miarę ruchu gracza, zamiast jednej `PlaneGeometry` na całą mapę.  
2. **Zapis do bazy** — seed, stan świata / gracza / osady, żeby wracać do tej samej doliny i nie tracić postępu.

## Streaming (kierunek)

Wzorce: SimonDev / `3d-portfolio` `TerrainChunkManager` (referencja, nie kopiować legacy Three).

| Element | Szkic |
|---------|--------|
| Chunk grid | stały rozmiar (np. 32–64 u), klucz `cx,cz` |
| Load radius | N chunków wokół gracza; unload poza ringiem |
| Generacja | worker (FBM + biom) → `Float32Array` → mesh na main |
| Seams | overlap 1 vertex / shared border heights |
| Woda / sky | woda per-chunk lub jedna tafla w AABB załadowanych; sky bez zmian |
| Osada / NPC | pinned do chunka „home”; fauna spawn w załadowanych |

v0.1–v0.3 celowo **jedna mapa** — streaming gdy mapa / performance przestanie wystarczać.

## Persistencja (kierunek)

| Warstwa | Kandydaci | Co trzymać |
|---------|-----------|------------|
| Lokalnie (start) | `IndexedDB` / opfs | seed, config, player pos, settlement flags |
| Backend (później) | SQLite / Postgres / Supabase — TBD | to samo + multi-save slots |

Minimalny save v1:

```ts
{
  version: 1,
  seed: number,
  config: Partial<WorldConfig>,
  player: { x, y, z, yaw, pitch },
  // później: npc needs, chopped trees, quests
}
```

Baza „prawdziwa” dopiero gdy będzie sens sync / wielu sesji — wcześniej IndexedDB wystarczy pod portfolio.

## Świadomie poza teraz

- Pełny infinite open world w v0.2  
- Netcode / shared world  
- Authoritative server sim  

## Trigger

Wziąć gdy: (a) jedna mapa 128–256 za mała / za ciężka, albo (b) potrzeba „Continue” / save po demie osady.

## Powiązane

- [2026-08-07-3d-portfolio-library-audit.md](../research/2026-08-07-3d-portfolio-library-audit.md) — chunk manager jako wzorzec  
- [ROADMAP.md](../ROADMAP.md)  
- [2026-08-07--game-ui-screens.md](./2026-08-07--game-ui-screens.md) — UI save/load  
