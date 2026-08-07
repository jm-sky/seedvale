import type { NeedId } from './Needs'

export type Personality = 'calm' | 'cheerful' | 'curious' | 'grumpy'

/** Deterministic pool — assigned by index (like NPC_NAMES), not randomized per session. */
export const NPC_PERSONALITIES: readonly Personality[] = [
  'cheerful',
  'calm',
  'grumpy',
  'curious',
]

type Bucket = 'doing' | 'seeking'

type PersonalityLines = Record<Personality, Record<Bucket, string[]>>

const NEUTRAL: Record<Bucket, string[]> = {
  seeking: ['Mam coś do zrobienia.'],
  doing: ['Zaraz kończę.'],
}

const BANK: Record<NeedId, PersonalityLines> = {
  water: {
    cheerful: {
      seeking: [
        'Lecę po wodę do studni, zaraz wracam!',
        'Ale pragnienie — kurs na studnię!',
      ],
      doing: ['Ach, nareszcie woda ze studni!', 'Pyszna, zimna woda.'],
    },
    calm: {
      seeking: ['Idę po wodę, nie ma pośpiechu.', 'Studnia czeka.'],
      doing: ['Dobra, chłodna woda.', 'Teraz lepiej.'],
    },
    grumpy: {
      seeking: ['Znowu ta studnia...', 'Muszę się napić, inaczej nie wytrzymam.'],
      doing: ['No, w końcu.', 'Chociaż tyle.'],
    },
    curious: {
      seeking: [
        'Ciekawe, ile razy dziennie chodzę do tej studni...',
        'Znowu po wodę — a Ty skąd pijesz?',
      ],
      doing: [
        'Zastanawiam się, jak głęboka jest ta studnia.',
        'Smaczna woda, nie sądzisz?',
      ],
    },
  },
  food: {
    cheerful: {
      seeking: ['Zgłodniałem! Do ogrodu po coś dobrego.', 'Czas na przekąskę!'],
      doing: ['Pycha, prosto z ogrodu!', 'Nic tak nie smakuje jak świeże warzywa.'],
    },
    calm: {
      seeking: ['Idę coś zjeść.', 'Ogród niedaleko, zjem spokojnie.'],
      doing: ['Smacznego.', 'Właśnie to mi było potrzebne.'],
    },
    grumpy: {
      seeking: ['Burczy mi w brzuchu, trzeba iść.', 'Znowu głodny...'],
      doing: ['No, trochę lepiej.', 'Chociaż tyle mam z tego dnia.'],
    },
    curious: {
      seeking: ['Ciekawe, co dziś urosło w ogrodzie.', 'Idę sprawdzić ogród.'],
      doing: ['O, to nawet niezłe.', 'Zastanawiam się, kto to zasadził.'],
    },
  },
  wood: {
    cheerful: {
      seeking: ['Lecę po drewno!', 'Trochę ruchu przy drzewach mi się przyda.'],
      doing: ['Ciach, ciach — leci drewienko!', 'Stos rośnie w oczach.'],
    },
    calm: {
      seeking: ['Idę zająć się drewnem.', 'Czas na drewno, bez pośpiechu.'],
      doing: ['Powolutku, ale skutecznie.', 'Jedno polano na raz.'],
    },
    grumpy: {
      seeking: ['Znowu drewno...', 'Ktoś musi to robić.'],
      doing: ['Ciężka robota.', 'Ręce mnie bolą od tego.'],
    },
    curious: {
      seeking: [
        'Ciekawe, ile drewna zużywamy w tygodniu.',
        'Idę po drewno — a Ty rąbałeś kiedyś drzewo?',
      ],
      doing: ['Ładny słój ma to drzewo.', 'Zastanawiam się, na co pójdzie to drewno.'],
    },
  },
  idle: {
    cheerful: {
      seeking: ['Piękny dzień w Seedvale, prawda?', 'Nic pilnego — miło Cię widzieć!'],
      doing: ['Uwielbiam takie chwile.', 'Wszystko w porządku, dzięki że pytasz!'],
    },
    calm: {
      seeking: ['Wszystko w porządku, dziękuję.', 'Odpoczywam chwilę.'],
      doing: ['Spokojnie mija dzień.', 'Nic się nie dzieje, i dobrze.'],
    },
    grumpy: {
      seeking: ['Czego chcesz?', 'Nie mam teraz nic do roboty, i dobrze.'],
      doing: ['Zostaw mnie w spokoju na chwilę.', 'Odpoczywam, jeśli można.'],
    },
    curious: {
      seeking: ['Widziałeś już całą osadę?', 'Co słychać za tymi wzgórzami?'],
      doing: ['Zawsze się zastanawiam, co jest dalej za lasem.', 'Ciekawe czasy.'],
    },
  },
}

/** Random pick from need/personality/bucket, falling back to a neutral line if that
 *  combination has no dedicated variants yet — keeps the matrix safe to extend piecemeal. */
export function pickDialogueLine(
  personality: Personality,
  need: NeedId,
  busy: boolean,
): string {
  const bucket: Bucket = busy ? 'doing' : 'seeking'
  const lines = BANK[need]?.[personality]?.[bucket]
  const pool = lines && lines.length > 0 ? lines : NEUTRAL[bucket]
  return pool[Math.floor(Math.random() * pool.length)]!
}
