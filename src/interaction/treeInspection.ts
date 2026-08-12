import type { TreeGrowthStage, TreeSizeClass } from '../world/treeLifecycle'

type FlavorPool = readonly string[]

/** Living age × sizeClass — short, observational Polish lines. */
const LIVING_FLAVOR: Record<
  'sapling' | 'young' | 'mature' | 'old',
  Record<TreeSizeClass, FlavorPool>
> = {
  sapling: {
    small: [
      'Maleńka sadzonka — ledwo wystaje z mchu.',
      'Delikatne drzewko jak z doniczki, tylko że tu, w lesie.',
      'Smukła sadzonka: za rok będzie wyższa od buta, nie więcej.',
    ],
    medium: [
      'Młode drzewko przeciętnego gatunku — jeszcze zielone i niepewne.',
      'Sadzonka z „zwykłej” rodziny: nic okazałego, ale żywa.',
      'Niewysoki pęd z listkami; kiedyś będzie zwykłym, solidnym drzewem.',
    ],
    large: [
      'To młode drzewo z gatunku tych dużych — już teraz widać ambicje pnia.',
      'Sadzonka olbrzyma: cienka jeszcze, ale liście ma jak z dorosłego drzewa.',
      'Małe drzewko z wielkiego rodu. Za kilkadziesiąt lat będzie górować nad resztą.',
    ],
  },
  young: {
    small: [
      'Młode, drobne drzewo — z tych, co nigdy nie sięgają nieba.',
      'Smukłe młode drzewko jak wiśnia w sadzie: lekkie, skromne, żywe.',
      'Gałązki cienkie jak ołówki. To raczej „małe drzewo” niż przyszły olbrzym.',
    ],
    medium: [
      'Młode drzewo dopiero nabiera kształtu — nic nadzwyczajnego, ale zdrowego.',
      'Korona się zagęszcza; pień jeszcze nie wie, czy będzie gruby.',
      'Typowe młode drzewo lasu: ani karzeł, ani pretendent do legendy.',
    ],
    large: [
      'To młode drzewo z gatunku tych dużych — już teraz przebija sąsiadów.',
      'Wysokie jak na swój wiek. Z takich wyrastają prawdziwe kolosy.',
      'Młody olbrzym w treningu: gałęzie jeszcze giętkie, ale pęd w górę nie kłamie.',
    ],
  },
  mature: {
    small: [
      'To dojrzałe drzewo, ale z takich małych jak wiśnia — pełne, tylko niskie.',
      'Dojrzałe, a ledwie ponad głowę. Gatunek skromny, nie wstydliwy.',
      'Pełna korona, grubawy pień… i nadal drzewo „do ogrodu”, nie do legendy.',
    ],
    medium: [
      'Zwykłe, dojrzałe drzewo — takie, z których składa się większość lasu.',
      'Solidny pień, spokojna korona. Nic heroicznego, wszystko na miejscu.',
      'Dojrzałe drzewo przeciętnej miary: daje cień, szumi, stoi.',
    ],
    large: [
      'Dojrzały okaz z wielkich — korona szeroka, pień jak słup mostu.',
      'To już nie sapling z ambicjami: pełne, wysokie drzewo dużej rasy.',
      'Wysokie, dojrzałe drzewo. W jego cieniu spokojnie schowałby się wóz.',
    ],
  },
  old: {
    small: [
      // small never grows old in sim — keep soft fallbacks if data is weird
      'Stare, ale dziwnie małe. Może karłowaty gatunek… albo cud.',
      'Sękate i niskie jednocześnie — wiek widać, wzrostu nie.',
      'Starość bez wielkości: pień pomarszczony, korona skromna.',
    ],
    medium: [
      'Stare drzewo średniej miary — sęki, blizny i spokojna korona.',
      'Nie olbrzym, ale weteran. Kora opowiada o dziesiątkach sezonów.',
      'Dojrzałe lata temu; dziś to po prostu stare, solidne drzewo lasu.',
    ],
    large: [
      'Potężne, stare drzewo góruje nad lasem jak latarnia dla wron.',
      'Gruby pień i rozłożysta korona — to drzewo ma swoje lata i swoją klasę.',
      'Stary olbrzym. Pod takimi drzewami ludzie dawniej składali obietnice.',
    ],
  },
}

