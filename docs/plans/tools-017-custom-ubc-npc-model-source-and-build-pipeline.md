# Plan: Custom UBC NPC model source and build pipeline

**Created:** 2026-09-19
**Status:** `planned` 📋
**Priority:** high · **Effort:** M
**Depends on:** ~~npc-039~~, ~~npc-040~~
**Domain:** `tools`  
**Type:** `infrastructure`  
**Subdomains:** `automation` `development`  
**Tags:** `blender` `ubc` `quaternius` `characters` `assets`  
**Roadmap:** -

## Cel

Przygotować spójny, repozytoryjny pipeline dla własnych, ręcznie modyfikowanych modeli NPC opartych na Quaternius UBC / Modular Character Outfits, np. Blacksmith, Herbalist, Textile Worker, Fisher, Miner i kolejnych profesji.

Custom model pozostaje ręcznie authorowany w Blenderze, ale finalny runtime NPC jest składany i optymalizowany wspólnym skryptem zamiast ręcznego przygotowania kompletnej postaci per profesja.

Docelowy przepływ:

```text
repo-local Quaternius base sources
  + custom outfit authored in Blender
  -> exported skinned outfit GLB
  -> validation: skin / joints / weights
  -> compose: head / eyes / eyebrows / hair / beard
  -> texture + GLB optimization
  -> runtime NPC GLB
```

## Najważniejsza zasada źródeł

`_temp/` nie jest częścią repo i nie może być wymaganym inputem tego pipeline.

Wszystkie pliki potrzebne do deterministycznego odtworzenia custom NPC muszą znajdować się w dedykowanym katalogu wersjonowanym w repo.

`_temp/Models/...` może służyć wyłącznie jako jednorazowe źródło importu pełnych paczek podczas przygotowania potrzebnego subsetu, ale build custom NPC ma działać po świeżym checkout repo bez `_temp/`.

## Stan obecny

Repo zawiera obecnie:

```text
docs/blender/sources/
  Quaternius_Outfits_All_Male.blend
  blacksmith.glb
  ...
```

`blacksmith.glb` jest ręcznie przygotowanym custom outfitem:

- wykorzystuje części Quaternius Peasant / Ranger;
- ma własny placement i custom props;
- ma poprawki geometrii i clippingu;
- ma własne kolory/material choices;
- zachowuje wspólny UBC Armature;
- po poprawnym eksporcie zawiera `JOINTS_0` i `WEIGHTS_0`;
- nie może być odtwarzany z czystych modular parts, bo utracilibyśmy ręczne zmiany.

Obecny inspect Blacksmitha pokazuje ok. 11.8k upload vertices, więc geometria nie jest głównym problemem rozmiaru. Duży wcześniejszy payload wynikał głównie z tekstur.

## Istniejące mechanizmy do reuse

`scripts/assets/compose_ubc_player.py` już posiada większość potrzebnych prymitywów:

- `GltfDoc`,
- kopiowanie buffer/accessor/material/image,
- `add_skinned_mesh()`,
- remap jointów po nazwach,
- wycinanie `HeadSkin` z UBC base body,
- dodawanie eyes / eyebrows,
- hair / beard compose,
- generowanie NPC hair/beard variants.

`scripts/assets/prepare-ubc-player-alpha.sh` ma istniejący runtime optimization profile:

```text
gltf-transform copy
-> resize 512
-> WebP
-> prune
-> gltfpack -cc -kn
```

Nie używać `gltf-transform optimize` / flatten na skinned UBC hierarchy.

## Docelowa struktura repo-local sources

Uporządkować source assets w osobnym katalogu character pipeline:

```text
docs/blender/sources/characters/
  README.md

  quaternius/
    README.md
    ubc-base/
      male-base.gltf
      male-base.bin
      textures/...

    hair/
      hair-simple.gltf
      hair-simple.bin
      hair-beard.gltf
      hair-beard.bin
      textures/...

    outfits/
      Quaternius_Outfits_All_Male.blend

  custom/
    blacksmith/
      outfit.glb
      README.md

    herbalist/
      outfit.glb
      README.md

    textile-worker/
      outfit.glb
      README.md
```

Dokładne nazwy bazowych plików mają odpowiadać rzeczywistym inputom potrzebnym do compose; powyższe nazwy są strukturą docelową, nie wymogiem identycznego nazewnictwa.

Nie kopiować całych paczek Quaternius do repo. Dodać tylko minimalny subset faktycznie potrzebny do custom NPC compose.

## Quaternius base subset

Do repo przenieść minimalne bazowe źródła potrzebne do generowania custom male NPC:

- male UBC base używany do head slice;
- eyes;
- eyebrows;
- Hair_SimpleParted lub równoważny domyślny wariant;
- beard;
- wszystkie wymagane `.bin` oraz obrazy/material assets dla tych źródeł.

