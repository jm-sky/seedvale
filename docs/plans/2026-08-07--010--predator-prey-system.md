# Plan: Predator-Prey system z HP i spawnerami

**Status:** `done`  
**Created:** 2026-08-07  
**Scope:** Fauna ([src/fauna/](../../src/fauna/)), mechanika gry

## Problem

Obecny system fauna:
- Predatory (wilk, lis) gonią prey (sarna, jeleń) gdy je zobaczą
- Ale **nigdy nie łapią** — brak kolizji/damage
- Zwierzęta się **nie regenerują** — ten sam pula spawn na wieki
- Brak mechaniki śmierci ani HP

## Cel

1. **HP system** — wszystkie postacie (NPC + zwierzęta) mają HP
2. **Damage na kontakt** — gdy predator dojdzie do prey, zadaje damage
3. **Death** — gdy HP ≤ 0, agent umiera (dispose, znika ze sceny)
4. **Spawner** — dedykowane miejsca (jaskinia, zagajnik, grove/3-trees) gdzie respawnuje się prey
5. **Respawn loop** — prey regeneruje się co X sekund w spawnach, aby balansować ekosystem

## Stan obecny

- `AnimalAgent` ([src/fauna/AnimalAgent.ts](../../src/fauna/AnimalAgent.ts)): rola (predator/prey), chase/flee logika, brak HP
- `createFauna` ([src/fauna/createFauna.ts](../../src/fauna/createFauna.ts)): spawuje zwierzęta w pierścieniu wokół osady (18-40m), fixed pool (2 wolf, 2 fox, 4 deer, 2 stag)
- `NpcAgent` ([src/ai/NpcAgent.ts](../../src/ai/NpcAgent.ts)): NPC są nieśmiertelne, brak HP

## Zależność: `HealthState` jest współdzielony, nie fauna-only

**Aktualizacja:** ten plan jest już zaimplementowany w working tree (niezacommitowane zmiany: `src/fauna/HealthState.ts`, `src/fauna/AnimalSpawner.ts`, zmienione `AnimalAgent.ts`/`createFauna.ts` — status wyżej i „Done when” odzwierciedlają rzeczywisty kod, nie tylko plan). `HealthState` istnieje **naprawdę**, pod `src/fauna/HealthState.ts`:

```ts
export type HealthState = { maxHp: number; currentHp: number; dead: boolean }
export function createHealthState(maxHp: number): HealthState { ... }
export const MAX_HP: Record<AnimalKind, number> = { ... }        // fauna-specific
export function damageFor(predator: AnimalKind, prey: AnimalKind): number { ... }  // fauna-specific
```

Sam typ `HealthState` jest generyczny (żadnej zależności od `AnimalKind`), ale plik jako całość importuje `AnimalKind` z `./AnimalAgent` — więc NPC (w `src/ai/`) nie może po prostu zaimportować stąd bez ciągnięcia zależności do `src/fauna/`. [npc-character-depth.md](./2026-08-07--022--npc-character-depth.md) planuje reużyć ten sam typ dla NPC (zmęczenie pracą zamiast combat damage). Żeby to zrobić bez odwróconej zależności `ai → fauna`, potrzebny jest mały refaktor **teraz**, nie "kto pierwszy": wydzielić `HealthState`/`createHealthState` (generyczna część) do `src/shared/HealthState.ts`, zostawiając `MAX_HP`/`damageFor` (fauna-specific, zależne od `AnimalKind`) w `src/fauna/HealthState.ts`, który importuje typ ze `shared`. Ten refaktor wchodzi w zakres `npc-character-depth.md`, nie tego planu (ten jest już `verification needed` — nie re-otwieramy go dla przenosin pliku).

## Zakres

### 1. HP system

**Dla wszystkich agentów:**
```ts
type HealthState = {
  maxHp: number
  currentHp: number
  dead: boolean
}
```

**Definicje HP per typ:**
| Typ | Max HP | Notatki |
|-----|--------|---------|
| NPC | 100 | Opcjonalnie: redukcja HP gdy blisko predatora? Na start: immunitet |
| Deer | 30 | Szybka ucieczka |
| Stag | 40 | Silniejszy |
| Fox | 25 | Mały predator |
| Wolf | 50 | Silny predator |

**Damage per atak:**
- Wolf → Deer: 15 HP
- Wolf → Stag: 12 HP  
- Fox → Deer: 10 HP
- Predator can only damage prey (same role = no damage)

### 2. Kontakt & Damage

