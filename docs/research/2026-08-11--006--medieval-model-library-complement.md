# Research: uzupełniająca biblioteka modeli 3D (osada / średniowiecze)

**Status:** `done`  
**Created:** 2026-08-11  

## Werdykt

Dla Seedvale najlepszym **uzupełnieniem** obecnego zestawu (już Quaternius Ultimate Fantasy RTS + Nature + Modular Characters) jest:

**[Quaternius — Medieval Village MegaKit](https://quaternius.itch.io/medieval-village-megakit)** — CC0, glTF, stylized low-poly w tej samej rodzinie co Fantasy RTS. Więcej „prawdziwych” domów, ogrodzeń, bram i detali wioski niż First Age RTS huts (które wyglądają jak same dachy).

Alternatywa, jeśli kiedyś zechcecie **oddzielną** linię wyglądu miast:

**[Kenney — Fantasy Town Kit](https://kenney.nl/assets/fantasy-town-kit)** — CC0, glTF, chunky / czytelne budynki. Nie mieszać 1:1 z Quaternius w jednej osadzie bez decyzji stylu.

## Dlaczego nie szukać „od zera”

| Już w repo | Paczka |
|---|---|
| Domki, wall, towerhouse, dock, market… | Ultimate Fantasy RTS |
| Drzewa / kwiaty / skały | Ultimate Stylized Nature + Fantasy RTS |
| NPC / gracz | Modular Men/Women |
| Fauna | Ultimate Animated Animals |

Brakuje głównie **bogatszej architektury mieszkalnej i ogrodzeń** — MegaKit to domyka bez zmiany toolchainu.

## Co brać z MegaKit (priorytet)

1. Domki z wyraźnymi ścianami (nie „daszek na słupkach”).
2. Segmenty płotu / palisady / bramy (jeśli lepsze niż `wall.glb`).
3. Studnia / szyld / ławki — tylko jeśli wyraźnie lepsze od proceduralnych.

Pipeline bez zmian: zip → wybrane GLB → `gltf-transform` → `public/models/settlement/` → CREDITS.

## Parked (2026-08-12)

19 modeli z MegaKit Standard jest w `public/models/settlement/megakit/` (meshopt + WebP 512). Niepodpięte do runtime — lista w `megakit/README.md`.

## Czego unikać

- Poly Haven / fotoreal PBR (psuje low-poly vibe).
- Mieszania Kenney pixel-texture z Quaternius flat w jednym placu.
- Wrzenia całego MegaKit zipa do repo — tylko wybrane assety.

## Powiązane

- [2026-08-07--002--3d-asset-sources.md](./2026-08-07--002--3d-asset-sources.md)
- [plans/2026-08-11--072--settlement-visuals-nameplate-palisade.md](../plans/2026-08-11--072--settlement-visuals-nameplate-palisade.md)
- [docs/assets/CREDITS.md](../assets/CREDITS.md)
- Living model backlog: [docs/assets/MODELS.md](../assets/MODELS.md) (M01–M03)
