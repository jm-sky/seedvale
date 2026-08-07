# Seedvale — wizja i kontekst projektu

**Cel dokumentu:** dać nieznającemu repozytorium (człowiekowi lub modelowi AI) kontekst *po co* Seedvale istnieje i *w jakim duchu* dopisywać kolejne funkcje — nie tylko jak jest zbudowane technicznie. Szczegóły: [ROADMAP.md](./ROADMAP.md), [plans/](./plans/), [CLAUDE.md](../CLAUDE.md).

## 1. Czym jest Seedvale

Sandbox 3D (przeglądarkowy, **Three.js** + WebGL2) proceduralnego świata z osadą NPC-ów i ekosystemem zwierząt. Gracz chodzi po świecie w trzeciej osobie, obserwuje, rozmawia, wykonuje proste zadania — ale świat **nie jest zbudowany wokół gracza**. Wioska ma swój rytm potrzeb, zwierzęta polują i uciekają, dzień zmienia się w noc — niezależnie od tego, czy ktoś patrzy.

To nie MMO, nie multiplayer, nie pełny survival/crafting RPG. Sandbox/demo klasy „obserwuj i uczestnicz" — ile życia da się zbudować z prostych, sprzężonych systemów, zanim sięgnie się po kosztowne rozwiązania (inventory, combat, generator LLM).

## 2. Idea przewodnia

> **Plant the seed. Watch the world grow.**

Seedvale zaczyna się jako mała osada w pustym, proceduralnym świecie. Gracz nie jest centrum wszechświata — jest jednym z mieszkańców. Świat ma trwać i tworzyć własne historie niezależnie od tego, czy gracz robi coś „fabularnie ważnego", czy po prostu stoi i patrzy.

Docelowo (kierunek, nie stan obecny — sekcja 6): przybywają ludzie, zawiązują się relacje, zmieniają zasoby, zwierzęta migrują, pojawiają się konflikty. **Gracz nie pisze tej historii — jest jej świadkiem**, a czasem uczestnikiem: zadania, rozmowy, docelowo własne miejsce w świecie (dom, gospodarstwo). To rozszerza obecność gracza, ale nie zastępuje osi głównej: **życia, które toczy się dalej, gdy gracz odejdzie**.

## 3. Jakie doświadczenie ma dostarczyć

Nie: podążanie za scenariuszem, odhaczanie questów, budowa idealnej bazy.

Tak: spacer po świecie, który *wygląda jakby żył zanim tu wszedłeś* i żyje dalej po wyjściu. Rozpoznanie NPC po imieniu i charakterze, nie ikonce. Wilk poluje na sarnę, a nowa pojawia się w spawnerze. Wioska ma rytm potrzeb, NPC-e nie stoją i czekają na dialog.

Docelowy efekt: *„nie wiedziałem, że w moim świecie może się to wydarzyć"*. Emergent storytelling: historie wynikają z interakcji systemów (potrzeby × AI × ekosystem × relacje), nie ze skryptów.

## 4. Co wyróżnia Seedvale

Wiele gier symuluje **obiekty** (drzewa, zasoby, listę questów). Seedvale celuje w symulację **życia**:

- NPC-e mają potrzeby napędzające zachowanie (FSM: `choose → chop/deposit/drink/eat/goX → wander`), nie stoją czekając na gracza.
- NPC-e mają osobowość (dziś: 4 archetypy wpływające na reakcję i dobór dialogu; kierunek: więcej archetypów, zdolności, relacje).
- Zwierzęta to ekosystem, nie dekoracja: role (predator/prey), kontakt i obrażenia, HP, śmierć i respawn w spawnerach, zachowanie zależne od pory dnia.
- Świat trwa: dzień/noc, needs tickują, NPC-e i zwierzęta żyją swoim cyklem niezależnie od kamery.
- Zapis/wznowienie (IndexedDB) — gracz wraca do świata, który miał czas żyć dalej (dziś: pozycja + config, bez stanu NPC/questów).

Różnica jest architektoniczna, nie kosmetyczna: kluczowe typy są **współdzielone między systemami, nie duplikowane**. `HealthState` (HP, śmierć) to jeden generyczny typ używany przez faunę (combat) i docelowo NPC (zmęczenie zamiast obrażeń) — świadomie zamiast dwóch równoległych systemów robiących to samo. Ma to obowiązywać dalej: rozszerzać istniejące sprzężenia (needs → FSM → dialog → quest), nie budować nowych wysp.

## 5. Filozofia projektowania

