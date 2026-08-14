Plan: 117 - NPC — naturalne reakcje na Bohatera

Status: "planned"
Scope: mała zmiana istniejącego systemu "lookAtPlayer" / reakcji NPC
Cel: NPC mają zwykle ignorować gracza, ale ich osobowość, relacja z Bohaterem i reputacja Bohatera mogą sprawić, że zaczną reagować coraz wyraźniej.

1. Obecny stan

NPC mają już mechanizm reakcji na obecność gracza:

- "NpcAgent" posiada fazę "lookAtPlayer".
- Reakcja jest powiązana z dystansem do gracza.
- "pausePersonalityParams()" wykorzystuje Big Five, m.in. "openness" / "extraversion".
- Istnieje już cooldown reakcji i mechanizm tłumienia reakcji w grupie.
- NPC mają "traits", osobowość i relacje z graczem.
- Relacje są już częścią istniejącego systemu questów/progresji.

Nie tworzyć równoległego systemu relacji ani osobowości. Rozszerzyć istniejący mechanizm reakcji.

2. Nowe zachowanie

Domyślnie NPC ignoruje gracza.

Samo wejście gracza w "triggerDistance" nie powinno już oznaczać automatycznej reakcji.

Zamiast tego wyliczana jest "reactionChance".

Przykładowy model:

reactionChance =
  baseChance
  + personalityBonus
  + traitBonus
  + relationshipBonus
  + reputationBonus

Wartość końcowa jest ograniczona do "0..1".

Bazowa szansa

Zwykły NPC powinien mieć niewielką szansę reakcji, np. około:

baseChance = 0.03–0.05

Czyli większość NPC przechodzi obok Bohatera bez żadnej reakcji.

Osobowość

"openness" / "extraversion" powinny zwiększać zainteresowanie obecnością Bohatera.

Przykładowo:

- zamknięty / mało otwarty NPC → niewielki bonus,
- neutralny → mały bonus,
- bardzo otwarty NPC → około "+15–20%".

Nie dodawać nowego systemu osobowości. Wykorzystać istniejące Big Five.

Trait

Jeżeli istniejący "traits" pozwala sensownie reprezentować ciekawość, można dodać lub wykorzystać trait typu:

'curious'

Trait powinien być prostym dodatkowym modyfikatorem, np. około:

+10–15%

Nie tworzyć osobnego „curiosity system”.

Relacja NPC → Bohater

Istniejący poziom relacji powinien zwiększać szansę.

Przykładowo:

Relacja| Bonus
stranger| +0%
acquainted| +5%
friendly| +10–15%
trusted| +20–25%

To ma być sygnał: „znam tego człowieka / lubię go”, a nie osobna mechanika.

Reputacja Bohatera

Jeżeli istniejący system reputacji pozwala określić, że Bohater jest znaną lub cenioną osobą, reputacja może dodatkowo zwiększać reakcję.

Przykładowo:

- brak reputacji → "+0%"
- lokalnie znany → "+10%"
- bardzo dobra reputacja → "+20–25%"

Jeżeli aktualny system reputacji nie ma jeszcze odpowiedniego API, agent powinien najpierw znaleźć istniejące źródło danych i nie tworzyć drugiego systemu reputacji tylko dla tej funkcji.

3. Przykładowe efekty

Nie każda pozytywna reakcja musi oznaczać ten sam efekt.

Pierwsza wersja może mieć kilka poziomów:

Zwykła reakcja

- NPC zatrzymuje się.
- Spogląda na Bohatera.
- opcjonalnie odtwarza istniejący krótki reaction sound.
- po chwili wraca do swojej aktywności.

Ciepła reakcja

Przy wyższej relacji / reputacji:

- zatrzymanie,
- spojrzenie,
- krótka kwestia dialogowa, np. "Bohater!",
- machnięcie / pozytywna animacja, jeżeli istnieje odpowiednia animacja.

Entuzjastyczna reakcja

Przy bardzo wysokiej relacji + reputacji:

«„Bohater! Hej!”»

albo:

«„Brawo!”»

Może to być początkowo tylko istniejący system krótkich dialogów / reakcji audio. Nie budować osobnego systemu emocji.

4. Ważne ograniczenie

Wysoka reputacja nie powinna automatycznie powodować 100% reakcji każdego NPC.

Przykład:

bardzo otwarty + lubi Bohatera + wysoka reputacja
→ 80–100%

zamknięty + nieufny + lubi Bohatera + wysoka reputacja
→ np. 40–60%

Charakter NPC powinien pozostać filtrem.

Dzięki temu dwóch NPC stojących obok siebie może zobaczyć tego samego Bohatera i zachować się inaczej.

5. Integracja z istniejącym group suppression

Obecne "nearbyNpcCount" / group reaction dampening pozostaje.

Kolejność logiczna:

Czy NPC może teraz przerwać aktualną czynność?
        ↓
Czy Bohater jest wystarczająco blisko?
        ↓
Oblicz bazową szansę
        ↓
+ osobowość / traits
        ↓
+ relacja
        ↓
+ reputacja
        ↓
group suppression
        ↓
random roll
        ↓
reaction

Nie usuwać obecnego tłumienia grupowego.

Grupa nadal powinna ograniczać sytuację, w której pięciu NPC jednocześnie reaguje na Bohatera.

6. Zakres implementacji

Agent powinien:

1. znaleźć obecny kod "lookAtPlayer", "pausePersonalityParams()" i "reactionChance";
2. znaleźć istniejące źródło relacji NPC ↔ player;
3. znaleźć istniejące źródło reputacji Bohatera;
4. zaprojektować małą funkcję wyliczającą końcową szansę reakcji;
5. zachować istniejący cooldown i group suppression;
6. nie tworzyć nowego systemu relacji, reputacji ani osobowości;
7. wykorzystać istniejące "traits" / Big Five;
8. dodać kilka poziomów reakcji, ale bez rozbudowy FSM o nową równoległą architekturę;
9. zachować niską częstotliwość wykonywania — nie wykonywać kosztownych obliczeń co klatkę;
10. dodać testy jednostkowe dla kalkulacji szans.

7. Kryteria sukcesu

Po zmianie:

- większość NPC ignoruje przechodzącego Bohatera;
- ciekawscy / otwarci NPC reagują wyraźnie częściej;
- sympatia NPC do Bohatera zwiększa reakcję;
- reputacja Bohatera zwiększa reakcję;
- bardzo pozytywna kombinacja może dawać około "80–100%";
- zamknięty / nieufny NPC nadal może ignorować Bohatera;
- NPC w grupie reagują rzadziej;
- różni NPC mogą reagować różnie na tego samego Bohatera;
- istniejący FSM, cooldown i system dialogów pozostają używane;
- nie powstaje nowy parallelny social/reputation system.

8. Zasada projektowa

To nie ma być system „NPC zawsze zauważa gracza”.

Ma powstać efekt:

«Bohater staje się coraz bardziej zauważalną osobą w świecie, ale każdy NPC reaguje na niego trochę inaczej.»

Najpierw Bohater jest dla większości mieszkańców po prostu kolejną osobą na drodze.

Z czasem, przez relacje i reputację, coraz częściej można zauważyć:

«spojrzenie → zatrzymanie → „Hej!” → „Bohater!” → entuzjastyczna reakcja.»

To powinno być małe rozszerzenie istniejącego systemu, a nie nowy subsystem społeczny.