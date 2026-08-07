# Seedvale — wizja i kontekst projektu

**Cel tego dokumentu:** dać każdemu (człowiekowi lub modelowi AI), kto nie zna repozytorium, wystarczający kontekst, żeby rozumieć *po co* Seedvale istnieje i *w jakim duchu* dopisywać do niego kolejne funkcje — nie tylko *jak* jest zbudowane technicznie. Szczegóły implementacyjne żyją w [ROADMAP.md](./ROADMAP.md), [plans/](./plans/) i [CLAUDE.md](../CLAUDE.md); tu jest reszta — dlaczego te decyzje mają sens razem.

---

## 1. Czym jest Seedvale

Seedvale to sandbox 3D (przeglądarkowy, **Three.js** + WebGL2) proceduralnego świata, w którym mieszka osada NPC-ów i ekosystem zwierząt. Gracz chodzi po tym świecie w trzeciej osobie, obserwuje, rozmawia, wykonuje proste zadania — ale **świat nie został zbudowany wokół gracza**. Wioska ma swoje potrzeby i rytm, zwierzęta polują i uciekają, dzień zmienia się w noc — niezależnie od tego, czy ktoś aktualnie na to patrzy.

To nie jest MMO, nie multiplayer, nie pełny survival/crafting RPG. To sandbox/demo klasy „obserwuj i uczestnicz” — projekt eksploruje, ile *poczucia życia* da się zbudować z prostych, sprzężonych ze sobą systemów, zanim sięgnie się po kosztowne rozwiązania (pełny inventory, combat, generator LLM).

## 2. Idea przewodnia

> **Plant the seed. Watch the world grow.**

Seedvale zaczyna się jako mała osada w pustym, proceduralnie generowanym świecie. Gracz nie jest centrum wszechświata — jest jednym z jego mieszkańców. Świat ma trwać, zmieniać się i tworzyć własne historie niezależnie od tego, czy gracz akurat robi coś „ważnego fabularnie”, czy po prostu stoi i patrzy.

Docelowo (kierunek, nie stan obecny — patrz sekcja 6): z czasem przybywają ludzie, zawiązują się relacje, zmieniają się zasoby, zwierzęta migrują, ekosystemy ewoluują, pojawiają się konflikty i niespodziewane zdarzenia. **Gracz nie pisze tej historii — jest jej świadkiem**, a czasem uczestnikiem: może wykonywać zadania, wchodzić w interakcje z mieszkańcami, w przyszłości — budować własne miejsce w tym świecie (dom, gospodarstwo). To rozszerza obecność gracza w świecie, ale nie zastępuje głównej osi projektu, którą jest **życie, które toczy się dalej, gdy gracz odejdzie**.

## 3. Jakie doświadczenie ma dostarczyć graczowi

Nie: podążanie za scenariuszem, odhaczanie listy questów, budowa idealnej bazy.

Tak: spacer po świecie, który *wygląda jakby żył zanim tu wszedłeś* i będzie żył dalej, gdy wyjdziesz. Moment rozpoznania NPC po imieniu i charakterze, a nie po ikonce nad głową. Zaobserwowanie, że wilk upolował sarnę, i że za chwilę w tym samym miejscu pojawi się nowa. Poczucie, że wioska ma swój rytm potrzeb (woda/drewno/jedzenie), a nie że NPC-e stoją i czekają na dialog.

Docelowy efekt „wow” to zdanie: *„nie wiedziałem, że w moim świecie może się to wydarzyć”* — populacja wilków rośnie i zaczyna zagrażać osadzie, myśliwi znikają i brakuje jedzenia, rybak staje się ważny bo od niego zależy wioska, dwie rodziny wchodzą w konflikt o zasoby. To emergent storytelling: historie mają wynikać z interakcji systemów (potrzeby × AI × ekosystem × relacje), nie ze skryptów.

## 4. Co wyróżnia Seedvale

Wiele gier „symuluje świat” w sensie: drzewa, zasoby, budynki, lista questów do odhaczenia — czyli symuluje **obiekty**. Seedvale celuje w symulację **życia**:

- NPC-e mają potrzeby, które napędzają ich zachowanie (FSM: `choose → chop/deposit/drink/eat/goX → wander`), a nie stoją w miejscu czekając na gracza.
- NPC-e mają osobowość (dziś: 4 archetypy wpływające na reakcję na gracza i dobór linii dialogowych; kierunek: więcej archetypów, zdolności, relacje, HP-jak-zmęczenie — patrz sekcja 6).
- Zwierzęta to nie dekoracja tła — mają role (predator/prey), realny kontakt i obrażenia, HP, śmierć i respawn w dedykowanych spawnerach, zachowanie zależne od pory dnia. Ekosystem, nie animowany krajobraz.
- Świat trwa: dzień/noc, needs tickują w czasie, zwierzęta i NPC-e żyją swoim cyklem niezależnie od tego, czy kamera na nie patrzy.
- Zapis/wznowienie (single-slot IndexedDB) — gracz wraca do świata, który miał czas żyć dalej (dziś: pozycja + config; stan NPC/questów jeszcze nie persystuje — patrz sekcja 6).

