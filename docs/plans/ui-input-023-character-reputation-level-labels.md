# Plan: Character reputation level labels

**Created:** 2026-09-16
**Status:** `planned` 📋
**Type:** polish
**Priority:** medium · **Effort:** S
**Depends on:** ui-input-019
**Domain:** `ui-input`
**Model:** Composer, Sonnet
**Subdomains:** `menus` `feedback`
**Tags:** `character-screen` `reputation` `readability`
**Roadmap:** -

## Goal

Uczytelnić reputację w Character Screen bez zmiany jej mechaniki: obok każdej z pięciu liczbowych wartości reputacji pokazywać prosty, kolorystycznie wyróżniony poziom jakościowy, aby gracz nie musiał interpretować samego zakresu `-100..100`.

Docelowo każdy wymiar reputacji pokazuje jednocześnie:

- nazwę wymiaru,
- czytelny label poziomu,
- dotychczasową wartość liczbową,
- kolor tonu: czerwony dla negatywnego, szary dla neutralnego, zielony dla pozytywnego.

`ReputationManager` pozostaje authoritative ownerem wartości. Poziom jakościowy jest wyłącznie prezentacją UI i nie jest zapisywany ani używany przez symulację.

## Current behaviour

`src/ui-vue/screens/CharacterScreen.vue` ma centralną definicję pięciu wierszy reputacji (`REPUTATION_ROWS`) i buduje `reputationRows` z aktualnie wybranej osady.

Każdy wiersz pokazuje obecnie tylko:

- ikonę,
- nazwę wymiaru,
- surową wartość liczbową.

Reputacja jest już wybierana per znana osada przez istniejący flow z planu `ui-input-019`; ten plan nie zmienia selektora, źródła danych ani lifecycle odświeżania.

`src/reputation/ReputationManager.ts` definiuje pięć niezależnych wymiarów w zakresie `-100..100`, z neutralnym `0`. Nie istnieje jedna globalna średnia reputacji i nie należy jej dodawać.

`renown` / „Rozpoznawalność” ma osobny zakres `0..100` i inne znaczenie semantyczne, więc nie powinien być klasyfikowany tym samym czerwony-neutralny-zielony schematem.

## Reputation presentation levels

Wprowadzić pięć poziomów prezentacyjnych:

| Zakres | Poziom | Ton |
|---|---|---|
| `-100..-50` | bardzo niski | strong negative |
| `-49..-10` | niski | negative |
| `-9..9` | neutralny | neutral |
| `10..49` | wysoki | positive |
| `50..100` | bardzo wysoki | strong positive |

Granice są celowo symetryczne wokół neutralnego pasma, dzięki czemu drobne zmiany wokół `0` nie powodują natychmiastowego przełączania gracza między „dobrą” i „złą” reputacją.

## Labels and grammar

Label powinien gramatycznie pasować do nazwy wymiaru, np.:

- Zaufanie — `Bardzo niskie` / `Niskie` / `Neutralne` / `Wysokie` / `Bardzo wysokie`,
- Kompetencja — `Bardzo niska` / `Niska` / `Neutralna` / `Wysoka` / `Bardzo wysoka`,
- Życzliwość — forma żeńska,
- Odwaga — forma żeńska,
- Uczciwość — forma żeńska.

Nie budować systemu lokalizacji/fleksji tylko dla tych pięciu stałych wierszy. Najprostszy czytelny kontrakt to przypisać wariant gramatyczny do istniejącej definicji wiersza albo zwracać gotowy label z małego helpera prezentacyjnego.

## Architecture

### Presentation only

Klasyfikacja wartości na poziom jakościowy nie może wejść do `ReputationManager`.

Nie dodawać:

- persisted `reputationLevel`,
- nowych pól do `SaveData`,
- derived level do settlement standing,
- wpływu labela na questy, ceny, dialog, relacje lub NPC AI.

To czysta funkcja prezentacyjna zależna wyłącznie od wartości liczbowej.

### Suggested presentation helper

Preferować mały czysty helper po stronie UI, np. kontrakt semantyczny:

```ts
type ReputationTone = 'strong-negative' | 'negative' | 'neutral' | 'positive' | 'strong-positive'

type ReputationPresentation = {
  level: ReputationTone
  label: string
}
```

Helper powinien przyjmować wartość oraz wariant gramatyczny albo już zdefiniowany zestaw labeli dla danego wiersza.

Nie kodować kolorów hex jako domenowego API reputacji. UI może mapować semantyczny `tone` na istniejące klasy Tailwind / tokeny wizualne.

### Character Screen rendering

Rozszerzyć istniejący `reputationRows` o presentation level zamiast tworzyć drugi zestaw wierszy lub osobny komponent całej sekcji.

