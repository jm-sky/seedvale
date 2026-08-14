# Cursor task — Verify MegaKit Construction Catalog visually

## Cel

Zweryfikuj w przeglądarce tylko te założenia `ConstructionCatalog`, których nie dało się potwierdzić analizą GLB.

**Nie implementuj HouseBuilder.**
**Nie poprawiaj architektury.**
**Nie analizuj ponownie wszystkich 176 assetów.**
**Minimalizuj użycie browsera i tokenów.**

Repo: Seedvale.

---

## Najpierw

Przeczytaj tylko:

- `docs/reviews/2026-08-14--009--megakit-construction-audit.md`
- `src/assets/constructionCatalog.ts`
- `src/assets/houseDefinitionExample.ts`
- `src/assets/constructionCatalog.test.ts`
- odpowiednie pliki Asset Browsera

Jeżeli potrzebujesz dodatkowego kontekstu, dopiero wtedy otwórz konkretny plik.

---

# Zadanie

Zweryfikuj w browserze tylko 4 rzeczy:

### 1. Wall `_l` / `_r`

Sprawdź kilka reprezentatywnych assetów `_l` i `_r`.

Cel:

- ustalić, czy są rzeczywistymi elementami narożnymi/mitrowanymi,
- czy są tylko wariantami wizualnymi,
- sprawdzić, czy można je ustawiać według obecnych anchorów.

Nie oglądaj wszystkich wariantów.

### 2. Door / window pivots

Sprawdź po jednym reprezentatywnym:

- door opening + door/frame,
- window opening + window.

Ustal tylko:

- czy pivot/origin pozwala na deterministyczne ustawienie,
- czy potrzebny jest stały asset-specific offset,
- czy obecny `ConstructionCatalog` opisuje to poprawnie.

Jeżeli offset jest potrzebny, **nie implementuj go jeszcze** — zapisz dokładną wartość/wniosek.

### 3. Roof

Sprawdź tylko reprezentatywny zestaw:

- jeden roof middle/straight,
- jeden roof end,
- jeden roof corner,
- ewentualnie jeden większy roof-cap, jeśli review 009 wskazuje go jako problematyczny.

Cel:

- sprawdzić orientację,
- footprint,
- połączenia między elementami,
- czy wyliczone anchory mają sens wizualnie.

Nie przeglądaj wszystkich 39 dachów.

### 4. TEST_HOUSE_01

Jeżeli istnieje już możliwość wyświetlenia `TEST_HOUSE_01`, użyj jej.

Jeżeli **nie istnieje**, NIE buduj teraz całego testowego playgroundu.

Zamiast tego oceń na podstawie pojedynczych assetów, czy dane `HouseDefinition` są wystarczające dla przyszłego buildera.

---

# Browser discipline

Browser jest kosztowny.

Dlatego:

1. Najpierw sprawdź, czy istnieje już odpowiednia strona/tool Asset Browsera.
2. Wykonuj możliwie mało screenshotów.
3. Nie chodź po całym świecie.
4. Nie rób performance testu.
5. Nie testuj NPC.
6. Nie analizuj wszystkich 176 modeli.
7. Nie generuj dodatkowych narzędzi tylko po to, żeby zrobić tę weryfikację.
8. Jeżeli coś można jednoznacznie sprawdzić statycznie w kodzie, nie używaj browsera.

Preferuj kilka celowanych inspekcji zamiast eksploracji.

---

# Bardzo ważne

Jeżeli jakaś weryfikacja wymaga dużo czasu/browser interactions, zatrzymaj się i napisz:

```text
MANUAL CHECK REQUIRED

1. ...
2. ...
3. ...
```

Podaj mi dokładnie:

- jaki asset mam otworzyć,
- co mam zobaczyć,
- jaki wynik oznacza PASS,
- jaki wynik oznacza FAIL.

**Nie wykonuj kosztownej manualnej procedury samodzielnie.**

---

# Wynik

Na końcu podaj bardzo krótkie podsumowanie:

```text
Construction Catalog browser verification

Walls _l/_r: PASS / FAIL / UNCLEAR
Doors: PASS / FAIL / UNCLEAR
Windows: PASS / FAIL / UNCLEAR
Roofs: PASS / FAIL / UNCLEAR
TEST_HOUSE_01: PASS / FAIL / NOT AVAILABLE

Required code changes:
- none
lub
- <konkretne minimalne zmiany>

Manual checks remaining:
- none
lub
- <maksymalnie kilka konkretnych rzeczy>
```

Jeżeli wszystko przejdzie, **nie implementuj nic więcej**.

Celem tej sesji jest wyłącznie odpowiedź:

> Czy obecny Construction Catalog jest wystarczająco wiarygodnym fundamentem, żeby w następnym kroku zbudować `HouseBuilder` i wygenerować 10 domków?
