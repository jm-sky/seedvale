# Research: źródła modeli 3D dla Seedvale (bez Blendera)

**Status:** `done`  
**Created:** 2026-08-07  
**Updated:** 2026-08-07  
**Constraint:** autor nie modeluje w Blenderze — tylko gotowe assety + loader Three.js.

## Question

Skąd brać modele 3D do świata Seedvale (osada, natura, NPC, fauna), w stylu **stylized / low-poly**, pod **glTF/GLB** i Three.js — bez własnej pracy w Blenderze?

## Method

- Mapowanie potrzeb z [ROADMAP.md](../ROADMAP.md) i v0.2 (`props.ts`: chaty, studnia, stockpile, drzewa; kapsuły NPC)
- Przegląd paczek CC0 z natywnym glTF (Kenney, Quaternius, Poly Pizza)
- Ścieżki animacji postaci bez Blendera (Mixamo → konwersja online/CLI)
- Kryteria: licencja, format, spójność stylu, koszt pipeline’u

## Context (co już jest w kodzie)

| Element | Stan | Docelowy art |
|---------|------|--------------|
| Teren | proceduralny heightmap + kolory biom | bez meshów |
| Osada | `BoxGeometry` / Cone / Cylinder (`props.ts`) | GLB low-poly |
| NPC | kapsuły + etykiety potrzeb | proste postacie + opcjonalnie animacje |
| Fauna (v0.3) | brak | wilk / niedźwiedź / sarna / zając (chase/flee) |
| Styl | roadmap: stylized / low-poly | spójny pack > mieszanka „realistycznych” PBR |

## Findings

### 1. Format i folder w repo

- **Jedyny format w runtime:** `.glb` (lub `.gltf` + bin/textures).
- Loader Three: `GLTFLoader` (+ opcjonalnie `DRACOLoader` / `MeshoptDecoder`).
- Proponowana struktura:

```
public/models/
  settlement/   # chaty, studnia, stockpile, płoty
  nature/       # drzewa, skały, krzewy
  characters/   # NPC / gracz
  fauna/        # v0.3
docs/assets/    # CREDITS.md — źródło, licencja, link per pack
```

Assety binarnie w `public/` (Vite serwuje 1:1). Krótka lista licencji w `docs/` — obowiązkowa przy CC-BY / „attribution appreciated”.

### 2. Rekomendowane paczki (priorytet)

