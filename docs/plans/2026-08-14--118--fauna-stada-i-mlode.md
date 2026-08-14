Plan: Fauna — stada i młode

Status: "planned" 📋
Created: 2026-08-14
Priority: 🟡 medium · Effort: M
Depends on: /094/

Cel

Dodać do istniejącej fauny dwa widoczne, ale małe elementy życia zwierząt:

- zwierzęta stadne poruszają się razem,
- młode podążają za matkami i po czasie dorastają.

Nie budować jeszcze pełnego systemu reprodukcji ani osobnego systemu AI dla stad.

                    ┌──────────────┐
                    │ AnimalAgent  │
                    └──────┬───────┘
                           │
             ┌─────────────┴─────────────┐
             ↓                           ↓
        herd / group                 mother / young
             │                           │
        follow leader                follow mother
             │                           │
             └─────────────┬─────────────┘
                           ↓
                    existing AnimalLife
                    food / water / threat

Stan wyjściowy

Fauna posiada już:

- "AnimalAgent" / "AnimalLife",
- potrzeby hunger/thirst,
- realne źródła jedzenia i wody,
- predator/prey,
- flee/chase,
- combat i śmierć zwierząt,
- istniejące identyfikatory zwierząt wykorzystywane m.in. przez questy.

Nowa funkcjonalność powinna rozszerzać ten mechanizm zamiast tworzyć drugi FSM lub "FaunaGroupManager".

1. Stada

Gatunki stadne

Gatunek| Zachowanie
🦌 Sarna| zwarte stado
🦌 Jeleń| zwarte stado
🐗 Dzik| stado
🐇 Zając| luźna mała grupa
🐺 Wilk| poza zakresem v1

Model v1

Grupa posiada:

- "herdId",
- opcjonalnego "leaderId",
- członków grupy.

Nie potrzebujemy jeszcze trwałego obiektu "Herd" jako osobnego systemu.

Przy utworzeniu/spawnie grupy:

1. wybierane są zwierzęta tego samego gatunku,
2. część z nich otrzymuje wspólne "herdId",
3. jedno zwierzę zostaje liderem,
4. pozostałe dostają bias ruchu w stronę grupy/lidera.

Zachowanie

Normalny wander zostaje zachowany.

Stado jedynie modyfikuje wybór celu:

normal wander
     +
herd cohesion bias
     ↓
target

Członek stada:

- utrzymuje rozsądny dystans od lidera,
- nie oddala się nadmiernie od grupy,
- może chwilowo odłączyć się podczas flee,
- po zakończeniu zagrożenia próbuje wrócić do grupy.

Threat/flee nadal ma pierwszeństwo.

Nie budować osobnego FSM.

Lider

Lider korzysta z istniejącego wander / food / water.

Pozostałe zwierzęta podążają za jego kierunkiem, ale nadal mogą reagować na:

- głód,
- pragnienie,
- zagrożenie,
- teren.

Dzięki temu stado nie staje się jednym sztywnym obiektem.

2. Młode

Model v1

Zwierzę może posiadać:

- "lifeStage": "adult | juvenile",
- "motherId" dla młodego,
- opcjonalnie podstawowe dane wieku.

Młode nie wymagają osobnego systemu zachowania.

Ich podstawowa zasada:

juvenile
   ↓
mother exists?
   ├─ yes → follow mother
   └─ no  → normal young-animal wander

Generowanie

Na tym etapie nie implementować reprodukcji.

Młode mogą pojawiać się razem z generowanym/spawnowanym stadem.

Przykładowo:

- stado 4–8 dorosłych,
- 0–2 młode.

Dokładne proporcje powinny być konfigurowalne per gatunek.

Młode powinny być rzadsze niż dorosłe.

Follow mother

Młode:

- utrzymuje niewielki dystans od matki,
- wybiera matkę jako preferowany cel ruchu,
- podąża za nią podczas wander,
- nie blokuje istniejącego flee,
- po utracie matki przechodzi do prostego zachowania zastępczego.

Nie wymagamy jeszcze:

- ochrony młodych przez matkę,
- karmienia,
- specjalnych animacji,
- rodziny jako osobnego systemu.

3. Dorastanie

Po upływie prostego czasu:

juvenile
    ↓
age += delta
    ↓
maturity threshold
    ↓
adult

Po dorastaniu:

- "lifeStage → adult",
- "motherId → undefined",
- zwierzę zaczyna korzystać z normalnego zachowania dorosłego,
- może pozostać w istniejącym stadzie.

Nie zmieniać jeszcze modelu 3D ani rozmiaru w runtime, chyba że istniejący asset/pipeline pozwala zrobić to praktycznie bez dodatkowego zakresu.

4. Integracja z istniejącymi systemami

Nowe zachowanie musi współpracować z:

- "AnimalLife",
- hunger/thirst,
- forage/drink,
- predator/prey,
- flee/chase,
- combat,
- existing animal IDs.

Priorytet zachowań:

threat / flee
      ↓
critical need
      ↓
mother / herd cohesion
      ↓
food / water
      ↓
normal wander

Dokładna kolejność powinna zostać dopasowana do istniejącego lifecycle zamiast tworzenia nowej hierarchii AI.

5. Śmierć i utrata członka grupy

Nie tworzyć rozbudowanego lifecycle.

Jeżeli:

- matka umrze → młode traci "motherId",
- lider umrze → grupa wybiera nowego lidera,
- członek stada umrze → pozostali automatycznie kontynuują.

Nie potrzebujemy jeszcze mechanizmu rozpadu/reorganizacji dużych grup.

Poza zakresem

- ❌ rozmnażanie,
- ❌ ciąża / poród,
- ❌ genetyka,
- ❌ pełna genealogia zwierząt,
- ❌ osobny "HerdManager",
- ❌ rozbudowany FSM stad,
- ❌ terytoria i migracje,
- ❌ sezonowe rozmnażanie,
- ❌ specjalne zachowania rodzicielskie,
- ❌ nowe modele/animacje młodych,
- ❌ persystencja fauny,
- ❌ wilcza wataha.

Kryteria akceptacji

1. 🦌 Kilka jeleni/saren widocznie porusza się jako grupa zamiast całkowicie niezależnie.
2. 🐗 Dziki zachowują spójność grupy podczas normalnego wander.
3. 🐇 Luźne grupy zajęcy nie muszą poruszać się tak ciasno jak jelenie/dziki.
4. 🐾 Młode widocznie podążają za matką.
5. ⚔️ Flee/chase nadal działa niezależnie od stada lub matki.
6. ☠️ Śmierć lidera/matki nie powoduje błędów ani „martwych” referencji.
7. 🌱 Młode po czasie stają się dorosłe i przestają wymagać matki.
8. 💧 Jedzenie i picie nadal korzystają z istniejącego systemu z planu 094.
9. 🧠 Nie powstaje drugi FSM ani osobny równoległy system AI.
10. ⚡ Aktualizacja grup nie powoduje niepotrzebnego kosztu per-frame dla wszystkich zwierząt.

Późniejszy rozwój

Ten plan powinien zostawić prostą bazę pod:

- reprodukcję,
- naturalny przyrost populacji,
- rodziny zwierząt,
- większe grupy,
- migrację,
- zachowanie drapieżników wobec stad,
- sezonowość,
- naturalną dynamikę populacji.

Ważne: v1 ma przede wszystkim sprawić, żeby fauna wyglądała na bardziej żywą. Nie próbujemy jeszcze symulować całego cyklu życia zwierząt.