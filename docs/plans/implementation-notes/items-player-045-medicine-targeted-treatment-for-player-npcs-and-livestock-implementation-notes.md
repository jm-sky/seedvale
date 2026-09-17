# Implementation notes: items-player-045 Medicine treatment foundation

**Plan:** `items-player-045-medicine-targeted-treatment-for-player-npcs-and-livestock.md`

## Scope boundary

`045` jest fundamentem domenowym. Nie implementuj tutaj `Medicine` target consumera, Skills Screen, self-treatment UX, Busy Action, player treatment-item selection, medical tools ani Medicine XP — wszystko to należy do `items-player-046`.

Celem `045` jest doprowadzenie Player/NPC/Animal do jednego physical-injury/treatment contractu tak, aby `046` było cienką integracją interaction → shared resolver → target adapter.

## Existing shared injury seam

`src/shared/injurySeverity.ts` już posiada:

- `InjurySeverity = 'none' | 'minor' | 'serious' | 'critical'`,
- `INJURY_SEVERITY_THRESHOLDS` (`serious: 0.25`, `critical: 0.55`),
- `resolveInjurySeverity()`,
- `criticalInjuryFloor()`,
- `increaseInjuryFromDamage()`,
- `decreaseInjuryFromHeal()`,
- natural recovery helpers.

Nie kopiuj thresholdów do nowego resolvera. Jeżeli potrzebny jest floor `serious → minor`, dodaj shared helper obok `criticalInjuryFloor()` oparty o `INJURY_SEVERITY_THRESHOLDS.serious`.

`src/shared/injuryRecovery.ts` posiada dokładnie potrzebny mutable contract:

```ts
type InjuryRecoveryState = {
  health: HealthState
  injuryRecoveryUpdatedAtDays?: number
  physicalInjury: number
}
```

oraz:

- `resolveInjuryRecovery()`,
- `registerPhysicalInjuryFromDamage()`,
- `registerPhysicalInjuryFromHeal()`.

Preferuj rozszerzenie/reuse tego contractu. Nie twórz drugiego `InjuryState` wyłącznie dla playera/fauny.

## Shared treatment resolver placement

Najbardziej naturalny owner to nowy mały plik w `src/shared/` obok `injurySeverity.ts` / `injuryRecovery.ts`, np. `physicalInjuryTreatment.ts`.

Resolver ma być pure i data-only. Nie importuje:

- `Inventory`,
- `ItemKind`,
- `PlayerSkills`,
- `NpcAgent`,
- `AnimalAgent`,
- interaction/UI.

Input powinien używać generic treatment metadata (`immediateHp`, `maxSeverity`) albo równoważnego data shape. `ITEM_CATALOG` pozostaje outside adapterem.

## Stabilization floors — decyzja zamknięta

Nie zostawiaj tego do ponownego projektowania podczas implementacji:

- `critical` bare-hands floor = existing `criticalInjuryFloor(maxHp)`,
- `serious` bare-hands floor = `INJURY_SEVERITY_THRESHOLDS.serious * maxHp`, expose przez shared helper,
- `minor` floor = `0`.

Requested potency może być mniejsza niż dystans do floor; resolver robi clamp, nie teleportuje automatycznie do granicy.

Material mode nie używa bare-hands floor, ale przed leczeniem sprawdza `maxSeverity` przez istniejący severity ranking/semantics.

## Player state

`PlayerController` tworzy `this.health = createHealthState(PLAYER_MAX_HP)` w konstruktorze. Player health jest aktualnie runtime-owned; nie ma odpowiednika NPC-owego authoritative snapshotu dla HP/injury.

Najmniejszy scope:

- dodać `physicalInjury = 0`,
- dodać `injuryRecoveryUpdatedAtDays?` tylko jeśli player ma sensowny `nowDays` seam do lazy recovery,
- expose minimalny publiczny/read-only treatment seam potrzebny później przez `046`, zamiast pozwalać interaction kodowi mutować prywatne pola.

### Player damage

Nie zmieniaj `HealthState` globalnie. Znajdź realne player physical damage entry points i po `damageHealth()` licz:

```text
hpBefore - health.currentHp
```

a następnie przekaż actual delta do `registerPhysicalInjuryFromDamage()`.

Nie rejestruj requested damage; armor/defense/clamp może zmniejszyć accepted HP loss.

### Player passive/generic healing

`PlayerNeeds` ma istniejące HP regeneration (`healHealth`). To jest ważny edge case: samo HP regen nie może pozostawić `physicalInjury > missingHp` w niespójnym stanie.

Podczas implementacji wybierz jeden spójny contract i test:

- jeśli ten regen reprezentuje natural wound recovery, przepnij go przez shared injury recovery/accounting,
- jeśli reprezentuje nie-wound HP recovery, utrzymuj invariant `physicalInjury <= maxHp - currentHp` przez jawny health/injury policy helper.

Nie zostawiaj zwykłego `healHealth()` jako niejawnego side-channel bez testu invariantu.