Różnica jest architektoniczna, nie kosmetyczna: kluczowe typy są **współdzielone między systemami zamiast duplikowane**. `HealthState` (HP, śmierć) to jeden generyczny typ używany zarówno przez faunę (combat drapieżnik/ofiara), jak i docelowo przez NPC (zmęczenie pracą zamiast obrażeń) — świadoma decyzja, żeby nie mieć dwóch równoległych systemów robiących koncepcyjnie to samo. To samo podejście ma obowiązywać przy kolejnych systemach: rozszerzać istniejące sprzężenia (needs → FSM → dialog → quest), nie budować nowych wysp.

## 5. Filozofia projektowania

### Świat

Proceduralny teren (macro noise: continentalness/mountainness + Worley ridge → realne oceany, wybrzeża, pasma górskie zamiast jednorodnego szumu), chunk streaming wokół gracza (load/unload radius, generacja w Web Workerach, żeby nie blokować main threadu), roślinność per-chunk. Kierunek: **duży, docelowo bezkrawędziowy świat** — rewizja wcześniejszego założenia „jedna dolina wystarczy”. Pytanie „jak bardzo bezkrawędziowy” (pełny cube-sphere planet renderer vs. prostszy ring-based streaming, który *czuje się* bezkrawędziowy) jest świadomie nierozstrzygnięte — koszt pełnej sfery (node stitching, seam handling) nie jest jeszcze uzasadniony względem tego, co streaming już daje.

Styl wizualny: stylized/low-poly (Quaternius, CC0) jako domyślny — ale **nie dogmat**. Bardziej realistyczne tekstury/efekty (np. triplanar terrain) są dopuszczone tam, gdzie realnie poprawiają czytelność lub nastrój, bez trzymania się low-poly na sztywno.

### NPC

Warstwy budowane jedna na drugiej, każda rozszerza poprzednią zamiast ją zastępować:
`needs (thirst/wood/hunger) → FSM zachowań → osobowość (reakcja na gracza + dobór dialogu) → dialog jednostronny → oferty questów w dialogu → (kierunek) character DB z abilities, HP-jako-zmęczenie, relacje/sympatia per NPC`.

Cel: NPC ma czuć się jak mieszkaniec, nie jak automat questowy. Nie każdy krok musi być „inteligentny” w sensie AI/LLM — deterministyczne tabele (osobowość → parametry reakcji, need → linia dialogowa) już dziś dają zauważalne zróżnicowanie przy niskim koszcie. AI (LLM) jest rozważane later-stage do generatora questów/dialogów — nie jako zamiennik prostszych, przewidywalnych systemów, tylko jako ich rozszerzenie tam, gdzie ręczne treści by się nie skalowały.

### Zwierzęta

Ekosystem, nie zestaw modeli 3D z animacją chodzenia. Role (predator/prey) determinują zachowanie (chase/flee), kontakt fizyczny generuje obrażenia z cooldownem (nie „insta-kill” co klatkę), śmierć zostawia widoczne zwłoki (linger, nie natychmiastowe zniknięcie), spawnery utrzymują populację w równowadze. Pora dnia moduluje zachowanie (ofiary wolniejsze/spokojniejsze w nocy). To samo podejście „systemy grają razem” co przy NPC: `HealthState` współdzielony, nie wynajdywany od nowa.

### Systemy ogólnie

Zasada projektowa wprost z wizji źródłowej: **unikać kolekcji niezależnych funkcji**. Zanim dopisze się nowy system, sprawdzić, czy nie powinien być rozszerzeniem istniejącego sprzężenia (needs/FSM/dialogue/HealthState/save) — duplikacja koncepcyjnie tego samego mechanizmu w dwóch miejscach jest tu traktowana jako dług, nie neutralny wybór (patrz precedens: `HealthState` wydzielony do `src/shared/` właśnie w tym celu).

## 6. Obecne fundamenty (co już działa)

| Warstwa | Stan |
|---|---|
| Proceduralny teren, chunk streaming, worker pool, duże regiony (oceany/góry) | zaimplementowane |
| Dzień/noc, oświetlenie, mgła, woda (brzeg + integracja dzień/noc) | zaimplementowane |
| Osada + NPC z potrzebami (woda/drewno/jedzenie), FSM zachowań, etykiety | zaimplementowane |
| Osobowość NPC (4 archetypy) wpływająca na reakcję na gracza i dialog | zaimplementowane |
| Dialog gracz↔NPC (proximity `[E]`, jednostronna kwestia zależna od need+osobowości) | zaimplementowane |
| Quest v1 (relay: zanieś wiadomość między dwoma NPC), quest log, exp, relacja/sympatia per NPC | zaimplementowane (w pamięci, bez persystencji save) |
| Fauna: role predator/prey, chase/flee, HP, kontakt/obrażenia, śmierć, spawnery/respawn, wpływ pory dnia | zaimplementowane |
| Zapis/wznowienie (single-slot IndexedDB, ekran Continue/New Game, Save w pause menu) | zaimplementowane (config + pozycja gracza; NPC/quest state jeszcze nie) |
| Post-processing (ambient occlusion, antyaliasing), minimapa, roślinność/trawa, dźwięki reakcji NPC | zaimplementowane |
| Konfiguracja (rozdzielczość terenu, flat/smooth shading, seed) przez URL/localStorage/GUI | zaimplementowane |

