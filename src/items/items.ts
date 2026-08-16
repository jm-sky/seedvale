import * as THREE from 'three'
import { cloneItemGlb } from './itemModels'

export type ItemKind =
  | 'shell'
  | 'stone'
  | 'branch'
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
  | 'coal'
  | 'iron'
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

export type ItemCategory = 'resource' | 'tool' | 'utility'

export type ItemDef = {
  label: string
  kind: ItemKind
  category: ItemCategory
  description?: string | null | undefined
  /** Kilograms — see `Inventory.ts`'s `totalWeight()`/`canAdd()`. */
  weight: number
  color: number
}

export const ITEM_DEFS: Record<ItemKind, ItemDef> = {
  shell: {
    kind: 'shell',
    label: 'muszla',
    category: 'resource',
    weight: 0.05,
    color: 0xf2e4c9,
    description: 'Lekka muszla znaleziona na brzegu. Podstawowa waluta tego świata.'
  },
  stone: {
    kind: 'stone',
    label: 'kamień',
    category: 'resource',
    weight: 1,
    color: 0x8c8c8c,
    description: 'Zwykły, solidny kamień. Przydatny w budowie i rzemiośle.'
  },
  branch: {
    kind: 'branch',
    label: 'gałąź',
    category: 'resource',
    weight: 0.5,
    color: 0x6b4a2f,
    description: 'Sucha gałąź zebrana w lesie. Łatwo ją wykorzystać jako opał lub materiał do prostych przedmiotów lub pochodnię.'
  },
  mushroom: {
    kind: 'mushroom',
    label: 'grzyb',
    category: 'resource',
    weight: 0.1,
    color: 0xc0453c,
    description: 'Leśny grzyb rosnący w cieniu drzew. Niektóre gatunki nadają się do jedzenia.'
  },
  flower: {
    kind: 'flower',
    label: 'kwiat',
    category: 'resource',
    weight: 0.05,
    color: 0xdb6fa3,
    description: 'Delikatny kwiat zerwany z łąki. Może ozdobić dom lub posłużyć do prostych wyrobów.'
  },
  cone: {
    kind: 'cone',
    label: 'szyszka',
    category: 'resource',
    weight: 0.1,
    color: 0x7a5230,
    description: 'Drobna szyszka sosnowa. Sucha i łatwopalna, doskonała do rozpalania ognia.'
  },
  knife: {
    kind: 'knife',
    label: 'nóż',
    category: 'tool',
    weight: 0.4,
    color: 0xb7bfc7,
    description: 'Niewielkie, poręczne ostrze przydatne podczas pracy, polowania i przygotowywania żywności.'
  },
  firestarter: {
    kind: 'firestarter',
    label: 'krzesiwo',
    category: 'tool',
    weight: 0.2,
    color: 0x54504a,
    description: 'Proste krzesiwo pozwalające wzniecić ogień przy pomocy suchego drewna - ognisko, pochodnia itp.'
  },
  blanket: {
    kind: 'blanket',
    label: 'koc',
    category: 'utility',
    weight: 1.5,
    color: 0x8a4b3a,
    description: 'Ciepły, wełniany koc. Chroni przed chłodem podczas odpoczynku i snu.'
  },
  shovel: {
    kind: 'shovel',
    label: 'łopata',
    category: 'tool',
    weight: 2,
    color: 0x6b4a32,
    description: 'Solidna łopata do kopania ziemi, przygotowywania grządek i wyrównywania terenu.'
  },
  axe: {
    kind: 'axe',
    label: 'siekiera',
    category: 'tool',
    weight: 2.5,
    color: 0x7a7e86,
    description: 'Ciężka siekiera z ostrym stalowym ostrzem. Niezastąpiona przy ścinaniu drzew i rąbaniu drewna.'
  },
  long_sword: {
    kind: 'long_sword',
    label: 'miecz',
    category: 'tool',
    weight: 2.5,
    color: 0x7a7e86,
    description: 'Długi, stalowy miecz. Ostry, wytrzymały i przeznaczony do walki.'
  },
  spear: {
    kind: 'spear',
    label: 'dzida',
    category: 'tool',
    weight: 1.8,
    color: 0x8a7a5a,
    description: 'Prosta dzida z drewnianym drzewcem i metalowym grotem. Długi zasięg przydaje się do walki i polowania.'
  },
  short_sword: {
    kind: 'short_sword',
    label: 'krótki miecz',
    category: 'tool',
    weight: 1.6,
    color: 0x9aa0a8,
    description: 'Krótki, poręczny miecz. Lżejszy i szybszy od miecza długiego, choć zadaje mniejsze obrażenia.'
  },
  pitchfork: {
    kind: 'pitchfork',
    label: 'widły',
    category: 'tool',
    weight: 1.8,
    color: 0x6b5a3a,
    description: 'Proste, mocne widły używane przy pracy w gospodarstwie i przenoszeniu siana.'
  },
  sickle: {
    kind: 'sickle',
    label: 'sierp',
    category: 'tool',
    weight: 0.7,
    color: 0x8a9098,
    description: 'Małe zakrzywione ostrze przeznaczone do ścinania trawy, zbóż i innych roślin.'
  },
  wooden_torch: {
    kind: 'wooden_torch',
    label: 'pochodnia',
    category: 'tool',
    weight: 1.2,
    color: 0x7a5230,
    description: 'Drewniana pochodnia dająca światło po zmroku i pomagająca rozświetlić ciemne miejsca.'
  },
  pickaxe: {
    kind: 'pickaxe',
    label: 'kilof',
    category: 'tool',
    weight: 2.5,
    color: 0x7a7e86,
    description: 'Ciężki kilof do rozbijania skał i wydobywania rud ukrytych w ziemi.'
  },
  tent: {
    kind: 'tent',
    label: 'namiot',
    category: 'utility',
    weight: 3,
    color: 0x8a6a3a,
    description: 'Lekki namiot zapewniający schronienie i miejsce do spania poza osadą.'
  },
  coal: {
    kind: 'coal',
    label: 'węgiel',
    category: 'resource',
    weight: 1,
    color: 0x1c1c1c,
    description: 'Czarny, łatwopalny surowiec wydobywany spod ziemi. Doskonałe źródło opału i paliwo do wytopu.'
  },
  iron: {
    kind: 'iron',
    label: 'żelazo',
    category: 'resource',
    weight: 1.5,
    color: 0x8a4a30,
    description: 'Ciężka ruda o rdzawym kolorze. Jeden z najważniejszych surowców do wytwarzania narzędzi i broni.'
  },
  gold: {
    kind: 'gold',
    label: 'złoto',
    category: 'resource',
    weight: 0.4,
    color: 0xd4af37,
    description: 'Rzadka i cenna ruda o charakterystycznym złotym połysku. Ceniona za swoją wartość i piękno.'
  },
  tomato: {
    kind: 'tomato',
    label: 'pomidor',
    category: 'resource',
    weight: 0.15,
    color: 0xc0392b,
    description: 'Dojrzały pomidor zerwany z przydomowego ogródka. Zaspokaja głód.'
  },
  raw_meat: {
    kind: 'raw_meat',
    label: 'surowe mięso',
    category: 'resource',
    weight: 0.8,
    color: 0xa5453f,
    description: 'Świeżo pozyskane mięso. Lepiej upiec je przy ognisku, zanim się je zje.'
  },
  roasted_meat: {
    kind: 'roasted_meat',
    label: 'pieczone mięso',
    category: 'resource',
    weight: 0.7,
    color: 0x8a5a3a,
    description: 'Mięso upieczone przy ognisku. Sycący posiłek.'
  },
  bread: {
    kind: 'bread',
    label: 'chleb',
    category: 'resource',
    weight: 0.5,
    color: 0xc99a52,
    description: 'Bochenek chleba. Dobrze się przechowuje — przydatny na czarną godzinę.'
  },
  waterskin_empty: {
    kind: 'waterskin_empty',
    label: 'bukłak (pusty)',
    category: 'utility',
    weight: 0.3,
    color: 0x6b5a3a,
    description: 'Skórzany bukłak na wodę. Pusty — napełnij go przy studni lub jeziorze.'
  },
  waterskin_full: {
    kind: 'waterskin_full',
    label: 'bukłak (pełny)',
    category: 'utility',
    weight: 1.3,
    color: 0x4a9fd8,
    description: 'Skórzany bukłak pełen wody. Ugasi pragnienie.'
  },
  deer_meat: {
    kind: 'deer_meat',
    label: 'mięso sarny',
    category: 'resource',
    weight: 0.9,
    color: 0xa5453f,
    description: 'Surowe mięso sarny, pozyskane z upolowanej zwierzyny. Lepiej upiec je przy ognisku.'
  },
  wolf_meat: {
    kind: 'wolf_meat',
    label: 'mięso wilka',
    category: 'resource',
    weight: 0.75,
    color: 0x8f4a44,
    description: 'Chude, twarde mięso wilka. Jadalne, choć niezbyt sycące na surowo.'
  },
  boar_meat: {
    kind: 'boar_meat',
    label: 'mięso dzika',
    category: 'resource',
    weight: 0.95,
    color: 0x9c4b3f,
    description: 'Tłuste mięso dzika. Sycące, zwłaszcza po upieczeniu.'
  },
  rabbit_meat: {
    kind: 'rabbit_meat',
    label: 'mięso królika',
    category: 'resource',
    weight: 0.4,
    color: 0xb56a5a,
    description: 'Niewielka porcja mięsa królika. Niewiele go, ale łatwo o kolejnego.'
  },
  beef: {
    kind: 'beef',
    label: 'wołowina',
    category: 'resource',
    weight: 1.2,
    color: 0xa14840,
    description: 'Kawał wołowiny z krowy. Najbardziej sycąca z surowych mięs.'
  },
  hide: {
    kind: 'hide',
    label: 'skóra',
    category: 'resource',
    weight: 0.6,
    color: 0x7a5a3f,
    description: 'Skóra zdjęta ze zwierzęcia przy oprawianiu tuszy. Przydatna do wyrobu i handlu.'
  },
  cheese: {
    kind: 'cheese',
    label: 'ser',
    category: 'resource',
    weight: 0.4,
    color: 0xe8c96a,
    description: 'Krąg twardego sera. Dobrze się przechowuje i dobrze syci.'
  },
  dried_meat: {
    kind: 'dried_meat',
    label: 'suszone mięso',
    category: 'resource',
    weight: 0.35,
    color: 0x6b3a2e,
    description: 'Paski suszonego mięsa. Lekkie, sycące i długo się nie psują — dobre na dłuższą wyprawę.'
  },
  coin: {
    kind: 'coin',
    label: 'moneta',
    category: 'resource',
    weight: 0.001,
    color: 0xc9a227,
    description: 'Bity krążek metalu. Przyjmowany za większe transakcje — nagrody za trudniejsze przysługi, działki na sprzedaż.'
  },
}

