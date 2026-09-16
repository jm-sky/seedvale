# Implementation Notes: settlements-npcs-041 — Profession-linked family surnames and NPC need-marker cleanup

**Status:** `verification needed` 🔍

## Current ownership and execution order

Settlement NPC identity is built in two phases:

```text
generateFamilies()
  -> demographic/family identity baseline
  -> current family surname assigned here

appendAuthoredResidentFamilies(...)

resolveInitialProfessionStaffing(...)
  -> may replace adult CharacterDef.role values

createVillagePlan(...)
  -> downstream settlement/runtime materialization
```

Relevant verified files:

- `src/settlement/families.ts`
  - `FamilyMember.lastName` is family identity state.
  - `FamilyMember.character.lastName` mirrors the same value in `CharacterDef`.
  - `generateFamily()` currently calls `generateFamilySurname()` before final profession staffing.
  - reserved home families are materialized by `reservedHomeFamilies()`.
- `src/settlement/professionStaffing.ts`
  - `resolveInitialProfessionStaffing()` owns initial adult profession composition.
  - it intentionally changes only procedural adult roles; names/family structure are outside its ownership.
- `src/settlement/settlementGenerator.ts`
  - current integration order is generated families -> authored resident append -> staffing -> village plan.
- `src/ai/nameCultures.ts`
  - `surnameForGender()` already owns Polish `-ski/-ska` and `-cki/-cka` formatting.
  - existing `SURNAME_POOLS` / `generateFamilySurname()` belong to culture-based baseline generation; do not duplicate their gender formatting logic.
- `src/ai/characters.ts`
  - `Role` is the closed profession union and should type the new role surname table.
  - `RESERVED_CHARACTERS` contains the four quest-critical start NPC identities.

## Architectural decision: post-staffing family surname pass

Do **not** make `professionStaffing.ts` responsible for names. Keep staffing pure to profession composition.

Add a small settlement-layer helper, preferably:

`src/settlement/professionFamilySurnames.ts`

with a public function shaped like:

```ts
export function applyProfessionFamilySurnames(
  families: readonly FamilyDef[],
  settlementSeed: number,
): FamilyDef[]
```

Call it from `settlementGenerator.ts` immediately after `resolveInitialProfessionStaffing()` and before `createVillagePlan()`.

This location is important because the final staffed roles are now known, but family identity still exists as structured `FamilyDef` state and has not yet been flattened/materialized further downstream.

## Family ownership guardrail

Only worldgen-owned family IDs should be eligible:

- `family-${index}`
- `family-reserved-${index}`

Do not rename authored/specialist resident families appended by quest systems. Several Lost Treasure resident modules create their own `FamilyDef` values and already own their surnames.

Prefer a small predicate such as `isWorldgenFamilyId(id)` or equivalent ownership check. Do not import quest modules or hardcode quest names into the surname helper.

## Representative profession selection

Use final `member.character.role` values after staffing.

Only adults count. Reuse `isAdultAge()` from `src/settlement/professionStaffing.ts` if it remains publicly available; do not duplicate the age threshold.

Keep a closed ordered role list in the helper:

```text
blacksmith
hunter
fisher
miner
woodcutter
herbalist
shepherd
textile_worker
trader
guard
farmer
```

Implementation can scan this priority list and select the first role present among adult family members. This is deterministic and avoids dependence on member array order.

If no adult exists, return the family unchanged.

## Surname pools

Use a closed `Record<Role, readonly string[]>`; TypeScript should force an explicit decision whenever `Role` grows.

Agreed values:

```ts
const ROLE_SURNAME_POOLS: Record<Role, readonly string[]> = {
  guard: ['Hornblower', 'Ward', 'Shields', 'Guard', 'Sentinel', 'Watchman'],
  woodcutter: ['Leśniewski', 'Woodward', 'Forester', 'Sawyer', 'Greenwood', 'Timber'],
  blacksmith: ['Kowalski', 'Smith', 'Schmidt', 'Ferrarius', 'Steel', 'Forge'],
  farmer: ['Rolnik', 'Farmer', 'Fields', 'Meadows', 'Granger', 'Agricola'],
  hunter: ['Łowicki', 'Hunter', 'Fletcher', 'Archer', 'Venator', 'Lupus'],
  fisher: ['Rybak', 'Fisher', 'Fischer', 'Rivers', 'Waters', 'Angler'],
  miner: ['Górski', 'Miner', 'Stone', 'Rockwell', 'Bergmann', 'Montanus'],
  trader: ['Kupiec', 'Merchant', 'Mercer', 'Chandler', 'Booker', 'Trader'],
  shepherd: ['Owczarek', 'Shepherd', 'Shepard', 'Schäfer', 'Flock', 'Pastor'],
  textile_worker: ['Tkacz', 'Weaver', 'Taylor', 'Webber', 'Mercer', 'Textor'],
  herbalist: ['Zieliński', 'Green', 'Sage', 'Herbal', 'Sylvan', 'Herbarus'],
}
```

These pools are world-flavor, not `NameCulture`. Do not couple surname selection to `polish | spanish | english` in this plan.

## Deterministic RNG isolation

Use `createSeededRandom()` with a **new dedicated salt** and stable family identity input. Do not draw from existing family/name/staffing RNG streams.

The goal is:

- same world seed + same staffed family -> same surname,
- changing surname code/pool does not reshuffle first names, roles, traits, ages, layout, fauna, etc.

A stable family index parsed from `family-${index}` / `family-reserved-${index}` is acceptable if the helper keeps the mapping explicit. Another deterministic hash of `settlementSeed + family.id + surnameRole` is also acceptable if implemented with existing repository seed idioms and without adding dependencies.

