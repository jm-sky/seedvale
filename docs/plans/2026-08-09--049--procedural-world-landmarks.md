# Proceduralne obiekty i landmarki terenu — v1

## Cel

Wzbogacić proceduralny teren o losowo rozmieszczane obiekty, ozdoby, ruiny i proste budowle.

W pierwszej wersji priorytetem jest **prostota wykonania i czytelność wizualna**. Konstrukcje powinny być możliwe do zbudowania z podstawowych low-poly elementów: boxów, cylindrów, stożków, prostych kamieni i prostych meshów.

Nie chodzi jeszcze o duże, szczegółowe lokacje, ale o nadanie światu charakteru i poczucia, że wcześniej coś się tutaj wydarzyło.

## Zasada prostoty i czytelności

Prosta konstrukcja może wyglądać bardzo dobrze nawet wtedy, gdy składa się z niewielkiej liczby prostych polygonów.

> **Jeżeli obiekt jest z natury prosty, upraszczamy go bez obaw.**

Przykłady:

- kamienny krąg,
- monolit,
- prosty ołtarz,
- kamienna brama,
- stos głazów,
- prosty właz.

Problem pojawia się wtedy, gdy konstrukcja sama w sobie nie jest prosta.

Nie należy wtedy tworzyć jej jako przypadkowego zestawu podstawowych brył, ponieważ może powstać obiekt wizualnie nieczytelny — np. kilka cylindrów i bloków, które nie komunikują graczowi, czym właściwie są.

> **Jeżeli konstrukcja jest z natury bardziej złożona, mamy dwie możliwości:**
>
> 1. odłożyć ją na później,
> 2. albo poświęcić więcej geometrii i detali, aby zachować jej czytelność.

Nie chcemy „low-poly za wszelką cenę”.

Celem jest:

**prosta geometria → prosta konstrukcja → czytelny obiekt → dobry efekt wizualny.**

Jeżeli trzeba użyć większej liczby polygonów, żeby gracz od razu rozpoznał „to jest ruina domu”, „to jest studnia” albo „to jest ołtarz”, jest to lepsze rozwiązanie niż zrobienie taniego, ale niezrozumiałego zbioru cylindrów.

## Kategorie rzadkości

### Częste

Drobne elementy pojawiające się stosunkowo często:

- pojedyncze kamienne słupy / monolity,
- głazy i grupy głazów,
- fragmenty starego muru,
- opuszczone ognisko,
- małe ołtarzyki,
- kamienne lub drewniane elementy zabudowy.

### Rzadkie

Małe lokacje składające się z kilku prostych elementów:

- ruiny małego domu,
- mały cmentarz,
- mała kapliczka,
- kamienny krąg,
- opuszczona chata,
- niewielka wieża obserwacyjna,
- ruiny mostu,
- stara studnia,
- mała kamienna brama.

### Bardzo rzadkie

Większe, charakterystyczne landmarki świata:

- Stonehenge / duży kamienny krąg,
- duży kamienny właz,
- grupa ogromnych monolitów,
- większe ruiny,
- duża kamienna brama,
- samotna wieża,
- większa świątynia / ołtarz.

Takie miejsca powinny być bardziej dopracowane i interesujące wizualnie, ale nadal możliwe do stworzenia z prostych low-poly elementów.

## Modułowe konstrukcje

Landmarki nie powinny być wyłącznie pojedynczymi prefabami.

Docelowo warto budować je z **modułowych elementów konstrukcyjnych**, np.:

- `stone_block`,
- `stone_pillar`,
- `stone_slab`,
- `wood_beam`,
- `wall_segment`,
- `foundation`,
- `roof_piece`,
- `monolith`.

Generator może losować:

- wariant konstrukcji,
- liczbę elementów,
- ich rozmiar,
- rotację,
- niewielkie przesunięcia,
- stopień zniszczenia.

Dzięki temu np. dwie ruiny tego samego typu nie muszą wyglądać identycznie.

## Rozmieszczenie

Landmarki powinny być rozmieszczane w sposób kontrolowany przez **rzadkość per obszar/segment świata**.

Przykładowa idea:

- częste obiekty — wysoka szansa,
- małe lokacje — niższa szansa,
- duże landmarki — bardzo niska szansa, np. około 1 na 9 segmentów lub jeszcze rzadziej.

Prawdopodobieństwo kolejnych kategorii może maleć wykładniczo, np. każda kolejna klasa ma około połowę prawdopodobieństwa poprzedniej.

Dodatkowo niektóre obiekty powinny mieć warunki środowiskowe, np.:

- cmentarz — preferowane okolice osady,
- ruiny domu — preferowane tereny nadające się do zamieszkania,
- ruiny mostu — w pobliżu rzek,
- ołtarz — możliwość występowania na wzgórzach,
- kamienne landmarki — preferowane określone typy terenu.

## Czytelność i jakość ponad liczbę obiektów

Nie należy dodawać wielu typów konstrukcji tylko po to, aby generator miał większą różnorodność.

Każdy obiekt powinien przejść prosty test:

1. Czy z jego sylwetki można rozpoznać, czym jest?
2. Czy prosta geometria wystarcza, aby wyglądał dobrze?
3. Jeżeli nie — czy warto dodać potrzebne detale?
4. Jeżeli nadal nie — czy lepiej odłożyć go do późniejszego etapu?

Lepiej mieć **kilka bardzo czytelnych landmarków** niż kilkadziesiąt przypadkowych konstrukcji złożonych z cylindrów i boxów.

## Kierunek artystyczny

**Proste geometrie + dobre rozmieszczenie + skala + kompozycja** zamiast dużej liczby szczegółów.

Landmark powinien być rozpoznawalny z dystansu i tworzyć ciekawy punkt podczas eksploracji świata.

Docelowy efekt:

> „Co to jest i dlaczego ktoś to tutaj zbudował?”

Nie każdy landmark musi mieć questa, funkcję ani wyjaśnienie. Samo znalezienie interesującego miejsca jest częścią doświadczenia Seedvale.
