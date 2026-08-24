# 039 — Wyrównaj / Przygotuj teren (i zwykłe kopanie) nie zmieniają wizualnie terenu — `floorHeights` nie jest aktualizowane

**Status:** `todo`
**Created:** 2026-08-24
**Źródło:** playtest po planie [world-terrain-002](../plans/world-terrain-002-terrain-modification-and-land-preparation.md)

## Objaw / prośba

Stawiam flagę „Przygotuj teren", zaczynam pracę, trawa znika w trakcie pracy, praca
się kończy — teren jest bez trawy, ale nadal nierówny, nie jest poziomy. Wysokość
docelowa (`targetHeight`) nigdy nie widać na siatce terenu, mimo że praca kończy się
ze 100% postępem.

## Przyczyna

`applyModificationToTile` (`src/terrain/chunkManager.ts:565-638`) zapisuje wynikową
wysokość próbki **tylko** do `tile.heights` — pole grywalne/kolizyjne (`sampleHeight`,
chodzenie NPC/gracza, maska wody, odrzucanie trawy). Renderowany mesh terenu czyta
wyłącznie `tile.floorHeights` (`src/terrain/buildChunkGeometry.ts:407,453,457-460`),
osobne pole — potwierdzone też komentarzem w samym typie:
`src/terrain/chunkHeightmap.ts:279-285`, „Not the render-mesh Y; that is `floorHeights`”.

- Gałąź `mode === 'prepare'` (`chunkManager.ts:575-596`, używana przez `Przygotuj
  teren` i nowe `Wyrównaj` przez `ChunkManager.applyExactHeights`) nigdy nie dotyka
  `tile.floorHeights` — stąd zgłoszony objaw: `sampleHeight` się zmienia (dlatego
  praca poprawnie liczy postęp i kończy się na 100%), ale siatka mesh nie.
- Ten sam brak dotyczy gałęzi `'dig'` (zwykłe „Wykop dołek" / „Zrób górkę" — delta
  głębokości, `chunkManager.ts:620-621`). **Tylko** `mode === 'scorch'`
  (`chunkManager.ts:622-632`, plan 137) jawnie dopisuje tę samą deltę też do
  `tile.floorHeights` — to jedyna gałąź, która dziś działa poprawnie wizualnie.

### To jest regresja, nie zamierzony projekt

- Kopanie (plan 052, commit `bae0fa8`, 2026-08-10) w momencie wprowadzenia poprawnie
  rzeźbiło widoczny dołek — `tile.heights` było wtedy jedynym źródłem Y siatki mesh.
- Commit `4c6bd14` (2026-08-13, „Lower underwater terrain to floorHeights so the lake
  bed sits under the water instead of as a green lid") rozdzielił renderowany mesh na
  osobne pole `floorHeights` (dla batymetrii pod wodą) i **nigdy nie zaktualizował**
  gałęzi `dig`/`level` w `applyModificationToTile`, by też pisały do `floorHeights`.
- Późniejszy `scorch` (plan 137) dostał własną, lokalną łatkę tylko dla siebie —
  poprawny wzorzec do skopiowania, ale nigdy nie uogólniony na resztę funkcji.
- Nowa gałąź `'prepare'` (plan world-terrain-002, ta sesja) odziedziczyła to samo
  przeoczenie.
- Istniejące testy (`src/terrain/chunkManager.test.ts`, blok `describe('applyModificationToTile', …)`,
  linie 35-190) sprawdzają wyłącznie `tile.heights` — nigdy `tile.floorHeights` — co
  tłumaczy, czemu regresja przeszła niezauważona przez `pnpm run test`.

## Prawdopodobnie dotyczy też (ta sama funkcja, ten sam brak)

- `Zrób górkę` (`src/terrain/digAction.ts` `applyMoundAt` → `modifyTerrain`, mode `'dig'`
  z ujemną głębokością) — kopiec prawdopodobnie też niewidoczny.
- Wejścia jaskiń (`src/world/createLargeCaves.ts` → `modifyTerrain`), zaimplementowane
  w planie 083 (patrz issue [026](./2026-08-12--026--cave-mouth-flat-prop-not-a-hole.md))
  **2026-08-12, przed** regresją z `4c6bd14` — mogło się zepsuć dopiero potem;
  warto sprawdzić przy okazji, czy depresja jaskini nadal jest widoczna.
- Wypalone plamy / depresje po zwierzętach (`src/fauna/createFauna.ts:717,774,935`
  przez `terrainCarving.modifyTerrain`).

## Miejsca do poprawy

1. **`src/terrain/chunkManager.ts`, `applyModificationToTile` (linie 565-638)** — główny fix:
   - gałąź `'prepare'` (575-596): przy `tile.heights[idx] = sample.height` dopisać
     analogicznie `tile.floorHeights[idx] = sample.height` (wartość bezwzględna z
     `mod.samples`, nie delta — w przeciwieństwie do `dig`/`scorch` nie trzeba liczyć
     różnicy względem poprzedniej wartości).
   - gałąź `else` / `'dig'` (620-621): dziś tylko `mode === 'scorch'` dopisuje deltę do
     `tile.floorHeights` (622-626). Przenieść ten zapis poza warunek `scorch`, żeby
     działał dla każdego wywołania tej gałęzi (czyli też dla zwykłego `'dig'`), a
     zostawić pod `scorch` tylko to, co faktycznie jest specyficzne dla scorch
     (`roadTint` bump, 627-632).
   - `mode === 'level'` (614-619) jest dziś **martwym kodem** — `ChunkManager.levelTerrain`
     już nie istnieje, jedyny wywołujący `modifyTerrain` (`chunkManager.ts` ok. 2070-2082)
     zawsze konstruuje `mode: 'dig'`. Dla spójności/na wypadek reaktywacji warto dopisać
     tam też `floorHeights` (analogicznie: `tile.floorHeights[idx] += delta`), ale to
     drugorzędne — obecnie i tak nieosiągalne w praktyce.
2. **`src/terrain/chunkManager.test.ts`** — istniejące testy `applyModificationToTile`
   (35-190) sprawdzają tylko `tile.heights`; dodać asercje na `tile.floorHeights` dla
   przypadków `'dig'` i `'prepare'`, żeby ta regresja nie mogła się powtórzyć bez
   czerwonego testu.
3. Po naprawie sprawdzić w przeglądarce (manualnie, zgodnie z `CLAUDE.md` — nie
   headless): `Wyrównaj`, `Przygotuj teren`, `Wykop dołek`, `Zrób górkę`, oraz
   (przy okazji) czy wejście jaskini z issue 026 nadal ma widoczną depresję.

## Niezwiązane, już działa

Aktualny (na dzień powstania tego issue jeszcze niezacommitowany) diff w
`chunkManager.ts` dodał `tile.roadTint[idx] = 1` w gałęzi `'prepare'` oraz
`removeGrass`/`ensureGrass` w `applyExactHeights` — to jest poprawne i to właśnie
sprawia, że trawa już znika w trakcie pracy. Brakuje wyłącznie zapisu do
`floorHeights` opisanego wyżej.

## Related

- Plan [world-terrain-002](../plans/world-terrain-002-terrain-modification-and-land-preparation.md) — wprowadził gałąź `'prepare'`, która odziedziczyła ten brak.
- Issue [026 — cave mouth flat prop, not a hole](./2026-08-12--026--cave-mouth-flat-prop-not-a-hole.md) — jego fix (plan 083) mógł zostać cicho zepsuty przez tę samą regresję.