Jeżeli później Herbalist lub inna profesja potrzebuje innej fryzury, dodać konkretny używany wariant, nie cały pack.

Przed dodaniem source files do repo zachować jednoznaczny zapis pochodzenia/licencji w `docs/assets/CREDITS.md` i README katalogu source. Nie commitować plików, których licencja nie pozwala na redystrybucję w repo; w takim przypadku repo musi zawierać legalny minimalny odpowiednik/export potrzebny przez pipeline, nie zależność od `_temp/`.

## Custom outfit contract

Każdy custom profession outfit jest wejściem do compose, a nie kompletnym finalnym NPC.

Minimalny kontrakt source GLB:

- kompatybilny UBC skeleton / skin;
- każdy skinned mesh ma `JOINTS_0` + `WEIGHTS_0`;
- nazwy jointów zgodne z obecnym UBC / UAL skeletonem;
- ręczne modyfikacje geometry/material/placement z Blendera są zachowane;
- brak wymagania baked hair/head;
- source animation clips nie są częścią runtime contract;
- brak `WGTS_rig` i innych Blender-only helperów w eksporcie.

Blender export workflow dla custom outfitu:

```text
Select custom outfit meshes + Armature
-> Export glTF Binary (.glb)
-> Selected Objects ON
-> Skinning ON
-> animations OFF dla source outfitu
-> WGTS_rig / helper objects excluded
```

## Nowy build entry point

Dodać jawny skrypt dla custom NPC w `scripts/assets/`, np.:

```text
scripts/assets/prepare-custom-ubc-npc.py
```

Może mieć mały shell wrapper, jeśli potrzebne są `gltf-transform` / `gltfpack`.

Skrypt powinien:

1. przyjąć custom outfit source z repo;
2. odczytać deklaratywną konfigurację wariantu;
3. zwalidować skin / joints / weights;
4. przekonwertować GLB do formatu roboczego tylko wewnątrz temp workdir, jeśli obecny `GltfDoc` wymaga external-buffer glTF;
5. reuse wspólnej logiki z `compose_ubc_player.py`;
6. dodać UBC head / eyes / eyebrows;
7. opcjonalnie dodać hair / beard;
8. usunąć/ignorować source animations;
9. zoptymalizować tekstury i GLB tym samym profilem co UBC;
10. zapisać finalny asset pod `public/models/characters/ubc/npc/`.

Build nie może czytać z `_temp/`.

## Wspólna biblioteka glTF

Jeżeli bez duplikacji nie da się użyć kodu z `compose_ubc_player.py`, wydzielić mały shared helper, np.:

```text
scripts/assets/ubc_gltf.py
```

Do wydzielenia kwalifikują się tylko funkcje rzeczywiście wspólne:

- `GltfDoc`,
- accessor/buffer copy,
- material/image copy,
- joint remap,
- `add_skinned_mesh`,
- head slice,
- validation helpers.

Nie robić szerokiego refaktoru istniejącego player pipeline tylko dla porządku.

## Declarative custom NPC manifest

Nie hardcodować osobnych funkcji per profesja.

Dodać jeden mały manifest/config, np.:

```text
blacksmith:
  source: docs/blender/sources/characters/custom/blacksmith/outfit.glb
  output: public/models/characters/ubc/npc/male_blacksmith.glb
  sex: male
  hair: simple
  beard: true
```

Dokładny format może być Python data table lub JSON. Preferować najmniejszą formę współdzieloną przez build script.

Nowy custom NPC powinien wymagać głównie:

1. ręcznego przygotowania outfitu w Blenderze;
2. eksportu `custom/<profession>/outfit.glb`;
3. dodania jednego wpisu do manifestu;
4. uruchomienia wspólnego build command.

Nie tworzyć `compose_blacksmith()`, `compose_herbalist()` itd., jeśli różnice są danymi.

## Walidacja

Pipeline ma fail-fast sprawdzać co najmniej:

- source istnieje i ma mesh;
- skinned primitives mają `JOINTS_0`;
- skinned primitives mają `WEIGHTS_0`;
- istnieje skin;
- joint names są mapowalne na repo-local UBC base skeleton;
- nie ma drugiego niekompatybilnego character rig;
- finalny output nie zawiera przypadkowych animation clips.

Błąd ma wskazać konkretny mesh/joint.

## Optymalizacja

Nie dodawać automatycznego Decimate do tego pipeline.

Dla custom UBC problemem ma być najpierw texture/runtime payload, nie arbitralna redukcja geometrii.

Centralny profil jakości:

- BaseColor: 512 lub 1024 zależnie od potrzeb;
- Normal: 512 lub 1024;
- ORM / roughness: 512;
- WebP przez istniejący pipeline;
- `gltfpack -cc -kn`;
- brak flatten armature.

Nie rozrzucać rozdzielczości po per-profession skryptach. Jeśli potrzebny jest wyjątek 1024 dla konkretnego assetu, ma być deklaratywny.

