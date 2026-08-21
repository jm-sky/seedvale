import * as THREE from 'three'
import { SMALL_MESH_SHADOW_THRESHOLD } from '../assets/loadGltf'
import { cloneItemGlb } from './itemModels'

export type ItemKind =
  | 'shell'
  | 'stone'
  | 'branch'
  | 'beam'
  | 'mushroom'
  | 'flower'
  | 'cone'
  | 'knife'
  | 'long_sword'
  | 'spear'
  | 'short_sword'
  | 'firestarter'
  | 'blanket'
  | 'shovel'
  | 'axe'
  | 'pitchfork'
  | 'sickle'
  | 'wooden_torch'
  | 'pickaxe'
  | 'tent'
  | 'trap_simple'
  | 'trap_good'
  | 'pan'
  | 'coal'
  | 'iron'
  | 'iron_rod'
  | 'gold'
  | 'tomato'
  | 'raw_meat'
  | 'roasted_meat'
  | 'bread'
  | 'waterskin_empty'
  | 'waterskin_full'
  | 'deer_meat'
  | 'wolf_meat'
  | 'boar_meat'
  | 'rabbit_meat'
  | 'beef'
  | 'hide'
  | 'cheese'
  | 'dried_meat'
  | 'coin'
  | 'herb'
  | 'bandage'
  | 'damascus_knife'
  | 'damascus_short_sword'
  | 'damascus_long_sword'
  | 'obsidian_sword'
  | 'battle_axe'
  | 'masterwork_sword'
  | 'berries'
  | 'apple'
  | 'nuts'
  | 'honey'
  | 'carrot'
  | 'potato'
  | 'cabbage'
  | 'fish'
  | 'dried_fish'
  | 'fishing_rod'
  | 'whetstone'
  | 'short_bow'
  | 'hunting_bow'
  | 'long_bow'
  | 'arrow'
  | 'broadhead_arrow'
  | 'war_arrow'
  | 'chest'
  | 'backpack'
  | 'tree_seed'
  | 'seed_carrot'
  | 'seed_potato'
  | 'seed_cabbage'

export type ItemCategory = 'resource' | 'tool' | 'utility' | 'food' | 'weapon'

/** Item gabarite (plan 164) — deliberately independent of `weight`. Governs
 *  container/inventory *size* capacity only; a small heavy item and a large
 *  light item fail different checks (`Inventory.ts`'s `canAdd`). */
export type ItemSize = 'XS' | 'SM' | 'MD' | 'LG' | 'XL'

/** Abstract capacity units per `ItemSize` — not physical dimensions, just a
 *  scalar "how much room" answer (plan 164 §9: no Tetris packing). */
export const ITEM_SIZE_UNITS: Record<ItemSize, number> = {
  XS: 1,
  SM: 2,
  MD: 3,
  LG: 4,
  XL: 6,
}

export function itemSizeUnits(kind: ItemKind): number {
  return ITEM_SIZE_UNITS[ITEM_DEFS[kind].size]
}

export type ItemDef = {
  label: string
  kind: ItemKind
  categories: readonly ItemCategory[]
  description?: string | null | undefined
  /** Kilograms — see `Inventory.ts`'s `totalWeight()`/`canAdd()`. */
  weight: number
  /** Gabarite (plan 164) — see `ItemSize`. */
  size: ItemSize
  color: number
}



export function hasItemCategory(def: Pick<ItemDef, 'categories'>, category: ItemCategory): boolean {
  return def.categories.includes(category)
}

export function hasItemKindCategory(kind: ItemKind, category: ItemCategory): boolean {
  return hasItemCategory(ITEM_DEFS[kind], category)
}

const CATEGORY_SORT_ORDER: readonly ItemCategory[] = ['weapon', 'tool', 'food', 'utility', 'resource']

/** Deterministic primary category for sorting — first match in CATEGORY_SORT_ORDER. */
export function primaryItemCategory(def: Pick<ItemDef, 'categories'>): ItemCategory {
  for (const cat of CATEGORY_SORT_ORDER) {
    if (def.categories.includes(cat)) return cat
  }
  return def.categories[0]!
}

/** Rest cancel becomes available strictly after this fraction of the sleep skip. */
export const REST_CANCEL_PROGRESS_THRESHOLD = 0.85