Do not use `Math.random()`.

## Updating family identity consistently

For an eligible family:

1. choose one base surname from the role pool,
2. for every member call existing `surnameForGender(baseSurname, ..., gender)` only where its current contract supports the intended formatting,
3. write the resolved surname into both:
   - `FamilyMember.lastName`,
   - `FamilyMember.character.lastName`.

Important caveat: current `surnameForGender(base, culture, gender)` formats Polish endings only when `culture === 'polish'`. Profession pools are intentionally not tied to `NameCulture`, so implementation must not falsely classify every profession surname as Polish merely to obtain inflection.

Prefer extracting/reusing a tiny surname-form helper in `nameCultures.ts` that can gender-format recognized Polish endings independently of settlement culture, while preserving the existing `surnameForGender()` public behavior for culture-based generation. Example direction:

```ts
formatPolishSurnameForGender(base, gender)
```

Then both culture surnames and profession surnames can reuse the same `-ski/-ska`, `-cki/-cka` rule without abusing `NameCulture`.

Do not add ad-hoc suffix handling inside `professionFamilySurnames.ts`.

## Reserved home families

`src/ai/characters.ts::RESERVED_CHARACTERS` currently stores explicit surnames. Update them to:

```text
Piotr Leśniewski
Anna Leśniewska
Marek Hornblower
Kasia Hornblower
```

Keep first names, gender, role and traits unchanged.

`reservedHomeFamilies()` in `families.ts` reads those values directly, so the reserved identities are correct even before the post-staffing surname pass. The later pass should deterministically preserve the same intended role-family association for these two families.

Quest identity remains first-name/stable-id based; do not alter quest matching while doing this work.

## Need-marker removal

`src/ai/NpcAgent.ts` currently owns the colored sphere entirely as presentation state. Verified pieces include:

- module-level need-marker `SphereGeometry`,
- `private readonly needMarker: THREE.Mesh`,
- cached last need value used only to avoid redundant material color writes,
- construction of the marker mesh/material and positioning above `NPC_HEIGHT`,
- update path that maps `activeNeed` to marker color,
- object attachment / disposal path.

Remove the complete marker presentation path, including any `needColor()` helper/import/constants that become unused.

Do **not** remove or alter:

- `activeNeed`,
- need/pressure evaluation,
- decision scoring,
- work/water/wood actions,
- textual status labels that have separate responsibilities.

The older issue `docs/issues/2026-08-09--008--npc-missing-surname.md` explicitly documents that text need labels were already removed while the colored marker remained. This plan finishes that presentation cleanup; it is not a needs-system refactor.

## Tests to add/update

Primary new file:

`src/settlement/professionFamilySurnames.test.ts`

High-value cases:

- final staffed blacksmith + farmer family selects blacksmith pool,
- woodcutter + farmer selects woodcutter pool,
- child role/order does not influence representative profession,
- same seed/roster is stable,
- another seed can select another surname within the same role pool,
- all family members receive one base surname with correct Polish gender variant where applicable,
- both `member.lastName` and `member.character.lastName` stay synchronized,
- no-adult family remains unchanged,
- authored family ID remains unchanged,
- reserved family IDs are eligible.

Update focused existing assertions that explicitly encode the four reserved surnames. Search for literal `Kowalski`, `Kowalska`, `Wiśniewski`, `Wiśniewska`, but do not mechanically replace unrelated test fixtures where the surname is just arbitrary test data.

Run at least focused tests covering:

- new profession surname helper,
- `families`,
- `professionStaffing`,
- authored quest resident materialization,
- reserved/authored quest binding,
- relevant `NpcAgent` tests / typecheck after marker fields are removed.

Then run the repository's standard typecheck/build/test command set required by `CLAUDE.md`.

Manual browser verification is for the user, not the implementation agent.

## Pitfalls

- Assigning surnames inside `generateFamily()` before final staffing: produces role/name mismatches.
- Renaming each NPC independently: breaks family identity.
- Letting children select the family profession.
- Mutating `resolveInitialProfessionStaffing()` into a naming system.
- Overwriting Lost Treasure/authored resident surnames.
- Reusing an existing RNG stream and reshuffling unrelated generated state.
- Calling `surnameForGender(..., 'polish', ...)` for every profession surname just to force suffix handling; extract the reusable inflection rule instead.
- Removing `activeNeed` while deleting `needMarker`.
- Running browser verification as the AI agent.

## Suggested implementation order

1. Extract reusable Polish surname gender formatting from `nameCultures.ts` without changing existing behavior.
2. Add `professionFamilySurnames.ts` + focused tests.
3. Integrate post-staffing pass in `settlementGenerator.ts`.
4. Update reserved surnames and only affected literal assertions.
5. Remove `needMarker` presentation from `NpcAgent.ts`.
6. Run focused tests and standard repo verification.

Add JSDoc to the public family-surname application function because it is a generation pipeline boundary; include `@domain settlements-npcs` for preflight discovery.

## Implementation record

Reserved `family-reserved-*` households keep `RESERVED_CHARACTERS` surnames instead of a pool roll, so Piotr/Anna stay Leśniewski and Marek/Kasia stay Hornblower across seeds. They remain worldgen-owned (`isWorldgenFamilyId`); authored `family-story-*` residents are a separate skip. Procedural `family-*` households take the post-staffing profession pool.

Need-marker presentation was removed from `NpcAgent`. `needColor` remains only as the capsule-fallback body color.

> **Zrób git commit i push do main, rebase jeżeli trzeba**