**Świat.** Proceduralny teren (macro noise → realne oceany, wybrzeża, góry zamiast szumu), chunk streaming wokół gracza (load/unload radius, generacja w workerach), roślinność per-chunk. Kierunek: duży, docelowo bezkrawędziowy świat — „jak bardzo" (cube-sphere vs. prostszy ring-based streaming) świadomie nierozstrzygnięte. Styl: stylized/low-poly (Quaternius, CC0) domyślnie, nie dogmat — realizm dopuszczony tam, gdzie poprawia czytelność.

**NPC.** Warstwy jedna na drugiej: `needs → FSM → osobowość (reakcja + dialog) → dialog jednostronny → oferty questów → (kierunek) character DB, HP-jako-zmęczenie, relacje`. Cel: NPC ma czuć się jak mieszkaniec, nie automat questowy. AI/LLM later-stage do generatora questów — rozszerzenie prostszych systemów, nie zamiennik.

**Zwierzęta.** Ekosystem, nie modele z animacją chodzenia. Role determinują zachowanie, kontakt generuje obrażenia z cooldownem, śmierć zostawia zwłoki, spawnery utrzymują populację, pora dnia moduluje zachowanie. Ten sam `HealthState` co NPC.

**Systemy ogólnie.** Zasada: **unikać kolekcji niezależnych funkcji**. Przed nowym systemem sprawdzić, czy nie rozszerza istniejącego sprzężenia (needs/FSM/dialogue/HealthState/save) — duplikacja tego samego mechanizmu w dwóch miejscach to dług, nie neutralny wybór.

## 6. Obecne fundamenty

Wszystkie zaimplementowane, poza zaznaczonymi wyjątkami:

- Teren, chunk streaming, worker pool, duże regiony (oceany/góry), dzień/noc, oświetlenie, mgła, woda.
- Osada + NPC z potrzebami (woda/drewno/jedzenie), FSM, etykiety, osobowość (4 archetypy).
- Dialog gracz↔NPC `[E]` (kwestia zależna od need + osobowości).
- Quest v1 (relay między dwoma NPC), log questów, exp, relacja per NPC — *w pamięci, bez save*.
- Fauna: predator/prey, HP, obrażenia, śmierć, spawnery/respawn.
- Zapis/wznowienie (IndexedDB, Continue/New Game) — *tylko config + pozycja; bez stanu NPC/questów*.
- Post-processing, minimapa, trawa/roślinność, dźwięki reakcji NPC.
- Konfiguracja (rozdzielczość, shading, seed) przez URL/localStorage/GUI.

Gracz dziś: chodzi, obserwuje, rozmawia z NPC, może zrobić jeden hardcoded quest relay. **Brak jeszcze:** inventory, craftingu, budowania, combatu gracza — świadome luki, nie przeoczenia.

## 7. Kierunki rozwoju

- **Więcej questów**, docelowo generator (opcjonalnie LLM), gdy ręczny content przestanie się skalować.
- **Wiele wiosek** — osady rozproszone po mapie, streaming osad, questy między wioskami.
- **Głębsza charakteryzacja NPC** — character DB, więcej osobowości, zdolności modyfikujące zachowanie, HP-jako-zmęczenie (współdzielone z fauną).
- **Przedmioty, budowanie, gospodarstwo gracza** — dziś brak inventory/craft/budowy. Rozszerzenie roli gracza w stronę „mieszkaniec z własnym miejscem w świecie" (dom/działka) — spójne z ideą przewodnią, odłożone do dojrzenia podstawowych systemów życia świata.
- **Wizualny overhaul** — więcej roślinności (częściowo zrobione), chmury, góry w tle.
- **Game UI poza lil-gui** — ekran „Mieszkańcy", pełniejszy world config UI.
- **Duży/bezkrawędziowy świat** — cube-sphere vs. prostszy model, świadomie otwarte.
- **Persystencja NPC/questów w save; ambient audio** — zanotowane, nieskolejkowane.

Pełne plany: [plans/README.md](./plans/README.md). Priorytet: [ROADMAP.md](./ROADMAP.md).

## 8. Jak korzystać z tego dokumentu

Przy ocenie nowego pomysłu:

1. Czy wzmacnia poczucie **żywego świata niezależnego od gracza**, czy stawia gracza z powrotem w centrum (quest-hub, statyczny NPC-automat)?
2. Czy **rozszerza istniejące sprzężenie** (needs → FSM → dialog → quest; `HealthState`; chunk streaming) czy tworzy wyspę robiącą to samo, co coś, co już jest?
3. Czy systemy działają **także gdy gracz nie patrzy**, nie tylko w reakcji na jego akcję?
4. Czy koszt jest proporcjonalny do efektu — duże systemy (cube-sphere, inventory, generator LLM) świadomie odłożone do dojrzenia prostszych fundamentów.

Stan kodu zawsze weryfikować w [CLAUDE.md](../CLAUDE.md) i [ROADMAP.md](./ROADMAP.md) — aktualizują się częściej niż ten dokument.
