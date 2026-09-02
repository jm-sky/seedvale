import type { VueUi } from '../../ui-vue/mount'
import { evaluateGroundPlacement, type GroundPlacementReason } from '../../items/tentPlacement'
import { canPostContract, isContractTerminal, noticeBoardId } from '../../world/workContract'
import { isActionBlocked, type PlayerActionContext } from './actionContext'
import {
  evaluatePlacementSite,
  type GroundPlacementDefinition,
  type PlacementBlocker,
  type PlacementPreviewResult,
  previewGroundPlacement,
} from './placementActions'

/** Player is always the employer in this foundation phase (plan npc-014) —
 *  a `string`, not a literal, so a later NPC-employer phase needs no schema
 *  change (see `world/workContract.ts`'s `WorkContractRecord.employer`). */
const CONTRACT_EMPLOYER = 'player'

/** Reward presets offered when creating a contract (plan §4) — this phase
 *  never escrows/charges the reward (payment is a later-phase non-goal), so
 *  any player-chosen amount would be equally "valid"; a small fixed menu
 *  reuses the existing `openFlavorDialog` button-list UI instead of a new
 *  numeric-input widget. */
const CONTRACT_REWARD_PRESETS = [10, 25, 50, 100] as const

const CONTRACT_TARGET_PLACE_REACH = 2
const CONTRACT_TARGET_FOOTPRINT_RADIUS = 0.4
const CONTRACT_TARGET_SEPARATION = 2

const CONTRACT_TARGET_PLACEMENT_MESSAGE: Record<Exclude<GroundPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na zlecenie budowy.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już jest zgłoszone inne zlecenie.',
}

export type WorkContractQuickActionEntry = { id: string, label: string, cost: string }

export type WorkContractActions = {
  /** Read-only preview of a new contract's target at the player's current aim
   *  (plan §3/§4) — backs the shared placement-preview ghost/UI;
   *  `confirmContractPlacementAtAim` remains the only mutation seam. */
  previewContractPlacement: () => PlacementPreviewResult
  /** Confirm step of the placement-preview flow — re-resolves and
   *  re-validates the site fresh (never trusts the cached preview), then
   *  opens the reward-picker panel. Creating the contract itself (on a
   *  preset pick) never advertises it (plan §4). */
  confirmContractPlacementAtAim: () => void
  /** `[E]` on a settlement notice board (plan §7/§9) — opens a panel listing
   *  the player's own postable contracts; picking one posts it. */
  openNoticeBoard: (settlementId: string) => void
  /** Cancels a contract and removes its flag/advertisement (plan §10). */
  cancelContract: (id: string) => void
  /** Quick Actions "Zlecenia" list (view/cancel only) — every non-terminal
   *  contract the player currently holds. */
  quickActionsList: () => WorkContractQuickActionEntry[]
}

export type WorkContractActionDeps = {
  vueUi: VueUi
  /** Shared ground-placement blockers (see `placementActions.ts`). */
  tentBlockers: (x: number, z: number) => PlacementBlocker[]
}