| Priorytet | Pack | URL | Potrzeba Seedvale | Format | Licencja |
|-----------|------|-----|-------------------|--------|----------|
| **P0** | Kenney — Fantasy Town Kit | [kenney.nl/assets/fantasy-town-kit](https://kenney.nl/assets/fantasy-town-kit) | chaty, studnia-like, propki miasta | glTF | CC0 |
| **P0** | Kenney — Nature Kit | [kenney.nl/assets/nature-kit](https://kenney.nl/assets/nature-kit) | drzewa, skały, roślinność | glTF | CC0 |
| **P0** | Quaternius — Ultimate Fantasy RTS | [quaternius.com/.../ultimatefantasyrts](https://quaternius.com/packs/ultimatefantasyrts.html) | budynki wioski + nature w jednym stylu | glTF | CC0 |
| **P1** | Quaternius — Ultimate Stylized Nature | [quaternius.com/.../ultimatestylizednature](https://quaternius.com/packs/ultimatestylizednature.html) | bogatszy las | glTF | CC0 |
| **P1** | Quaternius — Ultimate Animated Animal Pack | [quaternius.com/.../ultimateanimatedanimals](https://quaternius.com/packs/ultimateanimatedanimals.html) | fauna v0.3 + walk/idle w glTF | glTF + anim | CC0 |
| **P1** | Quaternius — Animated Men / Women / RPG Character | [quaternius.com](https://quaternius.com/) | NPC z animacjami | glTF | CC0 |
| **P2** | Quaternius — Medieval Village MegaKit | [itch.io](https://quaternius.itch.io/medieval-village-megakit) | modularna wioska (duży zip) | glTF | CC0 |
| **P2** | Poly Pizza | [poly.pizza](https://poly.pizza/) | pojedyncze braki (studnia, palenisko) | glTF | CC0 / CC-BY (per model) |
| **Unikać na start** | Poly Haven | [polyhaven.com](https://polyhaven.com/) | świetne, ale realistyczne PBR — psuje low-poly vibe | glTF | CC0 |

**Werdykt stylu:** nie mieszać Kenney „retro pixel-texture” z Quaternius „flat stylized” w jednej scenie bez decyzji. Domyślna linia dla Seedvale: **Quaternius stylized** (Fantasy RTS + Nature + Animals) *albo* czysty **Kenney Fantasy Town + Nature**. Jedna rodzina na MVP.

### 3. Pipeline bez Blendera

```
Pobierz pack (glTF/GLB)
  → wybierz 5–15 modeli (nie cały zip do public/)
  → opcjonalnie: npx @gltf-transform/cli optimize / resize / draco
  → skopiuj do public/models/...
  → wpisz wiersz do docs/assets/CREDITS.md
  → GLTFLoader.load('/models/...')
```

| Potrzeba | Narzędzie (bez Blendera) |
|----------|---------------------------|
| Już jest glTF w paczce | kopiuj `.glb` / folder glTF |
| Tylko FBX (rzadko) | [gltf.report](https://gltf.report/) lub konwerter online FBX→glTF |
| Kompresja / scale | [`@gltf-transform/cli`](https://gltf-transform.donmccurdy.com/) (`npx`, bez instalacji globalnej) |
| Podgląd | [gltf.report](https://gltf.report/), [Babylon Sandbox](https://sandbox.babylonjs.com/) |
| Animacje postaci „humanoid” | [Mixamo](https://www.mixamo.com/) → FBX → gltf.report → GLB; albo od razu Quaternius Animated * |

\* Dla Seedvale **preferuj Quaternius Animated** nad Mixamo — ten sam styl co budynki/zwierzęta, mniej konwersji.

### 4. Mapowanie → wersje produktu

| Wersja | Assety | Źródło (propozycja) |
|--------|--------|---------------------|
| Polish v0.2 | 2–3 chaty, studnia, stos drewna, 5–10 drzew | Fantasy RTS **lub** Fantasy Town + Nature Kit |
| v0.2+ | 3–5 NPC (idle / walk) | Quaternius Animated Men/Women lub RPG Character |
| v0.3 | wilk, niedźwiedź, sarna/deer, zając/rabbit | Ultimate Animated Animal Pack |
| Później | płoty, ścieżki, market stall | ten sam pack co osada |

Obecne `createHut` / `createWell` zostają jako **fallback** do czasu loadera; zamiana to swap fabryki meshy → `loadSettlementProp('hut')`.

### 5. Licencje — checklista

1. Preferuj **CC0** (Kenney, Quaternius free packs).
2. Przy Poly Pizza / Sketchfab: otwórz kartę modelu — CC-BY wymaga kredytu w CREDITS + ewentualnie in-game „About”.
3. Nie wrzucaj do repo paczek „Source” Unity/Unreal (setki MB) — tylko wybrane glTF.
4. Nie commitować całych zipów; tylko użyte pliki + CREDITS.

### 6. Integracja Three (kierunek spike’a)

- Jeden helper: `loadGltf(url): Promise<THREE.Group>` z cache `Map`.
- Po load: `scene.traverse` → `castShadow` / `receiveShadow`; ewentualnie zamiana materiałów na `MeshStandardMaterial` z `flatShading` jeśli pack jest zbyt „gładki”.
- Skala: po pierwszym loadzie zmierz bounding box i ustaw `scale` per prop (różne paczki ≠ 1 unit = 1 m).
- Animacje: `THREE.AnimationMixer` + clip `Walk` / `Idle` po nazwie z paczki.

## Conclusion

1. **Bez Blendera da się domknąć art Seedvale** na CC0 glTF z Kenney / Quaternius.
2. **Jedna rodzina stylu** (rekomendacja: Quaternius stylized: Fantasy RTS + Nature + Animated Animals/Characters).
3. Pipeline: download → wybór → opcjonalnie gltf-transform → `public/models` → CREDITS → `GLTFLoader`.
4. Mixamo tylko jeśli zabraknie humanoida w wybranym stylu; inaczej zbędny.

## Decision

**2026-08-07 (użytkownik):** primary = **Quaternius**.

| | |
|--|--|
| Styl packów | Quaternius (Fantasy RTS + Stylized Nature + Animated Animals) |
| Fallback propów | Kenney Fantasy Town / Nature Kit tylko przy lukach |
| Animacje NPC | Quaternius Animated * (nie Mixamo na start) |
| Blender | poza pipeline |
| Następny spike | loader + 1 chata + 1 drzewo + 1 zwierzę testowe |

## Follow-ups

- [x] Werdykt: primary pack Quaternius
- [x] `docs/assets/CREDITS.md` + folder `public/models/`
- [x] Spike: `loadGltf` + podmiana chat / drzew / logs / garden (procedural well zostaje)
- [ ] Issue / plan: „v0.2 art pass — external GLB props” (studnia, storage, pełna osada)
- [ ] v0.3: lista konkretnych plików zwierząt z Animal Pack (+ podmiana capsule fauna)
