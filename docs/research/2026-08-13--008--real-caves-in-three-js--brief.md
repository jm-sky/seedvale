# Research brief: prawdziwe jaskinie podziemne w Seedvale

**Data:** 2026-08-13
**Cel:** research + za/przeciw technik, **nie implementacja**.
**Werdykt użytkownika na końcu:** czy chcemy tylko kilka jaskiń-landmarków, czy architekturę, która uniesie większe lokacje (kilka korytarzy + sala).

---

## 1. Problem

Obecne „jaskinie” to **rów w heightmapie otoczony kamieniami**, nie tunel pod ziemią.

Użytkownik chce jaskinię, w którą **wchodzi się pod ziemię**:

| Wymiar | Minimum (v1) | Możliwy wzrost |
|--------|----------------|----------------|
| Przekrój korytarza | ~3–4 m szer. × 2–4 m wys. | ten sam |
| Długość | ~20–30 m | 3–4 korytarze po 20–30 m |
| Forma | ślepy korytarz | **graf**: korytarze + **podziemna sala** |
| Wejście | w zbocze, nie dziura w łące | 1+ wejść? |

Pytanie produktowe, nie tylko graficzne: **kilka ozdobnych dziur**, czy **pierwsza prawdziwa lokacja 3D w świecie 2.5D**.

---

## 2. Stan kodu (fakt, nie plan)

Dwa osobne systemy:

1. **Fauna cave spawner** — `src/settlement/props.ts` `createCaveMouth`, `src/fauna/createFauna.ts`.
   Plan [064](docs/plans/2026-08-11--064--cave-spawner-road-avoidance-and-visual.md): skały + etykieta.
   Plan [083](docs/plans/2026-08-12--083--cave-mouth-terrain-depression.md): depresja `modifyTerrain`.
   **Świadomie bez geometrii podziemnej.** Legowisko lisów/wilków.

2. **Large caves** — `src/world/largeCaves.ts`, `createLargeCaves.ts`, `largeCaveVisual.ts`.
   Plan [090](docs/plans/2026-08-12--090--sword-merchant-tent-caves-pickaxe.md) §4: otwór ~3×3 m, „tunel” 10–15 m, puste, walk-in.
   Implementacja: seria `modifyTerrain` (głębokość ~2.2–2.8 m) + skały wzdłuż rowu.
   **„Tunel” = otwarty rów.** Gracz nie jest pod dachem.

Teren: chunkowana **heightmapa** (`ChunkManager`, worker, `buildChunkGeometry`).
`modifyTerrain` tylko obniża/podnosi Y — **jedna wysokość na (x,z)**. Nie da się mieć podłogi i dachu.

Gracz: `PlayerController.snapToGround()` → `sampleHeight(x, z)`. Brak volumenu, brak interiors. Domy to skorupy (SFX drzwi w backlogu, nie ma wchodzenia). Jaskinia byłaby **pierwszym wnętrzem 3D**.

Streaming: chunk load/unload. Large caves żyją w `WorldBundle` i rzeźbią heightmapę (reapply przy rebuild chunka). Trawa/drzewa/woda zakładają powierzchnię.

Powiązane kierunki produktu:

- VISION: świat ciągły, nie theme-park; authored scenarios OK jako uzupełnienie (jaskinie, ruiny, skarb, unikalny mob) — [docs/roadmap/02-systems.md](docs/roadmap/02-systems.md) „Quests and authored scenarios”.
- Plan 090: architektura ma **później** pozwolić na skarb + mob + dodatkową lokację; v1 puste.
- Plan 049: procedural landmarks; jaskinia duża jest raczej **rzadkim landmarkiem / scenariuszem**, nie biomem.
- Plan 093: questy mogą wskazywać landmark.

**Nie mylić** fauna-cave z large-cave. Fauna może zostać fasadą. Research dotyczy **lokacji do eksploracji**.

---

## 3. Twarde ograniczenie

Three.js **umie** renderować tunel (dowolny mesh).
Seedvale **nie umie** wydrążyć heightmapy w 3D.