## Blacksmith jako pierwszy fixture

Pierwszym end-to-end consumerem jest obecny:

```text
docs/blender/sources/blacksmith.glb
```

Przenieść/adaptować go do:

```text
docs/blender/sources/characters/custom/blacksmith/outfit.glb
```

i użyć jako fixture dla całego pipeline.

Nie odtwarzać jego geometrii z oryginalnych Quaternius modular parts.

Po implementacji pełny Blacksmith ma być odtwarzalny jedną komendą z plików znajdujących się wyłącznie w repo.

## Runtime integration

`src/ai/npcAppearance.ts` pozostaje authoritative appearance resolverem.

Ten plan nie ma automatycznie przepinać wszystkich profesji na custom models. Asset pipeline kończy się na wygenerowaniu poprawnego runtime GLB.

Podpięcie Blacksmitha / Herbalista do konkretnej roli może być osobnym małym etapem/planem po weryfikacji assetu.

Nie łączyć asset authoringu z gameplay appearance policy.

## Dokumentacja

Dodać krótki workflow pod `docs/blender/` opisujący:

- repo-local source layout;
- gdzie znajduje się master Blender;
- gdzie trafia custom outfit GLB;
- wymagane Blender export settings;
- build command;
- gdzie trafia final GLB;
- `gltf-transform inspect` gate;
- zasady tekstur;
- sposób dodania kolejnej profesji.

Nie duplikować MPFB2 knowledge base; ten pipeline dotyczy Quaternius UBC custom professions.

## Relacja do istniejących planów

- `npc-039` / `npc-040` — reuse istniejącego UBC runtime + UAL appearance flow;
- `tools-005` — MPFB2 character preparation panel, inny authoring stack; nie jest dependency;
- `tools-007` — draft MPFB2 hero/NPC pipeline, nie zastępuje tego pipeline Quaternius UBC;
- `items-player-044` — custom bracers mogą później reuse podobnego repo-local source/validation tooling, ale nie są głównym consumerem tego planu.

## Spodziewane pliki

```text
docs/blender/sources/characters/
docs/blender/README.md
docs/assets/CREDITS.md
scripts/assets/compose_ubc_player.py
scripts/assets/prepare-custom-ubc-npc.py
scripts/assets/ubc_gltf.py                 # tylko jeśli shared extraction jest uzasadnione
scripts/assets/prepare-ubc-player-alpha.sh # tylko jeśli współdzielimy optimizer
package.json                              # opcjonalny command
public/models/characters/ubc/npc/
```

## Weryfikacja techniczna

Agent:

1. buduje Blacksmitha jednym entry pointem na świeżym checkout bez `_temp/`;
2. inspectuje source i output;
3. potwierdza `JOINTS_0`, `WEIGHTS_0`, skin;
4. potwierdza brak source animation clips w finalnym modelu;
5. potwierdza zachowanie wymaganych bone names po `gltfpack -kn`;
6. potwierdza znaczące zmniejszenie runtime payload względem nieoptymalizowanego source;
7. dodaje testy pure helpers tam, gdzie mają sens;
8. uruchamia właściwe repo technical checks.

## Weryfikacja manualna

User sprawdza w Asset Browser / grze:

- zachowanie custom geometrii Blacksmitha;
- kolory i props;
- clipping fixes;
- poprawne head / eyes / hair / beard;
- deformację podczas idle/walk/work;
- brak T-pose i detached meshes;
- akceptowalną jakość tekstur z gameplay distance.

Agent nie wykonuje browser verification.

## Poza zakresem

- MPFB2 character generation;
- automatyczne modelowanie profession outfitów;
- automatyczne Blender geometry edits;
- LOD generation;
- automatyczny Decimate;
- pełna female custom profession pipeline bez konkretnego consumera;
- runtime per-slot clothing;
- appearance persistence;
- zmiany NPC AI / profession logic;
- migracja wszystkich Modular NPC do UBC.

## Guardrails

- Build custom NPC ma działać bez `_temp/`.
- Custom Blender outfit jest źródłem prawdy dla ręcznie zmodyfikowanej geometrii.
- Nie regenerować custom Blacksmitha z czystych Quaternius modular parts.
- Nie bake'ować UAL animations do każdego profession GLB.
- Nie tworzyć drugiego character rig / mixer pipeline.
- Nie vendorować pełnych paczek Quaternius, jeśli potrzebny jest tylko mały subset.
- Nie commitować source assetów bez zweryfikowanej możliwości redystrybucji; jeśli pełny Source pack ma inne warunki, przechowywać w repo tylko dozwolony minimalny export/subset potrzebny do builda.
- Nie niszczyć istniejącego player/NPC UBC compose podczas wydzielania helperów.
- Nie uruchamiać `pnpm docs:sync`; workflow repo aktualizuje indeksy.

> **Zrób git commit i push do main, rebase jeżeli trzeba**