export function canCancelRestProgress(progress: number | null): boolean {
  return progress != null && progress > REST_CANCEL_PROGRESS_THRESHOLD
}

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  shell: {
    kind: 'shell',
    label: 'muszla',
    categories: ['resource'],
    weight: 0.05,
    size: 'XS',
    color: 0xf2e4c9,
    description: 'Lekka muszla znaleziona na brzegu. Przyda się do wymiany z Kupcem, gdy brakuje monet.'
  },
  stone: {
    kind: 'stone',
    label: 'kamień',
    categories: ['resource'],
    weight: 1,
    size: 'SM',
    color: 0x8c8c8c,
    description: 'Zwykły, solidny kamień. Przydatny w budowie i rzemiośle.'
  },
  branch: {
    kind: 'branch',
    label: 'gałąź',
    categories: ['resource'],
    weight: 0.5,
    size: 'SM',
    color: 0x6b4a2f,
    description: 'Sucha gałąź zebrana w lesie. Łatwo ją wykorzystać jako opał lub materiał do prostych przedmiotów lub pochodnię.'
  },
  beam: {
    kind: 'beam',
    label: 'belka',
    categories: ['resource'],
    weight: 3,
    size: 'LG',
    color: 0x5a3f26,
    description: 'Solidna belka pozyskana ze ściętego drzewa. Materiał konstrukcyjny — przyda się przy budowie i jako opał.'
  },
  mushroom: {
    kind: 'mushroom',
    label: 'grzyb',
    categories: ['resource', 'food'],
    weight: 0.1,
    size: 'XS',
    color: 0xc0453c,
    description: 'Leśny grzyb rosnący w cieniu drzew. Niektóre gatunki nadają się do jedzenia.'
  },
  flower: {
    kind: 'flower',
    label: 'kwiat',
    categories: ['resource'],
    weight: 0.05,
    size: 'XS',
    color: 0xdb6fa3,
    description: 'Delikatny kwiat zerwany z łąki. Może ozdobić dom lub posłużyć do prostych wyrobów.'
  },
  cone: {
    kind: 'cone',
    label: 'szyszka',
    categories: ['resource'],
    weight: 0.1,
    size: 'XS',
    color: 0x7a5230,
    description: 'Drobna szyszka sosnowa. Sucha i łatwopalna, doskonała do rozpalania ognia.'
  },
  knife: {
    kind: 'knife',
    label: 'nóż',
    categories: ['tool'],
    weight: 0.4,
    size: 'SM',
    color: 0xb7bfc7,
    description: 'Niewielkie, poręczne ostrze przydatne podczas pracy, polowania i przygotowywania żywności.'
  },
  firestarter: {
    kind: 'firestarter',
    label: 'krzesiwo',
    categories: ['tool'],
    weight: 0.2,
    size: 'XS',
    color: 0x54504a,
    description: 'Proste krzesiwo pozwalające wzniecić ogień przy pomocy suchego drewna - ognisko, pochodnia itp.'
  },
  blanket: {
    kind: 'blanket',
    label: 'koc',
    categories: ['utility'],
    weight: 1.5,
    size: 'LG',
    color: 0x8a4b3a,
    description: 'Ciepły, wełniany koc. Chroni przed chłodem podczas odpoczynku i snu.'
  },
  shovel: {
    kind: 'shovel',
    label: 'łopata',
    categories: ['tool'],
    weight: 2,
    size: 'LG',
    color: 0x6b4a32,
    description: 'Solidna łopata do kopania ziemi, przygotowywania grządek i wyrównywania terenu.'
  },
  axe: {
    kind: 'axe',
    label: 'siekiera',
    categories: ['tool', 'weapon'],
    weight: 2.5,
    size: 'MD',
    color: 0x7a7e86,
    description: 'Ciężka siekiera z ostrym stalowym ostrzem. Niezastąpiona przy ścinaniu drzew i rąbaniu drewna.'
  },
  long_sword: {
    kind: 'long_sword',
    label: 'miecz',
    categories: ['weapon'],
    weight: 2.5,
    size: 'LG',
    color: 0x7a7e86,
    description: 'Długi, stalowy miecz. Ostry, wytrzymały i przeznaczony do walki.'
  },
  spear: {
    kind: 'spear',
    label: 'dzida',
    categories: ['weapon'],
    weight: 1.8,
    size: 'LG',
    color: 0x8a7a5a,
    description: 'Prosta dzida z drewnianym drzewcem i metalowym grotem. Długi zasięg przydaje się do walki i polowania.'
  },
  short_sword: {
    kind: 'short_sword',
    label: 'krótki miecz',
    categories: ['weapon'],
    weight: 1.6,
    size: 'MD',
    color: 0x9aa0a8,
    description: 'Krótki, poręczny miecz. Lżejszy i szybszy od miecza długiego, choć zadaje mniejsze obrażenia.'
  },
  pitchfork: {
    kind: 'pitchfork',
    label: 'widły',
    categories: ['tool'],
    weight: 1.8,
    size: 'LG',
    color: 0x6b5a3a,
    description: 'Proste, mocne widły używane przy pracy w gospodarstwie i przenoszeniu siana.'
  },
  sickle: {
    kind: 'sickle',
    label: 'sierp',
    categories: ['tool'],
    weight: 0.7,
    size: 'SM',
    color: 0x8a9098,
    description: 'Małe zakrzywione ostrze przeznaczone do ścinania trawy, zbóż i innych roślin.'
  },
  wooden_torch: {
    kind: 'wooden_torch',
    label: 'pochodnia',
    categories: ['tool'],
    weight: 1.2,
    size: 'SM',
    color: 0x7a5230,
    description: 'Drewniana pochodnia dająca światło po zmroku i pomagająca rozświetlić ciemne miejsca.'
  },
  pickaxe: {
    kind: 'pickaxe',
    label: 'kilof',
    categories: ['tool'],
    weight: 2.5,
    size: 'LG',
    color: 0x7a7e86,
    description: 'Ciężki kilof do rozbijania skał i wydobywania rud ukrytych w ziemi.'
  },
  tent: {
    kind: 'tent',
    label: 'namiot',
    categories: ['utility'],
    weight: 3,
    size: 'XL',
    color: 0x8a6a3a,
    description: 'Lekki namiot zapewniający schronienie i miejsce do spania poza osadą.'
  },
  trap_simple: {
    kind: 'trap_simple',
    label: 'prosta pułapka',
    categories: ['utility'],
    weight: 2,
    size: 'MD',
    color: 0x6f6a60,
    description: 'Prosta pułapka na drobną zwierzynę. Tania i lekka, ale szybko psuje się na deszczu i łatwiej ją wypatrzyć.'
  },
  trap_good: {
    kind: 'trap_good',
    label: 'dobra pułapka',
    categories: ['utility'],
    weight: 3.2,
    size: 'MD',
    color: 0x9aa0a8,
    description: 'Solidna, kuta pułapka. Droższa, ale wytrzymuje niepogodę i trudniej ją zauważyć.'
  },
  pan: {
    kind: 'pan',
    label: 'patelnia',
    categories: ['utility'],
    weight: 1,
    size: 'SM',
    color: 0x4a4a4a,
    description: 'Żeliwna patelnia. Pozwala przygotować przy ognisku dwa kawałki mięsa naraz zamiast jednego.'
  },
  coal: {
    kind: 'coal',
    label: 'węgiel',
    categories: ['resource'],
    weight: 1,
    size: 'XS',
    color: 0x1c1c1c,
    description: 'Czarny, łatwopalny surowiec wydobywany spod ziemi. Doskonałe źródło opału i paliwo do wytopu.'
  },
  iron: {
    kind: 'iron',
    label: 'żelazo',
    categories: ['resource'],
    weight: 1.5,
    size: 'SM',
    color: 0x8a4a30,
    description: 'Ciężka ruda o rdzawym kolorze. Jeden z najważniejszych surowców do wytwarzania narzędzi i broni.'
  },
  iron_rod: {
    kind: 'iron_rod',
    label: 'żelazny pręt',
    categories: ['resource'],
    weight: 0.6,
    size: 'SM',
    color: 0x6a6a6e,
    description: 'Prosty pręt kutego żelaza. Materiał konstrukcyjny — przydaje się m.in. przy budowie rusztu.'
  },
  gold: {
    kind: 'gold',
    label: 'złoto',
    categories: ['resource'],
    weight: 0.4,
    size: 'XS',
    color: 0xd4af37,
    description: 'Rzadka i cenna ruda o charakterystycznym złotym połysku. Ceniona za swoją wartość i piękno.'
  },
  tomato: {
    kind: 'tomato',
    label: 'pomidor',
    categories: ['food'],
    weight: 0.15,
    size: 'XS',
    color: 0xc0392b,
    description: 'Dojrzały pomidor zerwany z przydomowego ogródka. Zaspokaja głód.'
  },
  raw_meat: {
    kind: 'raw_meat',
    label: 'surowe mięso',
    categories: ['food'],
    weight: 0.8,
    size: 'SM',
    color: 0xa5453f,
    description: 'Świeżo pozyskane mięso. Lepiej upiec je przy ognisku, zanim się je zje.'
  },
  roasted_meat: {
    kind: 'roasted_meat',
    label: 'pieczone mięso',
    categories: ['food'],
    weight: 0.7,
    size: 'SM',
    color: 0x8a5a3a,
    description: 'Mięso upieczone przy ognisku. Sycący posiłek.'
  },
  bread: {
    kind: 'bread',
    label: 'chleb',
    categories: ['food'],
    weight: 0.5,
    size: 'SM',
    color: 0xc99a52,
    description: 'Bochenek chleba. Dobrze się przechowuje — przydatny na czarną godzinę.'
  },
  waterskin_empty: {
    kind: 'waterskin_empty',
    label: 'bukłak (pusty)',
    categories: ['utility'],
    weight: 0.3,
    size: 'SM',
    color: 0x6b5a3a,
    description: 'Skórzany bukłak na wodę. Pusty — napełnij go przy studni lub jeziorze.'
  },
  waterskin_full: {
    kind: 'waterskin_full',
    label: 'bukłak (pełny)',
    categories: ['utility'],
    weight: 1.3,
    size: 'SM',
    color: 0x4a9fd8,
    description: 'Skórzany bukłak pełen wody. Ugasi pragnienie.'
  },
  deer_meat: {
    kind: 'deer_meat',
    label: 'mięso sarny',
    categories: ['food'],
    weight: 0.9,
    size: 'SM',
    color: 0xa5453f,
    description: 'Surowe mięso sarny, pozyskane z upolowanej zwierzyny. Lepiej upiec je przy ognisku.'
  },
  wolf_meat: {
    kind: 'wolf_meat',
    label: 'mięso wilka',
    categories: ['food'],
    weight: 0.75,
    size: 'SM',
    color: 0x8f4a44,
    description: 'Chude, twarde mięso wilka. Jadalne, choć niezbyt sycące na surowo.'
  },
  boar_meat: {
    kind: 'boar_meat',
    label: 'mięso dzika',
    categories: ['food'],
    weight: 0.95,
    size: 'SM',
    color: 0x9c4b3f,
    description: 'Tłuste mięso dzika. Sycące, zwłaszcza po upieczeniu.'
  },
  rabbit_meat: {
    kind: 'rabbit_meat',
    label: 'mięso królika',
    categories: ['food'],
    weight: 0.4,
    size: 'SM',
    color: 0xb56a5a,
    description: 'Niewielka porcja mięsa królika. Niewiele go, ale łatwo o kolejnego.'
  },
  beef: {
    kind: 'beef',
    label: 'wołowina',
    categories: ['food'],
    weight: 1.2,
    size: 'SM',
    color: 0xa14840,
    description: 'Kawał wołowiny z krowy. Najbardziej sycąca z surowych mięs.'
  },
  hide: {
    kind: 'hide',
    label: 'skóra',
    categories: ['resource'],
    weight: 0.6,
    size: 'MD',
    color: 0x7a5a3f,
    description: 'Skóra zdjęta ze zwierzęcia przy oprawianiu tuszy. Przydatna do wyrobu i handlu.'
  },
  cheese: {
    kind: 'cheese',
    label: 'ser',
    categories: ['food'],
    weight: 0.4,
    size: 'XS',
    color: 0xe8c96a,
    description: 'Krąg twardego sera. Dobrze się przechowuje i dobrze syci.'
  },
  dried_meat: {
    kind: 'dried_meat',
    label: 'suszone mięso',
    categories: ['food'],
    weight: 0.35,
    size: 'XS',
    color: 0x6b3a2e,
    description: 'Paski suszonego mięsa. Lekkie, sycące i długo się nie psują — dobre na dłuższą wyprawę.'
  },
  coin: {
    kind: 'coin',
    label: 'moneta',
    categories: ['resource'],
    weight: 0.001,
    size: 'XS',
    color: 0xc9a227,
    description: 'Bity krążek metalu. Kupiec płaci nim za towar i przyjmuje go za zakupy — także za działki na sprzedaż.'
  },
  herb: {
    kind: 'herb',
    label: 'zioło lecznicze',
    categories: ['food'],
    weight: 0.05,
    size: 'XS',
    color: 0x5a8a4a,
    description: 'Pęczek leczniczych ziół znalezionych w lesie. Łagodzi rany, gdy się je zje.'
  },
  bandage: {
    kind: 'bandage',
    label: 'opatrunek',
    categories: ['utility'],
    weight: 0.2,
    size: 'XS',
    color: 0xe8e0d0,
    description: 'Czysty opatrunek z apteczki. Szybko tamuje krwawienie i leczy rany.'
  },
  damascus_knife: {
    kind: 'damascus_knife',
    label: 'nóż damasceński',
    categories: ['tool', 'weapon'],
    weight: 0.35,
    size: 'SM',
    color: 0x6fa5b8,
    description: 'Krótki nóż z falistym damasceńskim ostrzem. Lżejszy i ostrzejszy od zwykłego noża — nadal nadaje się do pracy przy zwłokach.'
  },
  damascus_short_sword: {
    kind: 'damascus_short_sword',
    label: 'krótki miecz damasceński',
    categories: ['weapon'],
    weight: 1.5,
    size: 'MD',
    color: 0x6fa5b8,
    description: 'Krótki miecz z damasceńskiej stali. Szybki, ostry i lepiej wyważony niż zwykły krótki miecz.'
  },
  damascus_long_sword: {
    kind: 'damascus_long_sword',
    label: 'długi miecz damasceński',
    categories: ['weapon'],
    weight: 2.7,
    size: 'LG',
    color: 0x3f5975,
    description: 'Elitarny długi miecz z damasceńskiej stali. Cięższy i wyraźnie groźniejszy od zwykłego miecza.'
  },
  obsidian_sword: {
    kind: 'obsidian_sword',
    label: 'obsydianowy miecz',
    categories: ['weapon'],
    weight: 2.0,
    size: 'MD',
    color: 0x4a3068,
    description: 'Rzadki miecz z wulkanicznego szkła. Ostrze tnie wyjątkowo ostro, ale nie jest to niezniszczalna broń.'
  },
  battle_axe: {
    kind: 'battle_axe',
    label: 'topór bojowy',
    categories: ['tool', 'weapon'],
    weight: 3.8,
    size: 'LG',
    color: 0x4a4e54,
    description: 'Ciężki topór bojowy. Zadaje większe obrażenia niż zwykła siekiera i nadal nadaje się do ścinania drzew.'
  },
  masterwork_sword: {
    kind: 'masterwork_sword',
    label: 'mistrzowski miecz',
    categories: ['weapon'],
    weight: 2.4,
    size: 'LG',
    color: 0xe4ce75,
    description: 'Wysokiej jakości stalowy miecz kowalski. Lepszy od zwykłego miecza, mniej egzotyczny niż damasceńskie ostrza.'
  },
  berries: {
    kind: 'berries',
    label: 'jagody',
    categories: ['food'],
    weight: 0.1,
    size: 'XS',
    color: 0x3a2a6a,
    description: 'Garść leśnych jagód. Szybko się psują, ale są łatwe do znalezienia.'
  },
  apple: {
    kind: 'apple',
    label: 'jabłko',
    categories: ['food'],
    weight: 0.15,
    size: 'XS',
    color: 0xb8342a,
    description: 'Dzikie jabłko zerwane z drzewa w pobliżu osady.'
  },
  nuts: {
    kind: 'nuts',
    label: 'orzechy',
    categories: ['food'],
    weight: 0.15,
    size: 'XS',
    color: 0x7a5a3a,
    description: 'Garść leśnych orzechów. Sycące i długo się przechowują.'
  },
  honey: {
    kind: 'honey',
    label: 'miód',
    categories: ['food'],
    weight: 0.4,
    size: 'XS',
    color: 0xe8a825,
    description: 'Słoik miodu z dzikiego ula. Nie psuje się.'
  },
  carrot: {
    kind: 'carrot',
    label: 'marchew',
    categories: ['food'],
    weight: 0.12,
    size: 'XS',
    color: 0xd9762c,
    description: 'Marchew zerwana z przydomowego ogródka.'
  },
  potato: {
    kind: 'potato',
    label: 'ziemniak',
    categories: ['food'],
    weight: 0.2,
    size: 'XS',
    color: 0xc9a86a,
    description: 'Ziemniak wykopany z przydomowej grządki. Dobrze się przechowuje.'
  },
  cabbage: {
    kind: 'cabbage',
    label: 'kapusta',
    categories: ['food'],
    weight: 0.5,
    size: 'SM',
    color: 0x7ba85a,
    description: 'Główka kapusty z przydomowego ogródka.'
  },
  fish: {
    kind: 'fish',
    label: 'ryba',
    categories: ['food'],
    weight: 0.5,
    size: 'SM',
    color: 0x8fa8b8,
    description: 'Świeżo złowiona ryba. Szybko się psuje — najlepiej ją wysuszyć lub od razu zjeść.'
  },
  dried_fish: {
    kind: 'dried_fish',
    label: 'suszona ryba',
    categories: ['food'],
    weight: 0.25,
    size: 'XS',
    color: 0x6b7a6b,
    description: 'Ryba wysuszona na suszarce. Lekka i długo się nie psuje.'
  },
  fishing_rod: {
    kind: 'fishing_rod',
    label: 'wędka',
    categories: ['tool'],
    weight: 0.9,
    size: 'LG',
    color: 0x6b4a2f,
    description: 'Prosta wędka. Pozwala łowić ryby nad brzegiem jeziora.'
  },
  whetstone: {
    kind: 'whetstone',
    label: 'osełka',
    categories: ['utility'],
    weight: 0.3,
    size: 'XS',
    color: 0x8a8a90,
    description: 'Kamień szlifierski. Przywraca ostrość zużytej broni białej.'
  },
  short_bow: {
    kind: 'short_bow',
    label: 'krótki łuk',
    categories: ['weapon'],
    weight: 1.0,
    size: 'MD',
    color: 0x7a5a3a,
    description: 'Lekki, szybki łuk o niewielkim zasięgu. Łatwo go naciągnąć, ale zadaje mniejsze obrażenia.'
  },
  hunting_bow: {
    kind: 'hunting_bow',
    label: 'łuk myśliwski',
    categories: ['weapon'],
    weight: 1.4,
    size: 'MD',
    color: 0x6b4a2f,
    description: 'Uniwersalny łuk myśliwski. Dobry kompromis między zasięgiem, siłą i szybkością strzału.'
  },
  long_bow: {
    kind: 'long_bow',
    label: 'długi łuk',
    categories: ['weapon'],
    weight: 1.9,
    size: 'LG',
    color: 0x5a3a22,
    description: 'Długi, potężny łuk. Największy zasięg i obrażenia, ale wolniejsze naciąganie.'
  },
  arrow: {
    kind: 'arrow',
    label: 'strzała',
    categories: ['resource'],
    weight: 0.05,
    size: 'XS',
    color: 0x8a7a5a,
    description: 'Zwykła drewniana strzała z metalowym grotem.'
  },
  broadhead_arrow: {
    kind: 'broadhead_arrow',
    label: 'strzała łowiecka',
    categories: ['resource'],
    weight: 0.06,
    size: 'XS',
    color: 0xb5a06a,
    description: 'Strzała z szerokim grotem — zadaje większe obrażenia zwierzynie.'
  },
  war_arrow: {
    kind: 'war_arrow',
    label: 'strzała bojowa',
    categories: ['resource'],
    weight: 0.08,
    size: 'XS',
    color: 0x5a5a5a,
    description: 'Cięższa, wzmocniona strzała bojowa. Zadaje największe obrażenia.'
  },
  chest: {
    kind: 'chest',
    label: 'skrzynia',
    categories: ['utility'],
    weight: 4,
    size: 'XL',
    color: 0x6b4a2f,
    description: 'Solidna drewniana skrzynia. Postaw ją w świecie, by przechowywać przedmioty.'
  },
  backpack: {
    kind: 'backpack',
    label: 'plecak',
    categories: ['utility'],
    weight: 2,
    size: 'LG',
    color: 0x5a4632,
    description: 'Skórzany plecak. Noszony w ekwipunku zwiększa udźwig.'
  },
  tree_seed: {
    kind: 'tree_seed',
    label: 'nasiono drzewa',
    categories: ['resource'],
    weight: 0.02,
    size: 'XS',
    color: 0x5a7a3a,
    description: 'Garść nasion drzewa. Zasadzone na odpowiednim gruncie wyrośnie w prawdziwe drzewo, dobrane do miejsca.'
  },
  seed_carrot: {
    kind: 'seed_carrot',
    label: 'nasiona marchwi',
    categories: ['resource'],
    weight: 0.02,
    size: 'XS',
    color: 0xd9762c,
    description: 'Nasiona marchwi. Zasadź je w ogródku, by po pewnym czasie zebrać plon.'
  },
  seed_potato: {
    kind: 'seed_potato',
    label: 'sadzeniaki ziemniaka',
    categories: ['resource'],
    weight: 0.03,
    size: 'XS',
    color: 0xc9a86a,
    description: 'Bulwy ziemniaka gotowe do posadzenia w ogródku.'
  },
  seed_cabbage: {
    kind: 'seed_cabbage',
    label: 'nasiona kapusty',
    categories: ['resource'],
    weight: 0.02,
    size: 'XS',
    color: 0x7ba85a,
    description: 'Nasiona kapusty. Zasadź je w ogródku, by po pewnym czasie zebrać plon.'
  },
}