export function createWorkContractActions(
  ctx: PlayerActionContext,
  deps: WorkContractActionDeps,
): WorkContractActions {
  const { bundle, player, toast, mouseLook, dayNight } = ctx
  const { vueUi, tentBlockers } = deps

  /** Shared placement contract for a new contract's target (plan §3/§4) —
   *  same shape as `standingTorchPlacementDefinition`; peers are every
   *  non-terminal existing contract target, so two contracts can't stack on
   *  the same spot. */
  const contractPlacementDefinition = (): GroundPlacementDefinition<GroundPlacementReason> => ({
    aim: () => {
      const yaw = mouseLook.state.yaw
      return {
        x: player.mesh.position.x - Math.sin(yaw) * CONTRACT_TARGET_PLACE_REACH,
        z: player.mesh.position.z - Math.cos(yaw) * CONTRACT_TARGET_PLACE_REACH,
        yaw,
      }
    },
    evaluate: (site) => evaluateGroundPlacement({
      x: site.x,
      z: site.z,
      sampleHeight: (sx, sz) => bundle.chunkManager.sampleHeight(sx, sz),
      waterLevel: bundle.chunkManager.waterLevel,
      blockers: tentBlockers(site.x, site.z),
      peers: bundle.workContracts.nodes().filter((c) => !isContractTerminal(c.state)),
      footprintRadius: CONTRACT_TARGET_FOOTPRINT_RADIUS,
      separation: CONTRACT_TARGET_SEPARATION,
    }),
    footprintRadius: CONTRACT_TARGET_FOOTPRINT_RADIUS,
    reasonLabel: (reason) => CONTRACT_TARGET_PLACEMENT_MESSAGE[reason],
  })

  const previewContractPlacement = (): PlacementPreviewResult =>
    previewGroundPlacement(contractPlacementDefinition())

  const confirmContractPlacementAtAim = (): void => {
    if (isActionBlocked(ctx)) return
    const { site, reason } = evaluatePlacementSite(contractPlacementDefinition())
    if (reason !== 'ok') {
      toast.show(CONTRACT_TARGET_PLACEMENT_MESSAGE[reason], 'error')
      return
    }
    const { x, z } = site
    vueUi.openFlavorDialog(
      'Nowe zlecenie budowy',
      'Wybierz wynagrodzenie za wykonanie prac budowlanych w tym miejscu. Zlecenie nie zostanie jeszcze ogłoszone — trzeba będzie zanieść ogłoszenie na tablicę w osadzie.',
      CONTRACT_REWARD_PRESETS.map((reward) => ({
        label: `${reward} monet`,
        enabled: true,
        reasonLabel: '',
        run: () => {
          bundle.workContracts.create(CONTRACT_EMPLOYER, x, z, reward, dayNight.elapsedDays)
          ctx.syncQuickActionAvailability()
          toast.show('Utworzono zlecenie budowy. Zanieś ogłoszenie do tablicy w osadzie.')
        },
      })),
    )
  }

  const openNoticeBoard = (settlementId: string): void => {
    const boardId = noticeBoardId(settlementId)
    const postable = bundle.workContracts.list().filter((c) => c.employer === CONTRACT_EMPLOYER && canPostContract(c))
    if (postable.length === 0) {
      vueUi.openFlavorDialog('Tablica ogłoszeń', 'Nie masz żadnych nieogłoszonych zleceń do zawieszenia.', [])
      return
    }
    vueUi.openFlavorDialog(
      'Tablica ogłoszeń',
      'Wybierz zlecenie do ogłoszenia.',
      postable.map((contract) => ({
        label: `Zlecenie budowy — ${contract.rewardCoins} monet`,
        enabled: true,
        reasonLabel: '',
        run: () => {
          const posted = bundle.workContracts.post(contract.id, boardId, dayNight.elapsedDays)
          toast.show(posted ? 'Ogłoszenie zawieszone na tablicy.' : 'Nie udało się ogłosić zlecenia.', posted ? 'info' : 'error')
          ctx.syncQuickActionAvailability()
        },
      })),
    )
  }

  const cancelContract = (id: string): void => {
    if (!bundle.workContracts.cancel(id)) return
    toast.show('Zlecenie anulowane.')
    ctx.syncQuickActionAvailability()
  }

  const quickActionsList = (): WorkContractQuickActionEntry[] =>
    bundle.workContracts.list()
      .filter((c) => c.employer === CONTRACT_EMPLOYER && !isContractTerminal(c.state))
      .map((c) => ({
        id: c.id,
        label: `Anuluj: budowa — ${c.rewardCoins} monet`,
        cost: c.advertisement === 'posted' ? 'ogłoszone' : 'nieogłoszone',
      }))

  return { previewContractPlacement, confirmContractPlacementAtAim, openNoticeBoard, cancelContract, quickActionsList }
}