/** Pickup mesh — prefers a preloaded GLB clone when available (`itemModels.ts`),
 *  otherwise a cheap procedural stand-in (resources + tool fallbacks). */
export function createItemMesh(kind: ItemKind): THREE.Object3D {
  const glb = cloneItemGlb(kind)
  if (glb) return glb

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
  if (kind === 'cone') {
    const mesh = new THREE.Mesh(
      new THREE.ConeGeometry(0.06, 0.14, 6),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.cone.color, flatShading: true }),
    )
    mesh.position.y = 0.07
    mesh.castShadow = true
    return mesh
  }
  if (kind === 'knife') {
    const group = new THREE.Group()
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.22, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.knife.color, flatShading: true, metalness: 0.4 }),
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
  if (kind === 'long_sword') {
    const group = new THREE.Group()
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.035, 0.22, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.long_sword.color, flatShading: true, metalness: 0.4 }),
    )
    blade.rotation.x = Math.PI / 2
    blade.position.set(0, 0.05, 0.11)
    blade.castShadow = true
    group.add(blade)
    return group
  }
  if (kind === 'short_sword') {
    const group = new THREE.Group()
    const blade = new THREE.Mesh(
      new THREE.ConeGeometry(0.03, 0.16, 4),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.short_sword.color, flatShading: true, metalness: 0.4 }),
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
  if (kind === 'axe') {
    const group = new THREE.Group()
    const handle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.02, 0.02, 0.42, 6),
      new THREE.MeshStandardMaterial({ color: 0x5a3a22, flatShading: true }),
    )
    handle.rotation.x = Math.PI / 2.2
    handle.position.set(0, 0.14, -0.02)
    handle.castShadow = true
    group.add(handle)
    const head = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 0.08, 0.05),
      new THREE.MeshStandardMaterial({ color: ITEM_DEFS.axe.color, flatShading: true, metalness: 0.45 }),
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
  // blanket
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.06, 0.32),
    new THREE.MeshStandardMaterial({ color: ITEM_DEFS.blanket.color, flatShading: true }),
  )
  mesh.position.y = 0.03
  mesh.castShadow = true
  return mesh
}
