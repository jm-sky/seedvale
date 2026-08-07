import type { AnimalKind } from './AnimalAgent'

/** Purely observational flavor lines for `[E]`-interacting with a live animal —
 *  no AI/behavior effect, mirrors `ai/dialogue.ts`'s role for NPCs. */
const ANIMAL_FLAVOR_LINES: Record<AnimalKind, string[]> = {
  wolf: [
    'Wilk mierzy Cię wzrokiem, ale nie podchodzi bliżej.',
    'Widać, że polowanie zajmuje mu całą uwagę.',
  ],
  fox: [
    'Lis nasłuchuje, uszy postawione czujnie.',
    'Rudy grzbiet znika w chwilę potem w zaroślach.',
  ],
  deer: [
    'Sarna zamiera na chwilę, obserwując Cię z daleka.',
    'Widać świeże ślady kopyt w miękkiej ziemi obok.',
  ],
  stag: [
    'Jeleń unosi głowę, poroże połyskuje w słońcu.',
    'Stoi spokojnie, dopóki się nie zbliżysz za bardzo.',
  ],
}

export function pickAnimalFlavorLine(kind: AnimalKind): string {
  const pool = ANIMAL_FLAVOR_LINES[kind]
  return pool[Math.floor(Math.random() * pool.length)]!
}
