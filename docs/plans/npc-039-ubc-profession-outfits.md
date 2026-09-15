# Plan: UBC profession outfits for NPCs

**Created:** 2026-09-15
**Status:** `verification needed` 🔍 — implemented 2026-09-15 (`tsc`/lint/tests). Browser/manual verification not performed — belongs to the User.
**Type:** feature
**Priority:** medium · **Effort:** L
**Depends on:** ~~items-player-033~~ ~~items-player-034~~ ~~items-player-036~~
**Domain:** `npc`
**Subdomains:** `presentation` `lifecycle`
**Tags:** `characters` `assets` `animation` `professions`
**Roadmap:** -
**Implemented at:** 2026-09-15 16:12

Implemented V1 with a scoped table: adult `farmer`/`woodcutter` → Peasant (distinct sidecars), adult `trader` → Wizard, both sexes, UAL1 companion clips. Hunter and other roles stay Modular.

Powiązane: `items-player-033` / `034` / `036` (UBC gracz, cały mesh, UAL1), draft `items-player-037` (per-slot — NPC poza zakresem tamtego planu). Luźny koniec: `docs/plans/LOOSE-ENDS.md` (Characters / presentation — remaining NPC roles still Modular).

## Problem

NPC wyglądają jak losowy wariant Ultimate Modular Men/Women (`NPC_MODEL_URLS` w `NpcAgent.ts`), indeksowany płcią i kolejnością spawnu. `Role` steruje AI, staffingiem i handlem, ale **nie meshem**. Gracz już stoi na Universal Base Characters + Fantasy outfits; NPC nie.

Cel: dodać UBC stroje do istniejącej puli, **dedykowane wybranym profesjom**, obie płcie, albedo inne niż u gracza. Nie zastępować całej wioski jednym rygem w jednym slisie.

## Stan obecny (kod jest źródłem)

| Warstwa | Dziś |
| --- | --- |
| Pula NPC | `NPC_MODEL_URLS` — 4 męskie + 4 żeńskie Modular GLB z własnymi clipami. `modelUrlFor(gender, treeIndex)`. |
| Spawn | `createSettlement.ts` przekazuje `treeIndex: i`; `NpcAgent.create` ładuje `deps.modelUrl ?? modelUrlFor(...)`. |
| Role | `Role` w `ai/characters.ts`. Home reserved: Anna `farmer`, Piotr `woodcutter`, Kasia `trader`, Marek `guard`. Staffing nadpisuje rolę proceduralnych dorosłych; reserved bez zmian. |
| Wiek | `FamilyMember.age`; `isAdultAge` = `age >= 18` (`professionStaffing.ts`). Dzieci = ten sam mesh, mniejszy `scale`. |
| Gracz UBC | `public/models/characters/ubc/male_{peasant,ranger,knight,…}.glb` + `ual1_player.glb`. Resolver `playerVisualPreset.ts`: pusty body → Peasant, `leather_armor` → Ranger, inny body → Knight. |
| Tint gracza | `?playerTint=brown` → sidecar `male_*_brown.webp` na sklonowanych `MI_*`. Peasant brown = `T_Peasant_2`; Ranger brown = `T_Ranger_3`; Wizard brown = `T_Wizard_2`. Default albedo pieczone w GLB. |
| Compose | `compose_ubc_player.py` — tylko męskie outfity + `Superhero_Male_FullBody` + `Hair_SimpleParted` (pomijane na hełmach). `prepare-ubc-player-alpha.sh`. |
| Animacje NPC | `AgentAnimationSet` resolve: `Idle` / `Walk` / `Interact` / `Sword_Slash` / `Gun_Shoot` / `HitRecieve` / `Death`. Brak aliasów UAL (`Idle_Loop`, `Walk_Loop`, `Sword_Attack`, …). |
| Companion clips | `companionAnimationUrl()` zwraca `ual1_player.glb` dla każdego GLB pod `/models/characters/ubc/`. `NpcAgent` tego nie woła. |
| Save | Brak pola appearance. Fizyczny profil (SPEA/HP) ma osobny seed; wygląd świadomie poza nim (`npcPhysicalProfile.ts`). |
| Female UBC | Źródła w `_temp/` (`Female_Peasant` / `Female_Wizard` / `Female_Ranger`, `Superhero_Female_FullBody`). Nie w `public/`. |

**Nie mieszać clipów UAL z Modular.** LOOSE-ENDS i 037 to powtarzają. UBC NPC muszą dostać `ual1_player.glb`; Modular zostaje przy własnym GLB.

## V1 — uzgodniony kierunek

Dorośli (`isAdultAge`):