Żeby było pod ziemią, trzeba **nowej techniki** obok heightmapy, albo przebudowy terenu (woksle/SDF) — to zmiana całego świata, nie feature jaskiń.

Od spodu mesh terenu zwykle nie istnieje (jedna strona). Dach **musi być geometrią jaskini**, nie „spodem łąki”.

---

## 4. Kandydaci (do oceny, nie do wyboru w ciemno)

### A. Heightmapa dalej (status quo+)
Pogłębić/wydłużyć `modifyTerrain`, więcej skał.
**Odrzucić jako rozwiązanie „pod ziemię”** — zawsze rów bez dachu. Zostawić tylko dla fauna-mouth.

### B. Osobny mesh wnętrza + lokalna kolizja (propozycja z rozmowy)
Tunel/sala jako mesh (proceduralny `Tube`/`Extrude` albo GLB). Heightmapa zostaje. Wejście: mała depresja + skały. W AABB jaskini Y z podłogi mesha, nie z `sampleHeight`. Kamera nie może wyjechać nad dach.

- **Za:** bez przebudowy terenu; 1 korytarz 20–30 m jest w zasięgu; Three.js wystarcza; streaming świata nietknięty.
- **Przeciw:** pierwszy interior w projekcie (gracz, kamera, światło, trawa, AI). Szew wejścia. Tunel 20–30 m wymaga **grubego zbocza** na całej długości, inaczej przebija wzgórze. Graf 3–4 korytarzy + sala **nie jest prostym rozszerzeniem jednego tuby** — potrzebny generator layoutu + dach nad rozgałęzieniami + kolizja nie-AABB.
- **Prostota v1 (1 korytarz):** średnia, nie mała — kolizja/kamera/światło/trawa to prawdziwa praca.
- **Prostota v2 (graf + sala):** już osobny mini-system lokacji.

### C. Dziura w meshu terenu + wnętrze (hole punch)
Jak B, plus wycięcie trójkątów / discard w shaderze na otworze, żeby wejście było prawdziwą dziurą.

- **Za:** lepszy szew, mniej „skały zasłaniają oszustwo”.
- **Przeciw:** kontrakt ze streamingiem chunków, trawą, szwem między chunkami, LOD. Koszt niewspółmierny do v1, może wrócić przy sali pod płaskim terenem.

### D. Skalny garb / outcrop z wydrążonym wnętrzem (CSG lub authored volume)
Nie kopiemy łąki — stawiamy bryłę skały z tunelami w środku.

- **Za:** mniej walki z heightmapą; dach = skała; działa na płaskim; CSG (`three-bvh-csg`) albo GLB.
- **Przeciw:** czyta się jako kopiec/bunkier, nie „wejście w zbocze”. Duża sala = duża góra. CSG w runtime vs precompute.

### E. Portal / osobna scena jaskini
Wejście → fade → inna przestrzeń (lokalne coords albo instancja).

- **Za:** tanie, dowolnie duże wnętrze, zero dziur w heightmapie.
- **Przeciw:** kłóci się z ciągłym światem VISION; fauna/NPC/światło/deszcz nad jaskinią; minimapa; „świat żyje niezależnie”. Do rozważenia tylko jeśli research uzna B/C za zbyt drogie względem wartości.

### F. Woksle / SDF / CSG całego terenu
Prawdziwe 3D caves jako biom.

- **Za:** jedyny sposób na „jaskinie wszędzie”, mining 3D, rzeki podziemne.
- **Przeciw:** nowy silnik terenu (chunki, worker, trawa, woda, kolizja, save). Nie uzasadnione kilkoma landmarkami. Odrzucić chyba że produkt chce **system jaskiń w świecie**, nie lokacje.

---

## 5. Skala produktu — to jest główne pytanie

Trzy poziomy ambitności (research ma powiedzieć, który unosi która technika, bez overengineeringu):