const _itemShadowBox = new THREE.Box3()
const _itemShadowSize = new THREE.Vector3()

/** Pickup mesh — prefers a preloaded GLB clone when available (`itemModels.ts`),
 *  otherwise a cheap procedural stand-in (resources + tool fallbacks). GLB
 *  meshes already carry a correct per-submesh `castShadow` from `loadGltf.ts`'s
 *  own size threshold; the procedural fallback is thresholded here instead,
 *  once, over its whole assembled bbox — `buildProceduralItemMesh`'s inline
 *  `castShadow = true` is only a provisional default, overridden below
 *  (plan 145 R2: small pickups — stone/shell/branch/mushroom/... — otherwise
 *  cost a shadow-pass draw call for a fraction of a shadow-map texel, same
 *  reasoning as `SMALL_MESH_SHADOW_THRESHOLD`/`createReed`/`createRockCluster`). */
export function createItemMesh(kind: ItemKind): THREE.Object3D {
  const glb = cloneItemGlb(kind)
  if (glb) return glb

  const root = buildProceduralItemMesh(kind)
  root.updateMatrixWorld(true)
  _itemShadowBox.setFromObject(root)
  const diagonal = _itemShadowBox.getSize(_itemShadowSize).length()
  const cast = diagonal >= SMALL_MESH_SHADOW_THRESHOLD
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh
    if (mesh.isMesh) mesh.castShadow = cast
  })
  return root
}