| Role | Outfit UBC | Płeć | Albedo NPC (nie gracza) |
| --- | --- | --- | --- |
| `farmer` | Peasant | obie | `T_Peasant_3` (`npc_peasant.webp` — szafirowy kaftan, kremowa kamizelka, rdzawy spód) |
| `woodcutter` | Peasant | obie | `T_Peasant_2` (`npc_woodcutter.webp` — ziemisty brąz; ten sam atlas co `?playerTint=brown`, ale osobny sidecar) |
| `trader` | Wizard | obie | `T_Wizard_3` (`npc_wizard.webp` — karmazyn + srebro) |

To pokrywa Annę, Piotra, Kasię i wszystkich wygenerowanych farmer/woodcutter/trader **bez mapowania po imieniu** — wystarczy `Role`.

Reszta ról (w tym Marek `guard`) zostaje w `NPC_MODEL_URLS`. Dzieci zostają na Modular + `scale`.

Wygląd derywowany z `gender` + `role` + wieku. **Bez zmiany save schema.**

```text
createSettlement spawn
  → resolveNpcAppearance(gender, role, age)
       adult farmer|woodcutter → Peasant UBC + ual1 + npc peasant tint
       adult trader            → Wizard UBC + ual1 + npc wizard tint
       else                    → NPC_MODEL_URLS[gender][i % n]
  → NpcAgent.create (model + optional companion clips + optional tint)
```

## Pipeline assetów

Źródła zostają w `_temp/`. Runtime tylko `public/models/`. Nie forkuć compose — rozszerzyć `compose_ubc_player.py` / `prepare-ubc-player-alpha.sh` (ten sam luźny koniec co żeński gracz).

Nowe pliki:

```text
public/models/characters/ubc/female_peasant.glb
public/models/characters/ubc/female_wizard.glb
public/models/characters/ubc/npc_peasant.webp    ← T_Peasant_3
public/models/characters/ubc/npc_wizard.webp     ← T_Wizard_3
```

Męskie meshe **reuse** `male_peasant.glb` / `male_wizard.glb`. Gracz ładuje je z default albedo albo `*_brown.webp`; NPC z `npc_*.webp`. Nie duplikować geometrii.

Żeński compose: outfit `Female_*` + sliced `Superhero_Female_FullBody` + fryzura (patrz otwarte decyzje). `companionAnimationUrl()` sam podłączy UAL, jeśli GLB leży pod `/models/characters/ubc/`.

`gltf-transform optimize` / flatten nadal zakazane (zniszczy armature, jak 033). `gltfpack -cc -kn`.

## Runtime (gdy zejdzie z draftu)

Nie tworzyć drugiego agenta ani równoległej puli „UBC NPC manager”. Rozszerzyć właścicieli, którzy już są:

- cienki resolver analogiczny do `playerVisualPreset.ts` (osobny plik albo obok `NPC_MODEL_URLS`) — JSDoc + `@domain npc` na publicznym `resolveNpcAppearance`;
- `NpcAgent.create`: jeśli URL jest UBC, doładować companion clips (wzorzec `PlayerController`);
- `anim.resolve`: dopisać aliasy UAL na końcu list, Modular nadal wygrywa exact match na swoich nazwach;
- tint: wyciągnąć `cloneOutfitMaterials` + swap `MI_*` map z `PlayerController.ts` do shared helpera, żeby klon nie mutował cache współdzielonego z graczem.

`NpcAgentDeps.modelUrl` już istnieje — resolver ustawia je przy spawnie, albo `create()` woła resolver gdy `modelUrl` nie podano.

## Kolejne profesje — Ranger / Hunter (nie V1, ale zaplanowane)

Ta sama tabela ról może później dostać **Ranger dla `hunter`**, obie płcie, **inne kolory niż gracz**.

Albedo Rangera w paczce:

| Plik | Kto go używa dziś |
| --- | --- |
| `T_Ranger_BaseColor` (zieleń + brąz) | default gracza przy `leather_armor` |
| `T_Ranger_3` (oliwkowo-khaki) | `?playerTint=brown` |
| `T_Ranger_2` (ciemny fiolet / near-black) | **wolny** — rekomendowany tint NPC hunter |

V1 tego nie wdraża. Gdy hunter wejdzie: reuse `male_ranger.glb`, złożyć `female_ranger.glb` tym samym pipeline, sidecar `npc_ranger.webp` ← `T_Ranger_2`. Ten sam resolver, jeden nowy wiersz w tabeli ról.

Ten sam wzorzec nadaje się na później dla innych klas (np. Knight dla `guard`), zawsze z albedo, którego gracz nie zajmuje. Nie mieszać klas w V1.

## Otwarte decyzje (zablokować przed `planned`)

