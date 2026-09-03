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
  rabbit: [
    'Królik zamiera z uszami postawionymi czujnie.',
    'W każdej chwili gotów jest zniknąć w krzakach.',
  ],
  duck: [
    'Kaczka pluska się przy brzegu, niewzruszona.',
    'Odpływa spokojnie kawałek dalej po wodzie.',
  ],
  boar: [
    'Dzik prycha cicho i grzebie ryjem w ściółce.',
    'Mierzy Cię wzrokiem spod krzaczastych brwi.',
  ],
  bear: [
    'Niedźwiedź mierzy Cię ciężkim spojrzeniem, warcząc cicho.',
    'Potężny grzbiet napina się, gdy zwierzę węszy w powietrzu.',
  ],
  horse: [
    'Koń parska cicho i wraca do skubania trawy.',
    'Merda ogonem, wyraźnie oswojony z ludźmi.',
  ],
  donkey: [
    'Osioł kręci uszami i stoi niewzruszenie.',
    'Pochyla pysk ku trawie, przyzwyczajony do ludzi.',
  ],
  cow: [
    'Krowa przeżuwa spokojnie, patrząc obojętnie.',
    'Dzwoneczek na szyi cicho pobrzękuje przy każdym ruchu.',
  ],
  sheep: [
    'Owca beczy cicho i wraca do skubania trawy.',
    'Wełna jest już całkiem gęsta jak na tę porę roku.',
  ],
  chicken: [
    'Kura gdacze i grzebie w ziemi w poszukiwaniu ziaren.',
    'Odbiega parę kroków, po czym zaraz wraca do dziobania.',
  ],
  rooster: [
    'Kogut prostuje się dumnie, mierząc Cię czujnym spojrzeniem.',
    'Grzebień koguta drży, gdy ptak przechadza się po podwórzu.',
  ],
}

export function pickAnimalFlavorLine(kind: AnimalKind): string {
  const pool = ANIMAL_FLAVOR_LINES[kind]
  return pool[Math.floor(Math.random() * pool.length)]!
}