**W `AnimalAgent.update()` — co klatkę:**
- Po ruchu: sprawdź dystans do wszystkich otros agentów
- Jeśli `dist < CONTACT_RANGE` (np. 0.8m) i `this.def.role === 'predator'` i `other.def.role === 'prey'`:
  - `other.takeDamage(DAMAGE[this.def.kind])`
  - Opcjonalnie: predator wchodz w "eating" phase (animacja?)

**`AnimalAgent.takeDamage(damage: number)`:**
```ts
takeDamage(damage: number): void {
  this.health.currentHp = Math.max(0, this.health.currentHp - damage)
  if (this.health.currentHp <= 0) {
    this.health.dead = true
    this.onDeath()  // dispose, efekty, logika
  }
}
```

### 3. Death system

**`AnimalAgent.onDeath()`:**
- Zagrać fade-out animację (opcjonalnie dropsy/particles)
- Ustawić `mesh.visible = false` lub `mesh.position.y = -999` (out of view)
- Trigger `onDeath` callback dla `createFauna`

**`createFauna` — track martwych agentów:**
```ts
const deadAgents: Set<AnimalAgent> = new Set()

// W update()
for (const agent of agents) {
  if (agent.isDead()) {
    deadAgents.add(agent)
    agent.mesh.removeFromParent()
    agent.dispose()
  }
}
// agents.filter(a => !deadAgents.has(a))
```

### 4. Spawner dla prey

**Dedykowane miejsca spawnu** — per łatwo generować proceduralno:
- **Jaskinia** (cave): nisko (wysokość < waterLevel + 2), ciemno
- **Zagajnik** (thicket): las (biom foresty), średnia wysokość
- **Grove** (3 trees): klaster 3+ drzew blisko siebie

Każdy spawner:
```ts
type PreySpawner = {
  x: number
  z: number
  type: 'cave' | 'thicket' | 'grove'
  respawnTime: number  // sek
  maxPreyCount: number
}
```

**Generacja spawnerów** — w `createFauna()`:
1. Skanuj teren (grid 32×32m od settlementu, w promieniu np. 100m)
2. Dla każdej komórki: sprawdź biom + wysokość
3. Jeśli conditions match → utwórz spawner
4. Albo: harcoded 3-4 spawnery (prościej na start)

**Respawn logic** — co frame:
```ts
for (const spawner of spawners) {
  spawner.timeSinceLastRespawn += dt
  const preyNearby = agents.filter(
    a => a.def.role === 'prey' && 
         distance(a.position, spawner) < SPAWNER_RADIUS
  ).length
  
  if (spawner.timeSinceLastRespawn >= spawner.respawnTime &&
      preyNearby < spawner.maxPreyCount) {
    // Respawn one prey
    const newAgent = spawnPreyAt(spawner.x, spawner.z, ...)
    agents.push(newAgent)
    spawner.timeSinceLastRespawn = 0
  }
}
```

### 5. Integracja

**Files:**
```
src/fauna/HealthState.ts         # nowy: HP system (shared)
src/fauna/AnimalAgent.ts          # + health, takeDamage(), onDeath()
src/fauna/AnimalSpawner.ts        # nowy: spawner logic, respawn
src/fauna/createFauna.ts          # + spawner setup, respawn loop, dead cleanup
src/ai/NpcAgent.ts                # + health (opcjonalnie: immunitet na start)
```

**`createFauna()` signature — zmiana:**
```ts
export async function createFauna(
  scene: Scene,
  sampleHeight: HeightSampler,
  waterLevel: number,
  homeRadius: number,
  settlementCenter: Vector3,
  seed: number,
  terrain?: { biomeAt: (x: number, z: number) => BiomeType }  // nowy, opcjonalny
): Promise<Fauna>
```

**Return type:**
```ts
export type Fauna = {
  update: (dt: number, observerPos: Vector3) => void
  dispose: () => void
  getAgents: () => AnimalAgent[]  // dla debugu / potrzeb gracza
}
```

### 6. UI (opcjonalnie, v1+)

- HP bar nad głową zabitych zwierząt (lub tylko na hover)
- Licznik żywych zwierząt w debug GUI
- Sound effect: bite/hit, death cry

## Done when

