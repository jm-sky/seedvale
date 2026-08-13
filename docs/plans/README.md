# Plans

Implementation plans. Active work is **In progress / Planned / Todo**. The rest is grouped for lookup, not daily scanning.

Status: `in progress` 🔄 · `verification needed` 🔍 · `planned` 📋 · `todo` ⬜ · `done` ✅
Priority: 🔴 high · 🟡 medium · ⚪ low
Effort: `XS` minuty · `S` ~15–30 min · `M` ~30–90 min · `L` ~1–3 h · `XL` kilka sesji

**Depends on** = implementation prerequisites (plan IDs). ~~done~~ is crossed out. A plan is ready when every dependency is struck. Thematic overlap is not a dependency.

Paths below are files in this folder. Implementation notes / reviews stay next to the plan (`*-implementation-notes.md`, `*-review.md`) and are not indexed separately.

---

## In progress

| File | Summary | % | Pri | Effort | Depends |
|------|---------|---|-----|--------|---------|
| `2026-08-09--049--procedural-world-landmarks.md` | Proceduralne obiekty, ruiny, landmarki | 40 | 🟡 | XL | ~~001~~ ~~006~~ ~~007~~ ~~028~~ ~~030~~ |
| `2026-08-07--024--world-visual-overhaul.md` | Rośliny, niebo/chmury, góry w tle | 50 | ⚪ | L | ~~028~~ |
| `2026-08-13--097--physics-falling-collisions-jumping.md` | Fizyka: opadanie przedmiotów, kolizje gracz/NPC/fauna, skok — wszystkie 3 fazy zaimplementowane, verification needed | 95 | 🟡 | XL | — |

---

## Planned

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-13--093--quests-v3-world-problems-reputation.md` | Questy z problemów świata + reputacja (nr 059 z 12.08; nie mylić z SFX 059) | 🔴 | XL | ~~015~~ ~~018~~ |
| `2026-08-08--040--seasons-weather.md` | Pory roku i pogoda | 🟡 | XL | ~~003~~ ~~028~~ |

+ `2026-08-13--103--performance-diagnostics-benchmark.md` (update table above with this plan) 

---

## Todo

| File | Summary | Pri | Effort | Depends |
|------|---------|-----|--------|---------|
| `2026-08-11--069--npc-household-resources.md` | Gospodarstwa NPC + przepływ zasobów | 🟡 | L | ~~060~~ ~~071~~ |
| `2026-08-11--070--world-observatory.md` | Panel obserwacji życia świata | ⚪ | XL | 071, 069 |
| `2026-08-08--037--npc-genealogy-lineages.md` | Rody NPC (kompas N → ~~067~~) | ⚪ | L | ~~022~~ ~~031~~ |

---

## Verification needed

Implementation complete; needs play/browser check. Grouped; full write-up is in the plan file.

**Osady / wioski** — `036` siting trudny teren (częściowo) · `074` katalog domów · `076` polish generatora · `077` ogrody S/M/L · `095` stóg siana + ogród poza placem · issue `029` wioska na oceanie · `071` lokalna gospodarka osady (stock/produkcja/woodshed)

**Las / narzędzia / zbieractwo** — `058` cykl drzew · `061` dig UX · `065` GLB skały/złoża · `085` handheld lights + village torches · `086` trawa w workerze (zdrowy baseline `Simulate (ms)` potwierdzony w przeglądarce; pixel-identyczny layout nie porównany explicite) · `087` instancing roślinności/propsów (fazy 1–5+7; brak pomiaru Draw calls przed/po) · `091` odnawialne gałęzie · `096` fauna GLB / hold / światła / blood splat

**Fauna / jaskinie** — `056` głodny predator · `064` cave vs droga · `080` fauna vs footprint osady · `083` dziura w terenie przy jaskini · `094` realne jedzenie/woda dla sytości i nawodnienia

**UI / audio / rest** — `059` SFX pick/drop (`2026-08-11--059--inventory-pick-drop-sfx.md`) · `075` time-skip catch-up NPC · `078` `playAt` falloff · `084` obóz + town rest · `088` asset alignment browser · `089` minimapa + mapa świata / FoW · `090` miecz/kupiec/namiot/jaskinie/kilof · `102` frame-yield budowy osady (issue 027)

**NPC** — `060` wykonywalny grafik (`eat`/`home`/`wake`) + overlay traits (`night_owl` / `fast_worker` / `sociable`) · `092` stamina (burst) + dzienny wigor / zasypianie w pracy

---

## Done

Compact ID list. Open the file only when you need the original scope.

- **Fundament:** `001` teren · `003` zegar · `006` terrain workers · `007` streaming/save · `008` trawa · `009` postprocess · `028` biomy · `062` terrain overhaul · `063` las/habitat · `066` VFX · `068` nierówne drogi
- **Osady / NPC:** `002` osada+NPC · `011` dialog · `013` płeć · `014` SFX reakcji · `020` grafik/place · `022` character depth · `025` multi-osady · `026` drogi · `027` imiona · `031` gen. wiosek · `038` ogniska · `044` detale świata · `048` dialogi v2 · `073` typy drzew · `047` village overhaul · `072` nameplate/palisada· `079` InteractionQueue / studnia · `099` pole pszenicy GLB + ogród crops · `100` ogród 2× + pad pod crops · `101` kaktus/reed/studnia/stos drewna
- **Fauna / walka:** `004` chase/flee · `010` predator-prey · `021` animal life · `042` świadomość gracza · `045` Health/Stamina
- **Itemy / świat:** `016` ambient audio · `017` gaze labels · `018` questy v2 · `029` minimapa · `030` zbieralne · `041` czekaj/odpoczynek · `043` ekwipunek · `050` pochodnia · `051` atmosfera · `067` minimapa N · `052` łopata/kamienie · `057` siekiera · `082` widły/sierp/clutter
- **App / UI:** `005` ekrany · `023` touch · `053` createApp refactor · `054` WorldBundle refs · `055` shared simulation · `046` Vue+Tailwind
- **Woda / grafika:** `098` jedna rodzina shadera + brzeg + lustro 256² / Vue
- **Archiwum:** `012` etykiety → `017`/`022` · `019` identity → `022` · `032` zasoby naturalne· `039` znaki drogowe

---

## Index completeness

Every `docs/plans/YYYY-MM-DD--NNN--*.md` (except `*-implementation-notes.md`, `*-review.md`, `README.md`) belongs in a section above. `012` / `019` are archived under Done.

New plan: `YYYY-MM-DD--{NNN}--slug.md` (next sequential NNN), then a row in the matching section.

---

## Quick notes / bugs

- **Światło w domach** — `findWallMount` raycastuje bryłę; 2026-08-11: nadal nierówne, potrzeba mapowania per model.
- **Latające obiekty** — `waitForChunks` przed propsami osady; 2026-08-11: nadal nieidealne.
- **Morze (telefon)** — artefakty krawędzi, plamy; spróbować bardziej przezroczystej wody.
- **Woda** — plan [098](./2026-08-13--098--water-unified-shader-shore-reflections.md) `done` (2026-08-13). Telefon: off odbić jako ucieczka od artefaktów krawędzi (notatka wyżej).

## Related

`docs/research/README.md` · `docs/reviews/README.md` · `docs/issues/README.md`