Gracz dziś: chodzi (WASD + mysz, bieganie), obserwuje, rozmawia z NPC, może przyjąć/ukończyć jeden hardcoded quest relay. **Nie ma jeszcze:** inventory/przedmiotów, craftingu, budowania, combat gracza. To są świadome luki, nie przeoczenia — patrz sekcja 7.

## 7. Kierunki rozwoju

Uszeregowane od najbliższych/najbardziej rozpoznanych do bardziej otwartych:

- **Więcej questów i sensowniejsza treść** — dziś jeden hardcoded quest dowodzi, że pipeline (stan questa, accept/decline w dialogu, log, exp, relacje) działa. Naturalny następny krok: więcej questów, docelowo generator (opcjonalnie wspomagany LLM), gdy ręczny content przestanie się skalować.
- **Wiele wiosek** — generator osad rozproszonych po mapie (grid/Poisson, seeded), streaming osad analogiczny do chunk streamingu terenu, questy podróżujące między wioskami. Dziś: jedna, zawsze ta sama osada.
- **Głębsza charakteryzacja NPC** — character DB zamiast równoległych tablic imię/osobowość, szersze spektrum osobowości, zdolności (abilities) realnie modyfikujące zachowanie (tempo pracy, regeneracja), NPC dzielące `HealthState` z fauną jako zmęczenie (nie combat — próg dolny, NPC nie umiera).
- **Przedmioty, budowanie, gospodarstwo gracza** — dziś nie istnieje żaden system inventory/craft/budowy. To naturalne rozszerzenie roli gracza z „obserwator + rozmówca” w stronę „mieszkaniec z własnym miejscem w świecie” (np. własny dom/działka) — spójne z ideą przewodnią, ale świadomie odłożone do czasu, aż podstawowe systemy życia świata (NPC, fauna, questy) będą dojrzalsze. Klasyczne questy „przynieś X sztuk Y” czekają na ten sam fundament.
- **Wizualny overhaul** — więcej odmian roślinności (częściowo zrobione: krzewy + drzewa), niebo z chmurami, góry w tle na krawędzi mapy (dziś teren urywa się płasko).
- **Game UI poza lil-gui** — ekrany w stylu gry (pause menu i panel postaci już gotowe), docelowo m.in. ekran „Mieszkańcy” (lista NPC z HP/osobowością/potrzebą), pełniejszy world config UI.
- **Duży/bezkrawędziowy świat** — otwarte pytanie: pełny cube-sphere planet renderer vs. prostszy model, który tylko *czuje się* bezkrawędziowy. Nierozstrzygnięte świadomie, wymaga osobnej sesji decyzyjnej zanim ktoś zacznie to implementować.
- **Persystencja stanu NPC/questów w save** — dziś save obejmuje tylko config + pozycję gracza; stan questów/NPC resetuje się po wczytaniu.
- **Otoczenie dźwiękowe (ambient audio)** — pomysł zanotowany, nieskolejkowany.

Pełne, aktualne plany z detalami implementacyjnymi: [plans/README.md](./plans/README.md). Bieżący priorytet i „następne kroki dla nowej sesji”: [ROADMAP.md](./ROADMAP.md).

## 8. Jak korzystać z tego dokumentu przy planowaniu nowych funkcji

Przy ocenie, czy nowy pomysł pasuje do Seedvale, warto zadać sobie te pytania (w duchu sekcji 4–5):

1. **Czy to wzmacnia poczucie żywego świata**, który istnieje niezależnie od gracza — czy raczej stawia gracza z powrotem w centrum (klasyczny quest-hub, statyczny NPC-automat)?
2. **Czy rozszerza istniejące sprzężenie** (needs → FSM → dialog → quest; `HealthState` fauna+NPC; chunk streaming terenu) **czy tworzy nową, równoległą wyspę** robiącą koncepcyjnie to samo co coś, co już istnieje?
3. **Czy gracz zostaje świadkiem/uczestnikiem, a nie jedynym motorem zdarzeń** — systemy powinny działać także wtedy, gdy gracz nie patrzy (tickują w tle), nie tylko w reakcji na jego akcję?
4. **Czy koszt jest proporcjonalny do efektu** — projekt świadomie odkłada duże, kosztowne systemy (pełny cube-sphere, inventory/crafting, LLM-generator questów) do czasu, aż prostsze fundamenty to uzasadnią; nowa funkcja nie musi od razu być „docelową” wersją.

Ten dokument opisuje kierunek i intencję — stan faktyczny kodu (co dokładnie jest zaimplementowane, jakie pliki, jakie API) zawsze weryfikować w [CLAUDE.md](../CLAUDE.md) i [ROADMAP.md](./ROADMAP.md), bo te aktualizują się częściej.
