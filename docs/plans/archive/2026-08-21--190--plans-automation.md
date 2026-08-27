# Plan: Automatyczna synchronizacja planów

**Created:** 2026-08-21  
**Status:** `done` ✅  
**Priority:** medium · **Effort:** S  
**Depends on:** none
**domain:** `persistence`

## Cel

Zautomatyzować utrzymanie pomocniczych informacji w `docs/plans/README.md` oraz `PLANNED_PLANS_WITHOUT_NOTES.md`.

Automatyzacja ma wykorzystywać rzeczywiste pliki planów jako źródło prawdy i nie zmieniać ręcznie utrzymywanej treści poza określonym zakresem.

## Zakres

### 1. Automatyczne dodawanie `planned` do tabeli

Wszystkie pliki planów w `docs/plans/` posiadające:

```text
**Status:** `planned` 📋
```

powinny być obecne w tabeli `## Planned` w `docs/plans/README.md`.

Automat:
- wykrywa plany ze statusem `planned`,
- sprawdza obecność nazwy pliku w tabeli,
- dodaje brakujące plany,
- nie dodaje duplikatów,
- nie usuwa istniejących wpisów,
- nie modyfikuje istniejących wpisów.

Dane nowego wiersza powinny pochodzić z samego planu: `File`, `Summary`, `Pri`, `Effort`, `Depends`. Należy zachować obecny format tabeli.

### 2. Zachowanie `Fresh new`

Istniejąca sekcja `### Fresh new` pozostaje ręczna. Automat nie usuwa, nie przenosi i nie modyfikuje jej zawartości.

Jeżeli plan znajduje się tylko w `Fresh new`, ale jest `planned`, automat nadal powinien dopisać go do głównej tabeli `Planned`.

### 3. Automatyczne `Next plan ID`

W nagłówku `docs/plans/README.md` dodać sekcję pokazującą następne dostępne ID planu, np.:

```text
## Next plan ID

`191`
```

Automat powinien wyliczać `max(existing plan IDs) + 1` na podstawie rzeczywistych plików planów w `docs/plans/`, niezależnie od statusu. Nie traktować luk w numeracji jako dostępnych ID.

Implementation notes oraz inne pliki pomocnicze nie powinny być traktowane jako osobne plany, jeżeli mają ten sam numer bazowego planu.

### 4. `PLANNED_PLANS_WITHOUT_NOTES.md`

Po synchronizacji planów uruchamiać istniejący skrypt:

```bash
pnpm plans:without-notes
```

Wykorzystać istniejący `scripts/planned-plans-without-notes.ts`. Nie duplikować jego logiki.

Wynik pozostaje w `docs/plans/PLANNED_PLANS_WITHOUT_NOTES.md`.

### 5. Skrypt synchronizujący

Preferować jeden mały skrypt TypeScript odpowiedzialny za automatyczne elementy README:
- wykrywanie planów,
- wyliczanie `Next plan ID`,
- wykrywanie brakujących wpisów w tabeli `Planned`,
- dopisywanie brakujących wierszy,
- aktualizację `Next plan ID`.

Nie przebudowywać całego Markdowna. Skrypt ma być idempotentny. Nie dodawać zewnętrznej biblioteki tylko do parsowania Markdown.

### 6. GitHub Actions

Dodać osobny workflow w `.github/workflows/`.

Workflow powinien:
1. uruchamiać się na `push` do `main`,
2. reagować na zmiany związane z planami, skryptami synchronizującymi i workflow,
3. używać Node.js 22 + pnpm zgodnie z istniejącym `ci.yml`,
4. uruchomić skrypt synchronizujący README,
5. uruchomić `pnpm plans:without-notes`,
6. sprawdzić `git diff`,
7. jeżeli są zmiany — skonfigurować autora automatycznego commita, wykonać commit i wypchnąć zmiany na `main`,
8. jeżeli nie ma zmian — zakończyć bez commita.

Workflow nie może tworzyć nieskończonej pętli własnymi commitami.

### 7. Package scripts

Jeżeli powstanie nowy skrypt synchronizujący, dodać komendę `pnpm plans:sync` do `package.json`. Nie zmieniać istniejącej komendy `plans:without-notes`.

## Źródło prawdy

Źródłem informacji o planach pozostają pliki `docs/plans/*.md`. `README.md` jest indeksem pomocniczym, a `PLANNED_PLANS_WITHOUT_NOTES.md` jest plikiem generowanym.

## Weryfikacja

Sprawdzić:
- nowy plan `planned` zostaje dodany do tabeli `Planned`,
- plan już obecny nie jest duplikowany,
- plan `in progress`, `done` lub `verification needed` nie jest automatycznie dodawany,
- plan obecny tylko w `Fresh new` zostaje tam i pojawia się również w `Planned`,
- `Next plan ID` jest poprawne,
- implementation notes nie powodują fałszywych planów,
- `pnpm plans:without-notes` działa bez zmian,
- drugie uruchomienie synchronizacji nie zmienia plików,
- workflow wykonuje commit tylko wtedy, gdy rzeczywiście powstały zmiany,
- commit workflow nie powoduje nieskończonego loopa,
- istniejący CI nadal przechodzi.

Nie wykonywać niepowiązanych zmian ani refaktoryzacji. Na podstawie aktualnego codebase zweryfikować dokładny format nagłówków planów przed implementacją — nie zakładać, że wszystkie historyczne plany mają identyczną strukturę.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
