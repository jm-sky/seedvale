# NPC-e nie mają nazwiska (albo nie jest widoczne na etykiecie)

**Status:** `verification needed` — zaimplementowane 2026-08-09: `lastName` (rodzina dzieli jedno nazwisko, gender-agreed dla polskich form — `Kowalski`/`Kowalska`) w `ai/nameCultures.ts` (`SURNAME_POOLS`, `generateFamilySurname`, `surnameForGender`), `CharacterDef.lastName` (`ai/characters.ts`), `FamilyMember.lastName` wspólne per rodzina (`settlement/families.ts`). `NpcAgent.displayName` (`imię + nazwisko`) na etykiecie nad głową, w prompt „Rozmawiaj z…”, w dialogu i w ekranie Mieszkańcy — `npc.name` (samo imię) zostaje niezmienione jako klucz dopasowania questów (`quests/quests.ts`). Wymaga wizualnej weryfikacji w przeglądarce.
**Created:** 2026-08-09
**Źródło:** zgłoszenie użytkownika

## Objaw

Etykieta nad głową NPC (`.npc-label`, `src/ai/NpcAgent.ts`) pokazuje tylko imię (`this.name`) — żadnego nazwiska. Sprawdzone w kodzie: `CharacterDef`/`FamilyMember` (`src/ai/characters.ts`, `src/settlement/families.ts`) i `generateNpcName` (`src/ai/nameCultures.ts`) niosą wyłącznie pojedyncze imię z kulturowej puli — **nie ma pola nazwiska w ogóle**, więc to nie jest tylko brak w UI, tylko brak danych.

To dokładnie luka, którą już opisuje [npc-names.md](../plans/2026-08-07--027--npc-names.md) — plan zakładał pełny model `firstName/lastName/nickname`, ale zaimplementowano ostatecznie tylko prostszy wariant (kulturowe pule samych imion, `verification needed`), a część `lastName` została odłożona (`planned`, nie zaimplementowane).

## Do zrobienia

Nie diagnoza/fix w tym wpisie — dokończyć `lastName` z [npc-names.md](../plans/2026-08-07--027--npc-names.md) (albo zdecydować, że rodzina dzieli jedno nazwisko — pasowałoby też do modelu rodzin z [village-generation](../plans/2026-08-08--031--village-generation.md), gdzie `FamilyDef` już grupuje członków rodziny) i wyświetlić je na etykiecie NPC oraz w ekranie „Mieszkańcy".

## Przy okazji (zaimplementowane razem z tym zgłoszeniem)

Etykieta NPC nie pokazuje już aktywnej potrzeby (drewno/woda/jedzenie) — user zdecydował, że to niepotrzebny szum na etykiecie (kolorowy `needMarker` nad głową NPC nadal to sygnalizuje wizualnie, bez tekstu). `src/ai/NpcAgent.ts`: etykieta to teraz samo imię (+ ewentualny quest marker), `needLabel` import usunięty jako nieużywany.

## Poza zakresem teraz

Sam design nazwiska (pula nazwisk per kultura, czy nazwisko = rodowe czy losowe per NPC) — do ustalenia przy implementacji `lastName` z [npc-names.md](../plans/2026-08-07--027--npc-names.md).