const LIMBED_FLAVOR: Record<TreeSizeClass, FlavorPool> = {
  small: [
    'Ogołocony cienki pień — z małego drzewa zostało niewiele.',
    'Smukły pień bez korony. Wygląda prawie jak tyczka.',
    'Mały pień, świeże ślady siekiery. Szybka robota.',
  ],
  medium: [
    'Pień stoi ogołocony z gałęzi.',
    'Został sam pień — bez korony.',
    'Widać świeże ślady siekiery na pniu.',
  ],
  large: [
    'Gruby pień bez korony — jak maszt po burzy.',
    'Ogołocony kolos: same drewno, zero liści.',
    'Ślady siekiery na pniu grubym jak beczka.',
  ],
}

const FELLED_FLAVOR: Record<TreeSizeClass, FlavorPool> = {
  small: [
    'Krótka kłoda obok niskiego pniaka — było to niewielkie drzewo.',
    'Mały pień leży jak odrzucona gałąź.',
    'Pniak i cienka kłoda. Dużo hałasu jak na tyle drewna.',
  ],
  medium: [
    'Pień leży obok niskiego pniaka.',
    'Kłoda leży na ziemi, pniak sterczy obok.',
    'Drzewo zostało ścięte — zostało tylko do porąbania.',
  ],
  large: [
    'Potężna kłoda leży jak zwalone maszt. Pniak sterczy obok.',
    'Grube drzewo padło — ziemia wokół jeszcze pamięta wstrząs.',
    'Kłoda gruba jak kłoda… no, właśnie. Dużo roboty przed Tobą.',
  ],
}

const HARVESTED_FLAVOR: Record<TreeSizeClass, FlavorPool> = {
  small: [
    'Został malutki pień — ledwo wystaje.',
    'Pniak jak pieńek do siedzenia dla wróbla.',
    'Z małego drzewa prawie nic: tylko niski kikut.',
  ],
  medium: [
    'Został sam niski pień.',
    'Pniak — z drzewa prawie nic nie zostało.',
    'Tylko pień wystaje z ziemi.',
  ],
  large: [
    'Szeroki pniak po wielkim drzewie — stół dla całego oddziału.',
    'Potężny kikut. Las będzie długo pamiętać tę lukę.',
    'Niski, ale szeroki pień. Kiedyś tu stał olbrzym.',
  ],
}

function pickFrom(pool: FlavorPool): string {
  return pool[Math.floor(Math.random() * pool.length)]!
}

function speakerFor(stage: TreeGrowthStage, sizeClass: TreeSizeClass): string {
  if (stage === 'limbed' || stage === 'felled' || stage === 'harvested') return 'Pień'
  if (stage === 'sapling') return 'Drzewko'
  if (stage === 'old' && sizeClass === 'large') return 'Stare drzewo'
  if (stage === 'mature' && sizeClass === 'small') return 'Małe drzewo'
  if (stage === 'young' && sizeClass === 'small') return 'Drzewko'
  return 'Drzewo'
}

/** Flavor line + speaker label — living lines mix age × sizeClass (plan 073). */
export function treeInspectionFlavor(
  stage: TreeGrowthStage | undefined,
  sizeClass: TreeSizeClass = 'medium',
): {
  speakerName: string
  line: string
} {
  const size = sizeClass
  const resolved = stage ?? 'mature'

  switch (resolved) {
    case 'felled':
      return { speakerName: speakerFor(resolved, size), line: pickFrom(FELLED_FLAVOR[size]) }
    case 'harvested':
      return { speakerName: speakerFor(resolved, size), line: pickFrom(HARVESTED_FLAVOR[size]) }
    case 'limbed':
      return { speakerName: speakerFor(resolved, size), line: pickFrom(LIMBED_FLAVOR[size]) }
    case 'old':
      return { speakerName: speakerFor(resolved, size), line: pickFrom(LIVING_FLAVOR.old[size]) }
    case 'sapling':
      return { speakerName: speakerFor(resolved, size), line: pickFrom(LIVING_FLAVOR.sapling[size]) }
    case 'young':
      return { speakerName: speakerFor(resolved, size), line: pickFrom(LIVING_FLAVOR.young[size]) }
    case 'mature':
    default:
      return { speakerName: speakerFor('mature', size), line: pickFrom(LIVING_FLAVOR.mature[size]) }
  }
}

/** Inspection branch chance only makes sense while the tree still has a living crown. */
export function treeInspectionCanYieldBranch(stage: TreeGrowthStage | undefined): boolean {
  return (
    stage === undefined ||
    stage === 'sapling' ||
    stage === 'young' ||
    stage === 'mature' ||
    stage === 'old'
  )
}
