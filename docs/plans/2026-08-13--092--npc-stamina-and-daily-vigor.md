# Draft: NPC stamina vs dzienny wigor

**Status:** `todo` ⬜ — draft, nazwa drugiego zasobu do ustalenia  
**Created:** 2026-08-13  
**Priority:** 🟡 medium · **Effort:** L · **Depends on:** ~~045~~, ~~020~~

## Cel

Rozdzielić obecne „zmęczenie” NPC na dwa zasoby:

1. **stamina** — zdolność **krótkotrwałego** wysiłku (sprint, cios, krótki zryw pracy). Szybko spada, szybko wraca przy pauzie / lekkim odpoczynku. Już istnieje jako `StaminaState` (`src/shared/StaminaState.ts`); HP nie jest fatigue (plan 045).
2. **dzienny wigor** *(nazwa robocza)* — budżet wysiłku **w ciągu dnia**. Spada przy mocnym stresie, ciężkiej pracy i otrzymaniu obrażeń. Wraca głównie przez **sen**. Gdy NPC przesadzi, **zasypia w pracy** (przerywa akcję, śpi na miejscu / w najbliższym sensownym miejscu), zamiast tylko zwolnić.

NPC mają już `sleep` w harmonogramie (plan 020). Ten plan sprawia, że sen jest fizjologicznie potrzebny, a nie tylko wpisem grafiku.

## Nazwa — do wyboru

Nie commitujemy nazwy w kodzie, dopóki nie ustalimy jednej. Kandydaci:

| Nazwa robocza | Typ | Plus | Minus |
|---|---|---|---|
| **vigor** / wigor | pula, spada do 0 | czytelne „siły dnia”; nie koliduje ze `stamina` | mniej znane niż fatigue |
| **endurance** | pula | grywalne, znane | często mylone ze staminą |
| **daily_energy** | pula | dosłowne | fauna kiedyś miała `energy` → stamina (045); ryzyko regresji nazewnictwa |
| **fatigue** | odwrotność (rośnie) | intuicyjne „narasta zmęczenie” | odwrotna semantyka vs `StaminaState`; łatwo pomylić z burst fatigue |

**Rekomendacja draftu:** `VigorState` analogicznie do `StaminaState` (pula 0…max, sen uzupełnia). UI/dialogi po polsku: „siły” / „zmęczenie dnia”, niekoniecznie „wigor”.

## Stan wyjściowy

- `HealthState` — HP / śmierć.
- `StaminaState` — burst; praca NPC już drainuje staminę, odpoczynek ją regeneruje (`npcStamina.test.ts`).
- Harmonogram: `sleep` / `work` / `eat` / `home` / `wake` (wykonywalność `eat`/`home`/`wake` to plan 060, nie ten).
- Time-skip catch-up potrzeb/staminy: plan 075 (🔍).

Nie tworzyć drugiego systemu AI. Vigor to stan domenowy, jak HP i stamina (045 / 055).

```text
HealthState   → ile HP
StaminaState  → ile zrywu teraz
VigorState    → ile dnia zostało
AI / schedule → co NPC robi, w tym forced sleep przy vigor ≈ 0
```

## Zakres (v1)

- Wspólny `VigorState` (create / drain / restore / isCollapsed), analogiczny do staminy; bez frameworku.
- Drain: ciężka praca, silny stres (np. atak / panic), otrzymane obrażenia. Lekki idle nie powinien opróżniać dnia.
- Restore: przede wszystkim sen (harmonogramowy albo forced). Krótka pauza w pracy regeneruje **staminę**, nie wigor.
- **Forced sleep:** vigor na progu → przerwij bieżącą akcję, śpij (w miejscu albo idź do domu, jeśli blisko i bezpiecznie). Po śnie wigor wraca; stamina też.
- Time-skip / odpoczynek gracza: catch-up wigoru spójny z 075 (nie drugi mechanizm czasu).
- Persistence, jeśli NPC state jest już zapisywany; jeśli nie — jawny non-goal albo mały zapis analogiczny do staminy.
- Gracz: poza zakresem v1, chyba że podłączenie tego samego typu jest trywialne i nie psuje rest UX.

## Poza zakresem

- Pełny model chorób / kaca / pogody.
- Osobny scheduler snu (zostaje 020 / 060).
- Gospodarstwa / ekonomia (069, 071).
- Zmiana semantyki staminy fauny (chyba że ten sam typ da się podłączyć bez zmiany zachowania).

## Kryteria

1. Praca/stres/obrażenia obniżają wigor, nie HP.
2. Sen (grafik) odnawia wigor.
3. Wigor ≈ 0 → NPC zasypia mimo `work` (widać to w świecie).
4. Stamina nadal obsługuje krótki zryw i wraca bez snu.
5. Brak drugiego FSM / drugiej pętli potrzeb tylko dla snu.

## Powiązania

- ~~045~~ Health/Stamina — fundament.
- ~~020~~ grafik `sleep`/`work`.
- 060 (planned) — wykonywalne aktywności; ten plan nie czeka na 060, ale forced-sleep powinien współpracować z przyszłymi akcjami grafiku.
- 075 (🔍) — catch-up przy time-skip.
