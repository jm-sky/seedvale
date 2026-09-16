import type { LandmarkKind } from '../../terrain/chunkEnvironment'
import type { QuestDef } from '../quests'
import type { SuspiciousTransportCaveCacheBinding } from '../suspiciousTransportCaveCache'
import type {
  OpportunityNpc,
  RpgQuestOpportunity,
} from './worldQuestOpportunityTypes'
import { LANDMARK_LABELS } from '../../terrain/chunkEnvironment'
import { describeCaveLocation } from '../caveLocationDescription'
import { WORLD_KNOWLEDGE_HOUR_DAYS } from '../quests'
import { buildSuspiciousTransportCaveCacheQuest } from '../suspiciousTransportCaveCache'
import {
  adultOpportunityNpcs,
  pickSuspiciousTransportReceiver,
} from './rpgQuestMatrices'

export type RpgMaterializationContext = {
  npcsBySettlement: ReadonlyMap<string, readonly OpportunityNpc[]>
  settlementNameById: ReadonlyMap<string, string>
  /** When present and matching this opportunity id, use the cave-cache variant. */
  suspiciousTransportCaveCache?: SuspiciousTransportCaveCacheBinding | null
  /** Already-resolved player-facing cave phrase for the cave-cache variant. */
  suspiciousTransportCaveDescription?: string | null
}

function landmarkKindFromId(landmarkId: string): LandmarkKind | undefined {
  const prefix = landmarkId.split(':')[0]
  if (prefix && prefix in LANDMARK_LABELS) return prefix as LandmarkKind
  return undefined
}

function pickGiver(
  npcs: readonly OpportunityNpc[],
  preferredRole: OpportunityNpc['role'],
  excludeId?: string,
): OpportunityNpc | undefined {
  const pool = adultOpportunityNpcs(npcs).filter((npc) => npc.id !== excludeId)
  return pool.find((npc) => npc.role === preferredRole) ?? pool[0]
}

function pickFirstAdult(
  npcs: readonly OpportunityNpc[],
  excludeId?: string,
): OpportunityNpc | undefined {
  return adultOpportunityNpcs(npcs).find((npc) => npc.id !== excludeId)
}

function materializeOldPlaceSecret(
  opportunity: RpgQuestOpportunity,
  giver: OpportunityNpc,
  settlementName: string,
): QuestDef {
  const kind = landmarkKindFromId(opportunity.sourceId)
  return {
    id: opportunity.id,
    title: 'Sekret starego miejsca',
    description:
      `${giver.name} słyszał o starym miejscu w okolicy osady ${settlementName}, ale musi jeszcze dopytać, zanim wskaże drogę.`,
    giverName: giver.name,
    giver: { npcId: giver.id },
    offerLine:
      `Chodzą słuchy o jakimś starym miejscu za osadą. Nikt z nas nie miał czasu tego sprawdzić, a ja muszę jeszcze popytać ludzi, którzy pamiętają tamtą drogę. Wróć za godzinę — wtedy ci powiem, gdzie szukać.`,
    worldKnowledge: [{
      id: 'target',
      revealDelayDays: WORLD_KNOWLEDGE_HOUR_DAYS,
      bind: {
        type: 'landmark',
        kind: kind ?? 'smallRuins',
        landmarkId: opportunity.sourceId,
      },
      pendingPhrase: 'Popytam ludzi, którzy pamiętają tamtą drogę. Daj mi trochę czasu.',
      unavailablePhrase: 'Nie udało mi się odtworzyć, gdzie leży to stare miejsce.',
      unavailablePolicy: 'fail',
      unavailableOutcomeId: 'route_lost',
    }],
    acceptEffects: [{ type: 'request_world_knowledge', knowledgeId: 'target' }],
    stages: [
      {
        objective: { type: 'receive_world_knowledge', knowledgeId: 'target', npc: { npcId: giver.id } },
        description: `Wróć do ${giver.name}, gdy dopyta o stare miejsce.`,
        reminderLine: 'Popytam ludzi, którzy pamiętają tamtą drogę. Daj mi trochę czasu.',
        playerLine: 'Udało ci się ustalić, gdzie leży to miejsce?',
        progressLine: `Słuchaj: szukaj {worldKnowledgeClue:target}. Nikt z osady tam nie zaglądał.`,
      },
      {
        objective: { type: 'interact_bound_landmark', knowledgeId: 'target' },
        description: `Zbadaj {worldKnowledgeClue:target}.`,
        reminderLine: `Byłeś już przy tym miejscu? ${giver.name} czeka na wieść.`,
        progressLine:
          'Miejsce jest stare, ale prawdziwe. Ślady nie są świeże — ktoś tu bywał dawniej, nie teraz.',
      },
    ],
    reportPromptLine: 'Co znalazłeś w tamtym miejscu?',
    reportPlayerLine: 'Byłem tam. Miejsce stoi, ale od dawna nikt z niego nie korzysta.',
    reportLine: 'Dobrze wiedzieć, co tam jest. Dzięki, że sprawdziłeś.',
    settlementId: opportunity.settlementId,
    outcomes: [
      {
        id: 'reported',
        state: 'complete',
        consequences: {
          relations: [{ npc: { npcId: giver.id }, delta: 1 }],
          social: { reputation: { competence: 3, trust: 2 }, renown: 3 },
        },
      },
      {
        id: 'route_lost',
        state: 'failed',
        resultText: 'Trop do starego miejsca się urwał.',
      },
    ],
  }
}