### Player persistence

Nie rozszerzaj `SaveData` tylko o injury. Aktualny scope pozwala pozostawić player HP + injury runtime-only, dopóki oba resetują się razem. Jeżeli current code w chwili implementacji ma już persisted HP, wtedy injury musi zostać zapisane obok niego.

## Animal / livestock state

`AnimalAgent` jest ownerem własnego `HealthState`. `takeDamage(damage, source?)` obecnie wywołuje `damageHealth(this.health, damage)` i dopiero potem obsługuje death/combat consequences.

Zmiana powinna być lokalna:

1. zapamiętaj `hpBefore`,
2. `damageHealth`,
3. policz actual loss,
4. zarejestruj physical injury,
5. zachowaj obecny death flow bez zmiany jego ownershipu.

Nie przenoś health do osobnego fauna managera.

### AnimalSaveState

`AnimalSaveState` jest zdefiniowany w `src/fauna/AnimalAgent.ts` i jest wspólnym durable snapshotem używanym m.in. przez livestock persistence. Dodaj tam:

- `physicalInjury`,
- `injuryRecoveryUpdatedAtDays?` jeśli recovery jest używane dla zwierząt.

Hydration starszych snapshotów musi defaultować brakujące injury do `0` i nie wykonywać retroaktywnego recovery z wymyślonego timestampu.

Livestock persistence już capture/hydrate'uje `AnimalSaveState`; rozszerz istniejący snapshot zamiast tworzyć nowe `SaveData.livestockInjuries`.

Wild fauna runtime może dostać te same pola, ale nie dodawaj dla niej persistence.

## NPC self-healing seam

`NpcAgent` już:

- oblicza severity przez `resolveInjurySeverity(this.npcState.physicalInjury, this.health.maxHp)`,
- wybiera treatment przez `this.carried.findInjuryTreatment(severity)`,
- ma `beginHeal()`,
- rejestruje damage przez `registerPhysicalInjuryFromDamage()`.

`Inventory.findInjuryTreatment(severity)` używa `INJURY_TREATMENT_KINDS` + `itemTreatsPhysicalInjury()` i jest współdzielonym katalogowym selektorem. Nie twórz drugiej listy treatmentów.

W `045` zmień jedynie treatment math/application tak, aby `beginHeal()` korzystał z shared resolvera. **Nie naprawiaj tutaj** istniejącej kwestii, że self-healing czyta `this.carried`; to osobny ownership problem i rozszerzyłby scope.

NPC nie ma `PlayerSkills`; adapter powinien zachować dotychczasową bazową potency materiału. Medicine scaling gracza należy do `046`.

## Item catalog boundary

`ITEM_CATALOG[kind].injuryTreatment` już jest właściwym metadata source. `Inventory.findInjuryTreatment()` jest selection source.

Shared resolver z `045` może przyjąć skopiowane metadata value, ale nie powinien importować katalogu.

Nie zmieniaj `consumable.need === 'health'` w alias wound treatment. `herb`-style generic HP consumable i `injuryTreatment` pozostają rozdzielone.

## Suggested implementation order

1. Dodać serious floor helper + pure treatment resolver + unit tests.
2. Dodać Player injury state i damage/heal invariant tests.
3. Dodać Animal injury state + `AnimalSaveState` round-trip tests.
4. Podpiąć NPC `beginHeal()` pod shared resolver.
5. Dopiero na końcu aktualizować state docs.

Ta kolejność pozwala testować resolver bez zależności od ciężkich agentów.

## Tests to extend/reuse

- `src/shared/injuryRecovery.test.ts` — accounting/recovery invariants.
- nowy focused test dla physical treatment resolvera.
- `src/items/itemConsumables.test.ts` — nie zmieniaj oczekiwań `findInjuryTreatment()` bez potrzeby.
- NPC healing/healing-pressure tests — selection ma pozostać zgodne.
- `src/settlement/livestock.test.ts` oraz testy `AnimalSaveState` round-trip — dodać injury fields.
- persistent occupant tests korzystające z `AnimalSaveState` mogą wymagać default/fixture update; utrzymaj backward-compatible optional hydration.

## Pitfalls

- Nie equate `maxHp - currentHp` z `physicalInjury`; część HP loss może mieć inną semantykę.
- Nie persistuj derived severity.
- Nie pozwól natural/passive healowi stworzyć `physicalInjury > missingHp`.
- Nie awarduj Medicine XP tutaj.
- Nie dodawaj capability/tool tutaj.
- Nie zmieniaj `targetedSkillAction.ts` tutaj.
- Nie przenoś NPC inventory ownership jako side-refactor.

## Contract exported to `046`

Po `045` powinno być możliwe napisanie cienkiego adaptera:

```text
read target health + injury
→ choose mode/potency externally
→ shared resolver
→ target-owned apply heal/injury accounting
```

`046` nie powinno już rozstrzygać severity floors, persistence ani basic injury accounting.

> **Zrób git commit i push do main, rebase jeżeli trzeba**