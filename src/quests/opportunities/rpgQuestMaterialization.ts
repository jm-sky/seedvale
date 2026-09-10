import type { LandmarkKind } from '../../terrain/chunkEnvironment'
import type { QuestDef } from '../quests'
import type {
  OpportunityNpc,
  RpgQuestOpportunity,
} from './worldQuestOpportunityTypes'
import { LANDMARK_LABELS } from '../../terrain/chunkEnvironment'
import { adultOpportunityNpcs } from './rpgQuestMatrices'

export type RpgMaterializationContext = {
  npcsBySettlement: ReadonlyMap<string, readonly OpportunityNpc[]>
  settlementNameById: ReadonlyMap<string, string>
}

function landmarkKindFromId(landmarkId: string): LandmarkKind | undefined {
  const prefix = landmarkId.split(':')[0]
  if (prefix && prefix in LANDMARK_LABELS) return prefix as LandmarkKind
  return undefined
}

function landmarkLabel(landmarkId: string): string {
  const kind = landmarkKindFromId(landmarkId)
  return kind ? LANDMARK_LABELS[kind].toLowerCase() : 'stare miejsce'
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
  const place = landmarkLabel(opportunity.sourceId)
  return {
    id: opportunity.id,
    title: 'Sekret starego miejsca',
    description:
      `${giver.name} wspomina o miejscu w okolicy osady ${settlementName} — ${place}, którego nikt z osady nie zbadał.`,
    giverName: giver.name,
    giver: { npcId: giver.id },
    offerLine:
      `Niedaleko osady jest ${place}. Nikt z nas nie miał czasu tam zajrzeć. Sprawdzisz, co tam jest, i wrócisz z wieścią?`,
    stages: [
      {
        objective: { type: 'interact_landmark', landmarkId: opportunity.sourceId },
        description: `Zbadaj ${place} wskazane przez ${giver.name}.`,
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
          `Słyszałem o tej przesyłce. ${giver.name} nie chce powiedzieć, skąd przyszła. Zdecyduj, czy zostawiasz to między wami, czy mówisz mi, co wiesz.`,
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
              playerLine: 'Zostawiam to między nami. Nie będę o tym rozgłaszał.',
            },
            {
              npc: { npcId: counterpart.id },
              outcomeId: 'report_it',
              npcLine:
                'Jeśli ta przesyłka jest niejasna, powiedz wprost. Osada nie potrzebuje cichych układów za plecami.',
              playerLine: `Mówię ci o przesyłce ${giver.name}. Nie chcę, żeby to zostało w cieniu.`,
            },
          ],
        },
        description: `Zdecyduj, czy zostawiasz sprawę ${giver.name}, czy zgłaszasz ją ${counterpart.name}.`,
        reminderLine: 'Zdecydowałeś już, co z tą przesyłką?',
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
    const counterpart = npcs.find((npc) => npc.id === opportunity.sourceId)
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