function materializeSuspiciousTransport(
  opportunity: RpgQuestOpportunity,
  giver: OpportunityNpc,
  counterpart: OpportunityNpc,
  settlementName: string,
): QuestDef {
  return {
    id: opportunity.id,
    title: 'Podejrzany transport',
    description:
      `${giver.name} z osady ${settlementName} prosi o milczenie w sprawie przesyłki. ${counterpart.name} chce wiedzieć, skąd się wzięła.`,
    giverName: giver.name,
    giver: { npcId: giver.id },
    offerLine:
      `Ktoś zostawił mi przesyłkę do przekazania dalej i prosił, żebym nie zadawał pytań. Nie chcę, żeby to wyszło na forum osady. Porozmawiaj z ${counterpart.name}, jeśli musisz — ale wolę, żebyś po prostu przyjął, że tak ma być.`,
    stages: [
      {
        objective: { type: 'talk_to_npc', npc: { npcId: counterpart.id } },
        description: `Porozmawiaj z ${counterpart.name} o przesyłce.`,
        reminderLine: `${counterpart.name} może wiedzieć więcej o tej przesyłce.`,
        playerLine: `${giver.name} mówi o jakiejś przesyłce, o której nie chce rozmawiać.`,
        progressLine:
          `Słyszałem o tej przesyłce. ${giver.name} nie chce powiedzieć, skąd przyszła. Zdecyduj, czy zatajasz ten niejasny układ, czy ujawniasz go.`,
      },
      {
        objective: {
          type: 'talk_to_npc_choice',
          choices: [
            {
              npc: { npcId: giver.id },
              outcomeId: 'keep_quiet',
              npcLine:
                `No? ${counterpart.name} cię namawiał, żebyś to rozdmuchiwał? Zostaw to. Nie każda przesyłka musi mieć świadków.`,
              playerLine: 'Zataję ten niejasny układ. Nikomu nie powiem o tej przesyłce.',
            },
            {
              npc: { npcId: counterpart.id },
              outcomeId: 'report_it',
              npcLine:
                'Jeśli ta przesyłka jest niejasna, powiedz wprost. Osada nie potrzebuje cichych układów za plecami.',
              playerLine: `Zgłaszam przesyłkę ${giver.name}. Osada powinna wiedzieć o tym układzie.`,
            },
          ],
        },
        description: `Zdecyduj, czy zatajasz niejasny układ ${giver.name}, czy zgłaszasz go ${counterpart.name}.`,
        reminderLine: 'Zdecydowałeś już, czy zataić tę przesyłkę, czy ją ujawnić?',
      },
    ],
    reportLine: 'Ta przesyłka nie jest już tylko szeptem.',
    settlementId: opportunity.settlementId,
    outcomes: [
      {
        id: 'keep_quiet',
        state: 'complete',
        resultText: 'Dobrze. Nie każdy układ musi wychodzić na drogę.',
        reward: { visibility: 'hidden', items: [{ kind: 'coin', count: 8 }] },
        consequences: {
          relations: [
            { npc: { npcId: giver.id }, delta: 2 },
            { npc: { npcId: counterpart.id }, delta: -1 },
          ],
          social: { reputation: { trust: 1, integrity: -1 }, renown: 1 },
        },
      },
      {
        id: 'report_it',
        state: 'complete',
        resultText: 'Dziękuję, że powiedziałeś. Niech to nie zostanie w cieniu.',
        consequences: {
          relations: [
            { npc: { npcId: counterpart.id }, delta: 2 },
            { npc: { npcId: giver.id }, delta: -1 },
          ],
          social: { reputation: { integrity: 4, courage: 2 }, renown: 2 },
        },
      },
    ],
  }
}

