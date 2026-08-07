# Plan: Predator-Prey system z HP i spawnerami

**Status:** `planned`  
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

- [ ] `HealthState` typ + HP constants per species
- [ ] `AnimalAgent.health`, `takeDamage(damage)`, `onDeath()` callback
- [ ] Kontakt: predator damage prey co `dt` jeśli `dist < 0.8m`
- [ ] Dead agents: `createFauna` usuwa martwych agentów ze sceny i arrays
- [ ] Spawner type defined; co najmniej **1-2 harcoded spawnery** (jaskinia, zagajnik) — proceduralna generacja = opcja
- [ ] Respawn loop: prey regeneruje się co N sekund w spawnerze (gdy poniżej max count)
- [ ] Obserwacja: wyłów jedną sarną (chase + contact) → znika, nowa pojawia się po ~5-10 sek
- [ ] Console clean: `npx tsc --noEmit`, `npm run lint`, `npm run build`

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