1. **Fryzura żeńska.** Kandydat: `Hair_Long` (ten sam folder Head-bone co męski `Hair_SimpleParted`). Alternatywa: ten sam `Hair_SimpleParted` dla obu płci, mniej ryzyka compose. Do potwierdzenia po pierwszym compose w przeglądarce, nie zgadywać clipu z hełmem/kapeluszem Wizard.
2. **Sidecar tint vs bake.** Rekomendacja: sidecar `npc_*.webp` jak u gracza, żeby męskie GLB zostały współdzielone. Bake `T_*_3` w osobne `npc_male_peasant.glb` unika tintu w `NpcAgent`, ale dubluje geometrię.
3. **Wizard jako handlarz.** Mesh Wizard (kapelusz, szata, bogatsza geometria niż Peasant — `Female_Wizard.gltf` jest wielokrotnie większy) wygląda jak mag, nie kupiec. V1 to akceptuje jako świadomy look Kasi / traderów, czy szukamy Noble zamiast Wizard?
4. **Hunter / Ranger w tym samym slisie co V1, czy następnym?** Rekomendacja: osobny increment po V1 (żeński Peasant/Wizard + UAL na NPC to wystarczająco dużo ryzyka). Tabela i tint `T_Ranger_2` zostają w tym planie, żeby nie zgubić decyzji.
5. **Inne labour roles** (`fisher`, `shepherd`, `miner`, `herbalist`, `textile_worker`) — Peasant czy Modular? V1 tylko farmer/woodcutter. Rekomendacja: zostawić Modular, aż Peasant w osadzie będzie zweryfikowany wizualnie.
6. **`guard` / Marek.** Modular w V1. Później Knight w kolorze ≠ `T_Knight_2` (to brown gracza) i ≠ default Knight. Nie blokuje V1.
7. **Dzieci farmer/trader.** V1: Modular. Czy scaled-down UBC jest akceptowalne później, dopóki nie ma child mesh?
8. **Wariancja koloru.** Paczka ma po ~3 albedo na klasę; gracz zajmuje 2. NPC V1 ma jeden stały tint na outfit — wszyscy farmerzy wyglądają tak samo. Seed-random między wolnymi wariantami jest możliwy dopiero gdy klasa ma ≥2 wolne atlasów (Peasant/Wizard nie mają).

## Rekomendacje

- V1 = tabela farmer/woodcutter → Peasant `T_Peasant_3`, trader → Wizard `T_Wizard_3`, dorośli, obie płcie, reszta Modular.
- Nie mapować po imionach reserved NPC.
- Nie forkuć pipeline gracza; żeńskie Peasant/Wizard i sidecar NPC to rozszerzenie tych samych skryptów.
- Hunter → Ranger `T_Ranger_2` jako **następny** wiersz tej samej tabeli, nie równoległy system.
- Shared tint helper, nie kopia `applyOutfitTint` w `NpcAgent`.
- Publiczne API resolvera z JSDoc / `@domain npc` pod preflight.

## Poza zakresem (nawet po `planned`)

- Per-slot / 037.
- Żeński gracz (ten sam compose może go odblokować przy okazji, ale nie wpiąć w `resolvePlayerAppearance`).
- Pełna migracja wszystkich NPC na UBC.
- Persystowany appearance / character creator.
- UAL2 labour clipy, Mixamo, tools-007 MPFB2.
- Retarget UAL → Modular.
- Nowe itemy w katalogu, zmiana `CURRENT_SAVE_VERSION`.

## Weryfikacja (gdy będzie implementacja)

- Home: Anna i Piotr = Peasant szafirowy; Kasia = Wizard karmazyn; Marek = Modular. Gracz bez zbroi = Peasant oliwkowy (default), nie ten sam tint co Anna/Piotr.
- Wygenerowany farmer/woodcutter/trader w innej osadzie = UBC; `guard`/`hunter`/`blacksmith` w V1 = Modular.
- Dziecko farmera = Modular, nie UBC.
- Idle / walk UBC (UAL) i Modular w tej samej osadzie bez T-pose. Combat/death UBC: `Sword_Attack` / `Death01` albo cichy fallback.
- `?playerTint=brown` na graczu nie recoloruje NPC (materiały sklonowane).
- Reload / `WorldBundle` rebuild: ten sam NPC, ten sam outfit (derywacja z roli, nie save).
- Hunter/Ranger **nie** w checklistcie V1.

## Weryfikacja po Hunter increment (osobno)

- `hunter` dorosły = Ranger `T_Ranger_2`, nie zielony default gracza i nie oliwkowy `T_Ranger_3`.
- Gracz w `leather_armor` nadal zielony Ranger.