function materializeSettlementAgreement(
  opportunity: RpgQuestOpportunity,
  giver: OpportunityNpc,
  target: OpportunityNpc,
  settlementName: string,
  targetSettlementName: string,
): QuestDef {
  return {
    id: opportunity.id,
    title: 'Umowa między osadami',
    description:
      `${giver.name} z osady ${settlementName} prosi, żebyś zanósł prośbę do ${target.name} z osady ${targetSettlementName}.`,
    giverName: giver.name,
    giver: { npcId: giver.id },
    offerLine:
      `Muszę przekazać prośbę do osady ${targetSettlementName}. Szukam ${target.name} — niech wie, że liczymy na ich odpowiedź. Przynieś mi wieść, albo niech ${target.name} zdecyduje przy tobie.`,
    stages: [
      {
        objective: { type: 'talk_to_npc', npc: { npcId: target.id } },
        description: `Porozmawiaj z ${target.name} w osadzie ${targetSettlementName}.`,
        reminderLine: `${target.name} jest w osadzie ${targetSettlementName}.`,
        playerLine: `${giver.name} z osady ${settlementName} przesyła prośbę. Chce waszej odpowiedzi.`,
        progressLine:
          `Słyszałem o tej prośbie. Możemy się zgodzić — albo wrócisz do ${giver.name} i powiesz, że na razie nie.`,
      },
      {
        objective: {
          type: 'talk_to_npc_choice',
          choices: [
            {
              npc: { npcId: target.id },
              outcomeId: 'accept_request',
              npcLine:
                `Niech ${giver.name} wie, że przyjęliśmy tę prośbę. To nie jest formalny układ, ale nasza odpowiedź jest jasna.`,
              playerLine: 'Przekażę, że przyjmujecie tę prośbę.',
            },
            {
              npc: { npcId: giver.id },
              outcomeId: 'decline_request',
              npcLine:
                `Więc ${target.name} nie chce się zobowiązywać. Szkoda, ale lepiej znać odpowiedź niż zgadywać.`,
              playerLine: `${target.name} nie chce się na razie zobowiązywać. Wracam z tą wieścią.`,
            },
          ],
        },
        description: `Zdecyduj, czy ${target.name} przyjmuje prośbę, czy wracasz z odmową do ${giver.name}.`,
        reminderLine: 'Zaniósłeś już odpowiedź?',
      },
    ],
    reportLine: 'Między osadami jest już jasna odpowiedź.',
    settlementId: opportunity.settlementId,
    outcomes: [
      {
        id: 'accept_request',
        state: 'complete',
        resultText: 'Dobrze. Niech wiedzą, że można na nas liczyć.',
        reward: { visibility: 'hidden', items: [{ kind: 'coin', count: 10 }] },
        consequences: {
          relations: [
            { npc: { npcId: giver.id }, delta: 2 },
            { npc: { npcId: target.id }, delta: 1 },
          ],
          social: { reputation: { trust: 3, competence: 2 }, renown: 4 },
        },
      },
      {
        id: 'decline_request',
        state: 'complete',
        resultText: 'Szkoda, ale lepiej znać odmowę niż udawać umowę.',
        consequences: {
          relations: [
            { npc: { npcId: giver.id }, delta: 1 },
            { npc: { npcId: target.id }, delta: 1 },
          ],
          social: { reputation: { trust: 2 }, renown: 2 },
        },
      },
    ],
  }
}

/**
 * Materializes a selected RPG matrix candidate into a normal `QuestDef`.
 * Matrix code owns authored composition only; QuestManager owns progress.
 *
 * @domain quests-progression
 * @system settlement-quest-opportunities
 * @role Materializes a selected RPG matrix candidate into a normal QuestDef.
 */
export function materializeRpgQuestOpportunity(
  opportunity: RpgQuestOpportunity,
  npcs: readonly OpportunityNpc[],
  settlementName: string,
  context?: RpgMaterializationContext,
): QuestDef | undefined {
  if (opportunity.matrixId === 'old-place-secret') {
    const giver = pickGiver(npcs, 'hunter')
    if (!giver) return undefined
    return materializeOldPlaceSecret(opportunity, giver, settlementName)
  }

  if (opportunity.matrixId === 'suspicious-transport') {
    const cave = context?.suspiciousTransportCaveCache
    if (cave && cave.questId === opportunity.id) {
      const giver = npcs.find((npc) => npc.id === cave.giverNpcId)
      const counterpart = npcs.find((npc) => npc.id === cave.counterpartNpcId)
      if (giver && counterpart && !giver.child && !counterpart.child) {
        return buildSuspiciousTransportCaveCacheQuest(
          cave,
          giver,
          counterpart,
          settlementName,
          context?.suspiciousTransportCaveDescription
            ?? describeCaveLocation({
              archetype: 'natural',
              directionPhrase: null,
              canonicalName: null,
              speakerRole: giver.role,
            }),
        )
      }
    }
    const counterpart = pickSuspiciousTransportReceiver(npcs, opportunity.sourceId)
    if (!counterpart) return undefined
    const giver = pickGiver(npcs, 'trader', counterpart.id)
    if (!giver) return undefined
    return materializeSuspiciousTransport(opportunity, giver, counterpart, settlementName)
  }

  if (opportunity.matrixId === 'settlement-agreement') {
    const giver = pickGiver(npcs, 'trader')
    if (!giver) return undefined
    const targetNpcs = context?.npcsBySettlement.get(opportunity.sourceId)
    const targetSettlementName = context?.settlementNameById.get(opportunity.sourceId)
    if (!targetNpcs || !targetSettlementName) return undefined
    const target = pickFirstAdult(targetNpcs)
    if (!target) return undefined
    return materializeSettlementAgreement(
      opportunity,
      giver,
      target,
      settlementName,
      targetSettlementName,
    )
  }

  return undefined
}
