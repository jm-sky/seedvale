# Plan: streaming świata + zapis (później)

**Status:** `planned`  
**Created:** 2026-08-07  
**Updated:** 2026-08-07 — kierunek zmieniony na duży/sferyczny świat (patrz "Kierunek świata" niżej), user priority
**Priority:** streaming/duży świat — następna duża decyzja architektoniczna (po worker poolu); zapis do bazy dalej po v0.2–v0.3 flow

## Kierunek świata (decyzja użytkownika, 2026-08-07)

Rewizja wcześniejszego założenia "jedna skończona dolina wystarczy": produkt ma docelowo generować **duży świat**, najlepiej **sferyczny** — żeby uniknąć problemu nieskończoności (hard edge albo literal infinite plane). Kolejne obszary generowane progresywnie w miarę zbliżania się gracza do krawędzi już załadowanego regionu.

To bezpośrednio zawraca do findingu, który wcześniej odrzucono jako "skip":
[`CubeQuadTree` LOD (cube-sphere quadtree, node stitching)](../research/2026-08-07-simodev-refs-review.md) — `docs/refs/ProceduralTerrain_Part10/src/quadtree.js` (442 linie), użyty w `terrain.js:230`.

**Otwarte pytanie (wymaga osobnej sesji research/plan, nie rozstrzygnięte tu):** pełny cube-sphere planet renderer (6 ścian, LOD po odległości kamery) vs. prostszy model — np. duży bounded flat/curved teren z ring-based chunk loadingiem, który "czuje się" bezkrawędziowy bez pełnej geometrii sfery. Cube-sphere to ~450 linii nietrywialnego kodu (node stitching, seam handling) — warto rozważyć koszt/benefit względem prostszego przybliżenia zanim zacznie się implementację.

Fundament pod to: [worker pool dla generacji terenu](./2026-08-07--terrain-worker-pool.md) (osobny plan, wyższy priorytet, robimy najpierw) — chunk generation i tak musi iść do workera.

## Potrzeba

1. **Progresywna generacja** — chunki terenu (i potem encji) w miarę ruchu gracza, zamiast jednej `PlaneGeometry` na całą mapę. Docelowo w kierunku dużego/sferycznego świata (patrz wyżej), nie tylko perf-optymalizacja istniejącej jednej mapy.
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