Preferowany układ jednego wiersza:

```text
[icon] Zaufanie                    Niskie   -23
```

Label jest głównym sygnałem znaczenia, liczba pozostaje widoczna jako dokładna informacja.

Kolor nie może być jedynym nośnikiem informacji: czerwony/szary/zielony ma wzmacniać tekstowy label, nie go zastępować.

### Renown

„Rozpoznawalność” pozostaje liczbą bez pozytywnego/negatywnego labela.

Jeżeli później ma dostać własne poziomy typu „Nieznany / Znany / Sławny”, powinien to być osobny kontrakt semantyczny, ponieważ wysokie renown nie znaczy automatycznie dobrej reputacji.

## Relevant files

- `src/ui-vue/screens/CharacterScreen.vue`
  - `REPUTATION_ROWS`,
  - `reputationRows`,
  - rendering sekcji `Reputacja`.
- opcjonalnie mały helper w `src/ui-vue/` lub `src/ui-vue/components/`, jeżeli wydzielenie poprawi testowalność i nie tworzy zbędnej abstrakcji.
- test helpera / presentation mapping w najbliższym istniejącym miejscu testów UI, jeśli repo ma odpowiedni wzorzec.

Read-only reference:

- `src/reputation/ReputationManager.ts`
  - authoritative `-100..100` contract,
  - `NEUTRAL_REPUTATION`,
  - bez zmian implementacyjnych.
- `src/ui-vue/store.ts`
  - istniejący `characterScreen.reputation` contract; nie rozszerzać go tylko po to, by przenosić derived labels przez store.
- `src/app/createApp.ts`
  - istniejący refresh/selection flow; bez zmian, o ile implementacja pozostaje prawidłowo derived w Vue.

## Implementation stages

1. Dodać czystą klasyfikację liczby reputacji do pięciu poziomów.
2. Podpiąć właściwe formy labeli do pięciu istniejących wymiarów.
3. Rozszerzyć `reputationRows` o derived presentation level.
4. Dodać label obok liczby i semantyczne kolory tonu.
5. Zachować istniejący layout na małych szerokościach bez overflow / nieczytelnego ścisku.
6. Dodać testy granic klasyfikacji, jeśli helper zostanie wydzielony do testowalnej funkcji.

## Verification

Automated/unit where practical:

- `-100`, `-50` → bardzo niski,
- `-49`, `-10` → niski,
- `-9`, `0`, `9` → neutralny,
- `10`, `49` → wysoki,
- `50`, `100` → bardzo wysoki,
- każda wartość w dozwolonym zakresie trafia dokładnie do jednego poziomu,
- warianty gramatyczne labeli są poprawne dla `Zaufanie` oraz czterech nazw żeńskich.

Manual browser verification — User:

1. Otwórz Character Screen i sekcję Reputacja.
2. Sprawdź neutralne wartości `0`: widoczny neutralny label i szary ton.
3. Sprawdź osadę z ujemną reputacją: label jest czerwony i odpowiada zakresowi liczbowemu.
4. Sprawdź osadę z dodatnią reputacją: label jest zielony i odpowiada zakresowi liczbowemu.
5. Przełącz kilka osad przez istniejący selector — label zmienia się razem z liczbą.
6. Sprawdź czytelność przy wszystkich pięciu wymiarach i brak problemów z layoutem.
7. Potwierdź, że „Rozpoznawalność” pozostaje osobną liczbą bez czerwono-zielonej oceny.

## Non-goals

- zmiana mechaniki reputacji,
- jedna zagregowana ocena reputacji,
- zmiana wartości lub progów konsekwencji społecznych,
- nowe źródła reputacji,
- persistence derived leveli,
- zmiana selektora osad,
- klasyfikowanie `renown` tym samym schematem,
- redesign całego Character Screen,
- nowy globalny design system statusów tylko dla tego planu.

## Guardrails

- `ReputationManager` pozostaje jedynym ownerem liczbowej reputacji.
- Derived label należy do warstwy prezentacyjnej.
- Nie rozszerzać `SaveData` ani store o dane możliwe do wyliczenia z aktualnej wartości.
- Zachować pięć niezależnych wymiarów; nie liczyć średniej.
- Nie utożsamiać `renown` z pozytywną reputacją.
- Tekstowy label jest wymagany; kolor jest wyłącznie dodatkowym sygnałem.
- Preferować istniejące klasy/tokenty kolorów UI zamiast nowych inline hexów, jeśli obecny design system to umożliwia.
- Jeżeli zostanie dodany nowy publiczny helper prezentacyjny, dodać krótki JSDoc z `@domain ui-input`, aby był łatwy do znalezienia przez preflight.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