| Poziom | Co | Ile w świecie | Technika min. |
|--------|----|---------------|----------------|
| **L1** | 1 ślepy korytarz 20–30 m, puste | kilka–kilkanaście landmarków | B (może D) |
| **L2** | 3–4 korytarze + sala, 1–2 wejścia, później skarb/mob/quest | rzadkie „duże” jaskinie | B z **grafem layoutu**, albo D, albo E |
| **L3** | jaskinie jako cecha geografii / biom | wiele, streaming, fauna w środku | F albo bardzo dojrzałe B+C |

Użytkownik **już mówi o L2** („możemy chcieć”). Ryzyko L1-only: B na jedną rurę, potem wyrzut i drugi system.

Hipoteza do obalenia lub potwierdzenia:

> Dla Seedvale właściwe jest **L2 jako sufit na 1–2 lata**: rzadkie authored/proceduralne lokacje pod wzgórzem, nie biom jaskiń. L1 jako pierwszy milestone **tej samej** abstrakcji (graf korytarzy, nawet jeśli v1 ma 1 krawędź). L3 poza zakresem.

---

## 6. Ukryty koszt „prostego mesha” (L1)

Nawet jeden korytarz rusza więcej niż `largeCaveVisual.ts`:

1. **Siting** — stok z zapasem miąższości na 20–30 m × (wysokość korytarza + dach + nadkład). Dziś `measureSlope` na 4 m i `drop ≥ 0.85` to za mało.
2. **Kolizja gracza** — override `sampleHeight` w objętości; sala i skrzyżowania ≠ jeden AABB.
3. **Kamera 3rd person** — clip / shrink distance, inaczej wyjeżdża nad ziemię.
4. **Trawa / drzewa / props** — dziura w instancingu w objętości + wokół otworu.
5. **Światło** — ciemno w środku, PointLight przy wejściu; N8AO, fog, day/night, pochodnia gracza.
6. **AI** — fauna/NPC nie powinny wpadać w mesh ani chodzić po dachu; v1: wykluczyć volume.
7. **Woda** — jaskinia vs water table (`waterLevel`, jeziora).
8. **Streaming** — mesh jaskini vs chunk unload; czy jaskinia pinuje chunki.
9. **Szew wejścia** — z-fight terenu z dachem; skały vs hole punch.
10. **Save / determinism** — jak large caves: seed → te same site’y.

L2 dokłada: generator grafu, sala (większa rozpiętość dachu), 2+ wejścia, nawigacja, ewentualnie minimapa pod ziemią.

---

## 7. Sugestie (do skrytykowania przez research)

1. **Nie tunować `modifyTerrain` na „prawdziwą jaskinię”.**** Rów zostaje dla fauna-cave.
2. **Nie zaczynać od wokseli.**
3. **Nie obiecywać L1 jako „potem dodamy korytarze” bez modelu grafu.** Rura i graf to inna złożoność kolizji/sitingu, ale ten sam *typ* obiektu (volume + mesh + floor sampler).
4. **Rozdzielić fauna-mouth vs exploration cave** w docs i kodzie, żeby nie pchać lisów do sali 30 m.
5. **Domyślna hipoteza techniczna:** L2-capable **cave volume** (graf segmentów + komnaty) jako mesh + floor collider; heightmapa tylko na ujście; hole punch odłożony. Portal tylko jeśli siting w wzgórzu się wyłoży. CSG/outcrop jako fallback na płaskim.
6. **Gameplay v1 puste** (zgodnie z 090), ale volume musi umieć później: skarb, mob, quest (093), światło gracza, może ognisko.
7. **Performance:** kilka meshy ~setki–niskie tysiące tris jest tanie; drogie jest CPU siting + grass hole + kamera co klatkę. Worker tylko jeśli generator layoutu/sitingu będzie ciężki.

---

## 8. Pytania do researchu