function buildProceduralItemMesh(kind: ItemKind): THREE.Object3D {
  if (kind === 'stone') {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.14, 0),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.stone.color, flatShading: true }),
    )
    mesh.position.y = 0.1
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'shell') {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.13, 6, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.shell.color, flatShading: true }),
    )
    mesh.scale.set(1, 0.5, 1.3)
    mesh.position.y = 0.08
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'branch') {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.035, 0.4, 5),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.branch.color, flatShading: true }),
    )
    mesh.rotation.z = Math.PI / 2.3
    mesh.rotation.y = 0.4
    mesh.position.y = 0.05
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'beam') {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.08, 0.55),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.beam.color, flatShading: true }),
    )
    mesh.rotation.y = 0.3
    mesh.position.y = 0.05
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'mushroom') {
    const group = new THREE.Group()
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.04, 0.14, 6),
      new THREE.MeshStandardMaterial({ color: 0xe8dcc0, flatShading: true }),
    )
    stem.position.y = 0.07
    stem.castShadow = true
    group.add(stem)
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.mushroom.color, flatShading: true }),
    )
    cap.position.y = 0.13
    cap.castShadow = true
    group.add(cap)
    return group
  }
  if (kind === 'flower') {
    const group = new THREE.Group()
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.015, 0.22, 4),
      new THREE.MeshStandardMaterial({ color: 0x4a7a3a, flatShading: true }),
    )
    stem.position.y = 0.11
    stem.castShadow = true
    group.add(stem)
    const bloom = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.06, 0),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.flower.color, flatShading: true }),
    )
    bloom.position.y = 0.24
    bloom.castShadow = true
    group.add(bloom)
    return group
  }
  if (kind === 'herb') {
    const group = new THREE.Group()
    for (let i = -1; i <= 1; i++) {
      const blade = new THREE.Mesh(
        new THREE.ConeGeometry(0.015, 0.16, 4),
        new THREE.MeshStandardMaterial({ color: ITEM_DEFS.herb.color, flatShading: true }),
      )
      blade.position.set(i * 0.035, 0.08, 0)
      blade.rotation.z = i * 0.25
      blade.castShadow = true
      group.add(blade)
    }
    return group
  }
  if (kind === 'bandage') {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.05, 0.05, 0.16, 10),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.bandage.color, flatShading: true }),
    )
    mesh.rotation.z = Math.PI / 2
    mesh.position.y = 0.05
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'cone') {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.14, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.cone.color, flatShading: true }),
    )
    mesh.position.y = 0.07
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'knife' || kind === 'damascus_knife') {
    const group = new THREE.Group()
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.22, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS[kind].color, flatShading: true, metalness: 0.4 }),
    )
    blade.rotation.x = Math.PI / 2
    blade.position.set(0, 0.05, 0.11)
    blade.castShadow = true
    group.add(blade)
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.025, 0.12, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3324, flatShading: true }),
    )
    handle.rotation.x = Math.PI / 2
    handle.position.set(0, 0.05, -0.06)
    handle.castShadow = true
    group.add(handle)
    return group
  }
  if (
    kind === 'long_sword' || kind === 'damascus_long_sword' ||
    kind === 'masterwork_sword' || kind === 'obsidian_sword'
  ) {
    const group = new THREE.Group()
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.22, 4),
      new THREE.MeshStandardMaterial({
        color: ITEM_DEFS[kind].color,
        flatShading: true,
        metalness: kind === 'obsidian_sword' ? 0.15 : 0.4,
      }),
    )
    blade.rotation.x = Math.PI / 2
    blade.position.set(0, 0.05, 0.11)
    blade.castShadow = true
    group.add(blade)
    return group
  }
  if (kind === 'short_sword' || kind === 'damascus_short_sword') {
    const group = new THREE.Group()
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.03, 0.16, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS[kind].color, flatShading: true, metalness: 0.4 }),
    )
    blade.rotation.x = Math.PI / 2
    blade.position.set(0, 0.05, 0.09)
    blade.castShadow = true
    group.add(blade)
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.1, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3324, flatShading: true }),
    )
    handle.rotation.x = Math.PI / 2
    handle.position.set(0, 0.05, -0.06)
    handle.castShadow = true
    group.add(handle)
    return group
  }
  if (kind === 'spear') {
    const group = new THREE.Group()
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.018, 0.6, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, flatShading: true }),
    )
    shaft.rotation.x = Math.PI / 2
    shaft.position.set(0, 0.06, 0)
    shaft.castShadow = true
    group.add(shaft)
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.03, 0.14, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.spear.color, flatShading: true, metalness: 0.45 }),
    )
    head.rotation.x = Math.PI / 2
    head.position.set(0, 0.06, 0.36)
    head.castShadow = true
    group.add(head)
    return group
  }
  if (kind === 'firestarter') {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.1, 0),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.firestarter.color, flatShading: true }),
    )
    mesh.scale.set(1.2, 0.5, 0.9)
    mesh.position.y = 0.06
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'shovel') {
    const group = new THREE.Group()
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4a24, flatShading: true }),
    )
    handle.rotation.x = Math.PI / 2.4
    handle.position.set(0, 0.16, -0.05)
    handle.castShadow = true
    group.add(handle)
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.09, 0.16, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.shovel.color, flatShading: true, metalness: 0.3 }),
    )
    blade.rotation.x = Math.PI
    blade.scale.set(1, 1, 0.5)
    blade.position.set(0, 0.08, 0.13)
    blade.castShadow = true
    group.add(blade)
    return group
  }
  if (kind === 'axe' || kind === 'battle_axe') {
    const group = new THREE.Group()
    const heavy = kind === 'battle_axe'
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(heavy ? 0.024 : 0.02, heavy ? 0.024 : 0.02, heavy ? 0.48 : 0.42, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a3a22, flatShading: true }),
    )
    handle.rotation.x = Math.PI / 2.2
    handle.position.set(0, 0.14, -0.02)
    handle.castShadow = true
    group.add(handle)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(heavy ? 0.22 : 0.16, heavy ? 0.11 : 0.08, heavy ? 0.06 : 0.05),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS[kind].color, flatShading: true, metalness: 0.45 }),
    )
    head.position.set(0.02, 0.18, 0.14)
    head.castShadow = true
    group.add(head)
    return group
  }
  if (kind === 'pitchfork') {
    const group = new THREE.Group()
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.022, 0.7, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b4a24, flatShading: true }),
    )
    handle.rotation.x = Math.PI / 2.3
    handle.position.set(0, 0.12, -0.08)
    handle.castShadow = true
    group.add(handle)
    for (let i = -1; i <= 1; i++) {
      const tine = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.01, 0.22, 4),
        new THREE.MeshStandardMaterial({ color: ITEM_DEFS.pitchfork.color, flatShading: true, metalness: 0.35 }),
      )
      tine.rotation.x = Math.PI / 2.1
      tine.position.set(i * 0.04, 0.14, 0.22)
      tine.castShadow = true
      group.add(tine)
    }
    return group
  }
  if (kind === 'sickle') {
    const group = new THREE.Group()
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.018, 0.02, 0.14, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3324, flatShading: true }),
    )
    handle.rotation.z = Math.PI / 2.4
    handle.position.set(-0.06, 0.06, 0)
    handle.castShadow = true
    group.add(handle)
    const blade = new THREE.Mesh(
      new THREE.TorusGeometry(0.1, 0.018, 4, 10, Math.PI * 1.1),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.sickle.color, flatShading: true, metalness: 0.45 }),
    )
    blade.rotation.set(Math.PI / 2, 0, -0.4)
    blade.position.set(0.06, 0.08, 0.02)
    blade.castShadow = true
    group.add(blade)
    return group
  }
  if (kind === 'tomato') {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.tomato.color, flatShading: true }),
    )
    mesh.position.y = 0.09
    mesh.castShadow = true
    return mesh
  }
  if (
    kind === 'raw_meat' || kind === 'roasted_meat' ||
    kind === 'deer_meat' || kind === 'wolf_meat' || kind === 'boar_meat' ||
    kind === 'rabbit_meat' || kind === 'beef'
  ) {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(kind === 'rabbit_meat' ? 0.08 : 0.11, 0),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS[kind].color, flatShading: true }),
    )
    mesh.scale.set(1.3, 0.7, 1)
    mesh.position.y = 0.08
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'hide') {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.32, 0.02, 0.26),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.hide.color, flatShading: true }),
    )
    mesh.position.y = 0.02
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'cheese') {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.09, 10),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.cheese.color, flatShading: true }),
    )
    mesh.position.y = 0.045
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'dried_meat') {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.025, 0.16, 3, 5),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.dried_meat.color, flatShading: true }),
    )
    mesh.rotation.z = Math.PI / 2.2
    mesh.position.y = 0.04
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'bread') {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.08, 0.18, 4, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.bread.color, flatShading: true }),
    )
    mesh.rotation.z = Math.PI / 2
    mesh.position.y = 0.08
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'waterskin_empty' || kind === 'waterskin_full') {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS[kind].color, flatShading: true }),
    )
    body.scale.set(0.85, 1.15, 0.85)
    body.position.y = 0.14
    body.castShadow = true
    group.add(body)
    const neck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.04, 0.08, 6),
      new THREE.MeshStandardMaterial({ color: 0x4a3324, flatShading: true }),
    )
    neck.position.y = 0.26
    neck.castShadow = true
    group.add(neck)
    return group
  }
  if (kind === 'coal' || kind === 'iron' || kind === 'gold') {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.12, 0),
      new THREE.MeshStandardMaterial({
        color: ITEM_DEFS[kind].color,
        flatShading: true,
        metalness: kind === 'gold' ? 0.55 : 0.15,
      }),
    )
    mesh.position.y = 0.09
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'iron_rod') {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.4, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.iron_rod.color, flatShading: true, metalness: 0.55 }),
    )
    mesh.rotation.z = Math.PI / 2.3
    mesh.position.y = 0.05
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'pan') {
    const group = new THREE.Group()
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.03, 12),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.pan.color, flatShading: true, metalness: 0.4 }),
    )
    body.position.y = 0.05
    body.castShadow = true
    group.add(body)
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.016, 0.28, 6),
      new THREE.MeshStandardMaterial({ color: 0x2a2a2a, flatShading: true }),
    )
    handle.rotation.z = Math.PI / 2
    handle.position.set(0.27, 0.05, 0)
    handle.castShadow = true
    group.add(handle)
    return group
  }
  if (kind === 'pickaxe') {
    const group = new THREE.Group()
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a3a22, flatShading: true }),
    )
    handle.rotation.x = Math.PI / 2.2
    handle.position.set(0, 0.14, -0.02)
    handle.castShadow = true
    group.add(handle)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.2, 0.06, 0.06),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.pickaxe.color, flatShading: true, metalness: 0.4 }),
    )
    head.position.set(0, 0.18, 0.16)
    head.castShadow = true
    group.add(head)
    return group
  }
  if (kind === 'tent') {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.36, 0.14, 0.28),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.tent.color, flatShading: true }),
    )
    mesh.position.y = 0.07
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'trap_simple' || kind === 'trap_good') {
    // Folded-shut trap as a pickup (the placed prop lives in `trapProp.ts`).
    const group = new THREE.Group()
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(kind === 'trap_good' ? 0.15 : 0.12, 0.022, 4, 10),
      new THREE.MeshStandardMaterial({
        color: ITEM_DEFS[kind].color,
        flatShading: true,
        metalness: kind === 'trap_good' ? 0.5 : 0.25,
      }),
    )
    ring.rotation.x = -Math.PI / 2
    ring.position.y = 0.04
    ring.castShadow = true
    group.add(ring)
    const chain = new THREE.Mesh(
      new THREE.CylinderGeometry(0.012, 0.012, 0.18, 4),
      new THREE.MeshStandardMaterial({ color: 0x4a4a4a, flatShading: true, metalness: 0.5 }),
    )
    chain.rotation.z = Math.PI / 2
    chain.position.set(0.14, 0.03, 0)
    chain.castShadow = true
    group.add(chain)
    return group
  }
  if (kind === 'coin') {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 0.015, 12),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.coin.color, flatShading: true, metalness: 0.6 }),
    )
    mesh.rotation.x = Math.PI / 2
    mesh.position.y = 0.02
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'wooden_torch') {
    const group = new THREE.Group()
    const stick = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.028, 0.55, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.wooden_torch.color, flatShading: true }),
    )
    stick.position.y = 0.28
    stick.castShadow = true
    group.add(stick)
    const wrap = new THREE.Mesh(
      new THREE.SphereGeometry(0.06, 6, 4),
      new THREE.MeshStandardMaterial({ color: 0xc45a1a, flatShading: true, emissive: 0x331100 }),
    )
    wrap.position.y = 0.58
    wrap.scale.set(1, 1.2, 1)
    wrap.castShadow = true
    group.add(wrap)
    return group
  }
  if (kind === 'berries' || kind === 'nuts') {
    const group = new THREE.Group()
    for (let i = 0; i < 5; i++) {
      const berry = new THREE.Mesh(
        new THREE.DodecahedronGeometry(0.03, 0),
        new THREE.MeshStandardMaterial({ color: ITEM_DEFS[kind].color, flatShading: true }),
      )
      berry.position.set((i % 3 - 1) * 0.05, 0.03 + Math.floor(i / 3) * 0.05, (i % 2) * 0.04)
      berry.castShadow = true
      group.add(berry)
    }
    return group
  }
  if (kind === 'apple') {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.08, 8, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.apple.color, flatShading: true }),
    )
    mesh.position.y = 0.08
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'carrot') {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.22, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.carrot.color, flatShading: true }),
    )
    mesh.rotation.x = Math.PI / 2.2
    mesh.position.y = 0.05
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'potato') {
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.09, 0),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.potato.color, flatShading: true }),
    )
    mesh.scale.set(1.2, 0.8, 1)
    mesh.position.y = 0.07
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'cabbage') {
    const mesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.14, 8, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.cabbage.color, flatShading: true }),
    )
    mesh.position.y = 0.13
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'honey') {
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.12, 10),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.honey.color, flatShading: true, metalness: 0.1 }),
    )
    mesh.position.y = 0.06
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'fish' || kind === 'dried_fish') {
    const mesh = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.03, 0.18, 3, 5),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS[kind].color, flatShading: true }),
    )
    mesh.rotation.z = Math.PI / 2
    mesh.position.y = 0.05
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'fishing_rod') {
    const group = new THREE.Group()
    const rod = new THREE.Mesh(
      new THREE.CylinderGeometry(0.014, 0.02, 1.1, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.fishing_rod.color, flatShading: true }),
    )
    rod.rotation.x = Math.PI / 2.3
    rod.position.y = 0.3
    rod.castShadow = true
    group.add(rod)
    const line = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, 0.5, 4),
      new THREE.MeshStandardMaterial({ color: 0xd8d8d8, flatShading: true }),
    )
    line.position.set(0, 0.05, 0.5)
    group.add(line)
    return group
  }
  if (kind === 'short_bow' || kind === 'hunting_bow' || kind === 'long_bow') {
    const group = new THREE.Group()
    const height = kind === 'short_bow' ? 0.5 : kind === 'hunting_bow' ? 0.68 : 0.85
    const limb = new THREE.Mesh(
      new THREE.TorusGeometry(height / 2, 0.014, 4, 10, Math.PI * 0.92),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS[kind].color, flatShading: true }),
    )
    limb.rotation.set(0, Math.PI / 2, Math.PI / 2)
    limb.position.y = height / 2
    limb.castShadow = true
    group.add(limb)
    const string = new THREE.Mesh(
      new THREE.CylinderGeometry(0.004, 0.004, height * 0.92, 3),
      new THREE.MeshStandardMaterial({ color: 0xd8d0c0, flatShading: true }),
    )
    string.position.set(0.06, height / 2, 0)
    string.castShadow = true
    group.add(string)
    return group
  }
  if (kind === 'arrow' || kind === 'broadhead_arrow' || kind === 'war_arrow') {
    const group = new THREE.Group()
    const shaft = new THREE.Mesh(
      new THREE.CylinderGeometry(0.008, 0.008, 0.55, 5),
      new THREE.MeshStandardMaterial({ color: 0x8a7a5a, flatShading: true }),
    )
    shaft.rotation.x = Math.PI / 2
    shaft.position.y = 0.03
    shaft.castShadow = true
    group.add(shaft)
    const head = new THREE.Mesh(
      new THREE.ConeGeometry(0.02, 0.06, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS[kind].color, flatShading: true, metalness: 0.4 }),
    )
    head.rotation.x = Math.PI / 2
    head.position.set(0, 0.03, 0.3)
    head.castShadow = true
    group.add(head)
    return group
  }
  if (kind === 'tree_seed' || kind === 'seed_carrot' || kind === 'seed_potato' || kind === 'seed_cabbage') {
    // Small seed pouch — a flattened dodecahedron reads as "a handful of
    // seeds" without needing a dedicated GLB (plan 126).
    const mesh = new THREE.Mesh(
      new THREE.DodecahedronGeometry(0.07, 0),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS[kind].color, flatShading: true }),
    )
    mesh.scale.set(1.2, 0.6, 1)
    mesh.position.y = 0.045
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'whetstone') {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.035, 0.05),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.whetstone.color, flatShading: true }),
    )
    mesh.position.y = 0.02
    mesh.castShadow = true
    return mesh
  }
  // blanket
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.06, 0.32),
    new THREE.MeshStandardMaterial({ color: ITEM_DEFS.blanket.color, flatShading: true }),
  )
  mesh.position.y = 0.03
  mesh.castShadow = true
  return mesh
}