- [x] `HealthState` typ + HP constants per species — `src/fauna/HealthState.ts`
- [x] `AnimalAgent.health`, `takeDamage(damage)`, `isDead()` — `onDeath()` callback dropped (unused; `createFauna` polls `isDead()` each frame instead, see Implementation notes)
- [x] Kontakt: predator damage prey gdy `dist < 0.8m` — z cooldownem 0.6s/atak (patrz notatka niżej), nie co `dt` dosłownie
- [x] Dead agents: `createFauna` usuwa martwych agentów ze sceny i arrays
- [x] Spawner type defined; **2 harcoded spawnery** (cave → deer, thicket → stag), pozycjonowane losowo 45–65m od settlementu z walkability check — proceduralna biome-based generacja odłożona (opcja z planu)
- [x] Respawn loop: prey regeneruje się co N sekund w spawnerze (gdy poniżej max count)
- [x] Obserwacja: wyłów jedną sarną (chase + contact) → ciało zostaje (collapse pose, linger 8s) → nowa pojawia się w spawnerze — potwierdzone przez użytkownika w przeglądarce
- [x] Console clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`

### Implementation notes (odchylenia od planu)

- **Attack cooldown (0.6s)**: plan mówił o damage "co `dt`" przy kontakcie, ale przy 60fps i wolf→deer 15dmg to zabiłoby sarnę (30 HP) w 2 klatki (~33ms) — sprzeczne z "obserwacja: powinno zająć <5 sek". Dodano `ATTACK_COOLDOWN = 0.6s` w `AnimalAgent`, więc wolf zabija sarnę w ~2 ataki / ~1.2s.
- **`onDeath()` callback pominięty**: plan proponował callback z konstruktora do natychmiastowego czyszczenia. Zamiast tego `takeDamage()` ustawia `health.dead` synchronicznie, a `createFauna.update()` co klatkę filtruje `agents.filter(readyToRemove)` i disposuje — prostsze, bez dodatkowego API surface.
- **Spawner types "cave"/"thicket"** to na razie tylko etykiety/flavor (brak biome-aware placement) — pozycja wybierana tym samym walkability-search co reszta fauny (unikanie wody + homeRadius bounds), nie ma dedykowanej detekcji jaskiń/lasu. Każdy spawner ma teraz też CSS2D label nad nim (nazwa typu, np. "jaskinia"/"zagajnik"), fade-by-distance jak etykiety zwierząt/NPC.
- **`fox` → `stag` damage** nie było zdefiniowane w planie — dodano `DEFAULT_DAMAGE = 8` jako fallback w `damageFor()` dla par predator/prey spoza tabeli.
- **UI (sekcja 6)**: pominięte celowo — plan oznacza to jako opcjonalne v1+, poza "Done when".
- **Corpse linger (feedback po review)**: ciało po śmierci zostawało niewidoczne od razu (`mesh.visible = false` w `takeDamage`), znikało "za szybko". Zmieniono: ciało zostaje widoczne (zamrożona poza — mixer przestaje się aktualizować) przez `CORPSE_LINGER_SECONDS = 8s`, dopiero potem `createFauna` je usuwa (`AnimalAgent.readyToRemove()`). Przy okazji naprawiono bug: `updateSpawners` liczył martwe-ale-jeszcze-widoczne zwłoki jako "żywy prey w pobliżu", co mogło blokować respawn przy dłuższym lingerze — dodano `!a.isDead()` do filtra.
- **Night speed penalty dla prey (feedback po review)**: `AnimalAgent.update()` przyjmuje teraz `isNight` (liczone w `createFauna` z `skyParamsFromTime(timeOfDay).dayFactor <= 0`, ten sam próg co reszta świata — światła/mgła/woda). Tylko `role === 'prey'`: wander ×`NIGHT_PREY_WALK_MULT = 0.5`, ucieczka/sprint ×`NIGHT_PREY_SPRINT_MULT = 0.9`. Predators bez zmian. Twardy próg (nie płynna interpolacja) — do ew. zmiany jeśli przejście dzień/noc będzie wyglądać na "pop".

## Do przetestowania (http://localhost:5577/)

1. Uruchom grę, czekaj aż pojawią się zwierzęta
2. Włącz debug GUI: sprawdź licznik żywych zwierząt (wstępnie)
3. Obserwuj wilka/lisa gonią sarną/jeleń
4. Czekaj aż predator ją dorwie (powinno zajść <5 sek przy dobrych warunkach)
5. Sarna powinna **zniknąć** (dispose)
6. Czekaj ~5-10 sek → nowa sarna pojawia się w spawnerze
7. Sanity check: reszta NPC/gracza/UI działa normalnie

## Następnie (v1+)

- NPC immunitet → opcjonalnie: NPC może się bronić / uciekać przed predatorem
- Sound effects: bite, death, predator roar
- Drop items: zwierzę upuszcza mięso (komponent gracza: zbieranie?) — osobny plan
- Proceduralna generacja spawnerów (biom scanning + thresholds)
- HP bar UI nad agentami (toggle w debug GUI)