### Produkt
- Czy jaskinia to **rzadki scenariusz/landmark** (VISION authored), czy **cecha terenu**?
- Ile jaskiń L1 vs L2 na seed w promieniu grywalnym (~1 km od domu)?
- Czy NPC/fauna **kiedykolwiek** mają wchodzić, czy tylko gracz?
- Czy kopanie łopatą/kilofem ma **łączyć się** z jaskinią, czy to osobny fantasy (survival mining vs lokacja)?
- Czy sala ma być pod **łąką** (wymaga dziury/nadkładu), czy zawsze pod **wzgórzem/klifem**?

### Technika
- Czy B unosi L2 bez C (hole punch)? Gdzie szew się sypie?
- Jak inne gry na heightmapie robią 1–2 wejścia + komnatę (BotW, Valheim, tessellation-era RPGs, Three.js demos)? Co z tego jest realne w vanilla Three + chunkowanym terenie?
- `three-bvh-csg` / mesh BVH vs ręczny tube: koszt, streaming, determinism?
- Jak zrobić **floor sampler** dla grafu (korytarz+sala) bez pełnego physics engine? Dziś nie ma physics, tylko height snap.
- Kamera: istniejący boom vs jaskinia — minimalny hack vs prawdziwy collision.
- Trawa: czy da się wyciąć volume w obecnym grass path (`grass.ts`, worker) bez drugiej ścieżki?
- Wejście na granicy **dwóch chunków** — blocker?
- Fog/day-night/N8AO we wnętrzu — artefakty?
- Czy pierwsze wnętrze (jaskinia) powinno być **wspólnym seamen** pod przyszłe wnętrza domów, czy jaskinia-only? (VISION: extend couplings, nie równoległe mechanizmy.)

### Ryzyko
- Co jest **najtańszym L1**, które nie zamyka L2?
- Co jest **false economy** (szybka rura, potem rewrite)?
- Kiedy powiedzieć „za drogie, zostawiamy rów + portal na 1 dungeon”?

---

## 9. Co przeczytać (kolejność)

1. Ten brief.
2. [docs/STATE.md](docs/STATE.md) — LargeCaves, fauna cave, WorldBundle, dig.
3. [docs/VISION.md](docs/VISION.md) + [docs/architecture/performance-and-workers.md](docs/architecture/performance-and-workers.md).
4. Plany: [064](docs/plans/2026-08-11--064--cave-spawner-road-avoidance-and-visual.md), [083](docs/plans/2026-08-12--083--cave-mouth-terrain-depression.md), [090](docs/plans/2026-08-12--090--sword-merchant-tent-caves-pickaxe.md) §4, [049](docs/plans/2026-08-09--049--procedural-world-landmarks.md).
5. Kod: `src/world/createLargeCaves.ts`, `largeCaveVisual.ts`, `largeCaves.ts`; `ChunkManager.modifyTerrain`; `PlayerController.snapToGround`; `src/terrain/buildChunkGeometry.ts`; grass path.
6. Issue [026](docs/issues/2026-08-12--026--cave-mouth-flat-prop-not-a-hole.md) — świadomy scope-out interiors.

Prawda: **kod > STATE > plan**. Plan 090 mówi „tunel”; kod robi rów.

---

## 10. Oczekiwany deliverable

Dokument research (np. `docs/research/YYYY-MM-DD--NNN--underground-caves.md` wg konwencji repo), **po polsku**:

1. **Werdykt na górze** — rekomendowany poziom (L1/L2/L3) + technika na 12–24 mies. + milestone v1.
2. Tabela technik A–F: za / przeciw / koszt / czy unosi L2 / blocker w *tym* codebase.
3. Czy „osobny mesh + lokalna kolizja” jest **proste** — rozbić L1 vs L2, bez marketingu „to tylko mesh”.
4. Minimalna abstrakcja, która nie wymusza rewrite przy sali i 3–4 korytarzach.
5. Lista couplingów do ruszenia (gracz, kamera, trawa, światło, streaming, AI).
6. Jawne **otwarte pytania do użytkownika** (3–7), jeśli produkt blokuje technikę.
7. Status wiedzy: ✅ kod / 🟡 założenie / ❓ otwarte.

**Nie implementować. Nie oznaczać planów done. Nie przebudowywać large caves w tej sesji.**
