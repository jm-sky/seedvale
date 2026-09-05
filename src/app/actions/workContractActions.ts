import type { VueUi } from '../../ui-vue/mount'
import { evaluateGroundPlacement, type GroundPlacementReason } from '../../items/tentPlacement'
import { terrainPreparationRemainingWork } from '../../terrain/terrainPreparation'
import { isPalisadeConstructionComplete, palisadeRemainingWork } from '../../world/palisade'
import { formatHours, isWellCompleted, WELL_FOOTPRINT_RADIUS, WELL_SEPARATION, wellRemainingWork } from '../../world/playerWell'
import { isStandingTorchConstructionComplete, standingTorchRemainingWork } from '../../world/standingTorch'
import {
  canPostContract,
  type ContractTarget,
  isContractTerminal,
  noticeBoardId,
  WORK_SHARE_PRESETS,
  type WorkType,
} from '../../world/workContract'
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
/** A construction contract's target is a real `PlayerWellRecord` (plan
 *  npc-015 §7 — the only construction the existing world-object domain can
 *  already represent incrementally), placed together with the contract, so
 *  placement validity reuses the well's own footprint/separation rather than
 *  a smaller ad hoc one that could let the flag land somewhere the well
 *  itself wouldn't fit. */
const CONTRACT_TARGET_FOOTPRINT_RADIUS = WELL_FOOTPRINT_RADIUS
const CONTRACT_TARGET_SEPARATION = WELL_SEPARATION

const CONTRACT_TARGET_PLACEMENT_MESSAGE: Record<Exclude<GroundPlacementReason, 'ok'>, string> = {
  water: 'Tu jest za mokro na zlecenie budowy.',
  slope: 'Teren jest zbyt stromy.',
  object: 'Za mało miejsca — coś stoi w pobliżu.',
  occupied: 'Tu już jest zgłoszone inne zlecenie.',
}

/** Display label per `ContractTarget['kind']` (plan npc-018 §10/§14, extended
 *  by items-player-017 §16) — the single place every contract-listing UI
 *  (notice board, Quick Actions "Zlecenia") reads instead of re-deriving it. */
const WORK_TYPE_LABEL: Record<WorkType, string> = {
  construction: 'budowa',
  terrain_preparation: 'przygotowanie terenu',
  palisade: 'segment palisady',
  standing_torch: 'pochodnia',
}

export type WorkContractQuickActionEntry = { id: string, label: string, cost: string }

export type WorkContractActions = {
  /** Read-only preview of a new contract's target at the player's current aim
   *  (plan §3/§4) — backs the shared placement-preview ghost/UI;
   *  `confirmContractPlacementAtAim` remains the only mutation seam. */
  previewContractPlacement: () => PlacementPreviewResult
  /** Confirm step of the placement-preview flow — re-resolves and
   *  re-validates the site fresh (never trusts the cached preview), then
   *  walks the work-share → reward picker chain (`beginContractCreation`,
   *  plan §21). Creating the contract itself (on a preset pick) never
   *  advertises it (plan §4). */
  confirmContractPlacementAtAim: () => void
  /** `[E]` on a settlement notice board (plan §7/§9) — opens a panel listing
   *  the player's own postable contracts; picking one posts it. */
  openNoticeBoard: (settlementId: string) => void
  /** Cancels a contract and removes its flag/advertisement (plan §10). */
  cancelContract: (id: string) => void
  /** Quick Actions "Zlecenia" list (view/cancel only) — every non-terminal
   *  contract the player currently holds. */
  quickActionsList: () => WorkContractQuickActionEntry[]
  /** Quick Actions "Zleć pomoc" (plan npc-018 §2/§20) — lists the player's
   *  own unfinished construction/terrain-preparation targets that don't
   *  already have a non-terminal contract, and walks the same work-share →
   *  reward → create flow `confirmContractPlacementAtAim` uses for a
   *  brand-new target. */
  openHireHelp: () => void
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
      // A contract's flag/well must not overlap an unrelated existing well
      // or another pending contract's own future well.
      peers: [
        ...bundle.playerWells.nodes(),
        ...bundle.workContracts.nodes().filter((c) => !isContractTerminal(c.state)),
      ],
      footprintRadius: CONTRACT_TARGET_FOOTPRINT_RADIUS,
      separation: CONTRACT_TARGET_SEPARATION,
    }),
    footprintRadius: CONTRACT_TARGET_FOOTPRINT_RADIUS,
    reasonLabel: (reason) => CONTRACT_TARGET_PLACEMENT_MESSAGE[reason],
  })

  const previewContractPlacement = (): PlacementPreviewResult =>
    previewGroundPlacement(contractPlacementDefinition())

  /** Second step of every contract-creation flow (plan npc-018 §4/§20) —
   *  the same work-share → reward → create chain whether `target` is a
   *  brand-new placement or an already-existing unfinished one. Never
   *  advertises the created contract (plan §3's "target must exist
   *  independently of the contract" — posting stays the separate physical
   *  notice-board action). */
  const beginContractCreation = (
    dialogTitle: string,
    target: ContractTarget,
    x: number,
    z: number,
    remainingWorkAtCreation: number,
  ): void => {
    vueUi.openFlavorDialog(
      dialogTitle,
      `Jaki procent pozostałej pracy (${formatHours(remainingWorkAtCreation)} h) ma wykonać najemnik?`,
      WORK_SHARE_PRESETS.map((share) => ({
        label: `${Math.round(share * 100)}%`,
        enabled: true,
        reasonLabel: '',
        run: () => vueUi.openFlavorDialog(
          dialogTitle,
          'Wybierz wynagrodzenie za wykonanie prac. Zlecenie nie zostanie jeszcze ogłoszone — trzeba będzie zanieść ogłoszenie na tablicę w osadzie.',
          CONTRACT_REWARD_PRESETS.map((reward) => ({
            label: `${reward} monet`,
            enabled: true,
            reasonLabel: '',
            run: () => {
              const created = bundle.workContracts.create({
                employer: CONTRACT_EMPLOYER,
                target,
                x,
                z,
                rewardCoins: reward,
                requestedWorkShare: share,
                remainingWorkAtCreation,
                now: dayNight.elapsedDays,
              })
              ctx.syncQuickActionAvailability()
              toast.show(
                created ? 'Utworzono zlecenie. Zanieś ogłoszenie do tablicy w osadzie.' : 'Ten cel ma już aktywne zlecenie.',
                created ? 'info' : 'error',
              )
            },
          })),
        ),
      })),
    )
  }

  const confirmContractPlacementAtAim = (): void => {
    if (isActionBlocked(ctx)) return
    const { site, reason } = evaluatePlacementSite(contractPlacementDefinition())
    if (reason !== 'ok') {
      toast.show(CONTRACT_TARGET_PLACEMENT_MESSAGE[reason], 'error')
      return
    }
    const { x, z } = site
    // The buildable itself (plan npc-015 §7) — placed once, up front, so
    // the contract's target is always a real, incrementally workable object
    // rather than a bare location. No tool/capability is required here:
    // unlike the player's own `[E]`-driven well (`placeWellAtAim`), digging
    // is the hired worker's job, not the employer's.
    const well = bundle.playerWells.place(x, z, site.yaw)
    beginContractCreation('Nowe zlecenie budowy', { kind: 'construction', targetId: well.id }, x, z, wellRemainingWork(well))
  }

  /** Every unfinished target the player could hire help for right now (plan
   *  npc-018 §2/§9/§20) — an unfinished well or active terrain preparation
   *  with no non-terminal contract of its own yet. */
  const hireHelpCandidates = (): { target: ContractTarget, x: number, z: number, remainingWork: number, label: string }[] => {
    const wells = bundle.playerWells.nodes()
      .filter((w) => !isWellCompleted(w))
      .map((w) => ({
        target: { kind: 'construction' as const, targetId: w.id },
        x: w.x,
        z: w.z,
        remainingWork: wellRemainingWork(w),
        label: 'Studnia',
      }))
    const preparations = bundle.terrainPreparations.nodes()
      .filter((p) => terrainPreparationRemainingWork(p) > 0)
      .map((p) => ({
        target: { kind: 'terrain_preparation' as const, targetId: p.id },
        x: p.center.x,
        z: p.center.z,
        remainingWork: terrainPreparationRemainingWork(p),
        label: 'Przygotowanie terenu',
      }))
    const palisades = bundle.palisades.nodes()
      .filter((p) => !isPalisadeConstructionComplete(p))
      .map((p) => ({
        target: { kind: 'palisade' as const, targetId: p.id },
        x: p.x,
        z: p.z,
        remainingWork: palisadeRemainingWork(p),
        label: 'Segment palisady',
      }))
    const standingTorches = bundle.standingTorches.nodes()
      .filter((t) => !isStandingTorchConstructionComplete(t))
      .map((t) => ({
        target: { kind: 'standing_torch' as const, targetId: t.id },
        x: t.x,
        z: t.z,
        remainingWork: standingTorchRemainingWork(t),
        label: 'Pochodnia',
      }))
    return [...wells, ...preparations, ...palisades, ...standingTorches]
      .filter((candidate) => !bundle.workContracts.hasActiveContract(candidate.target))
  }

  const openHireHelp = (): void => {
    const candidates = hireHelpCandidates()
    if (candidates.length === 0) {
      vueUi.openFlavorDialog('Zleć pomoc', 'Nie masz żadnych niedokończonych prac do zlecenia.', [])
      return
    }
    vueUi.openFlavorDialog(
      'Zleć pomoc',
      'Wybierz niedokończoną pracę, do której chcesz zatrudnić pomoc.',
      candidates.map((candidate) => ({
        label: `${candidate.label} — pozostało ${formatHours(candidate.remainingWork)} h`,
        enabled: true,
        reasonLabel: '',
        run: () => beginContractCreation('Zleć pomoc', candidate.target, candidate.x, candidate.z, candidate.remainingWork),
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
        label: `Zlecenie: ${WORK_TYPE_LABEL[contract.target.kind]} — ${contract.rewardCoins} monet`,
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
        label: `Anuluj: ${WORK_TYPE_LABEL[c.target.kind]} — ${c.rewardCoins} monet`,
        cost: c.advertisement === 'posted' ? 'ogłoszone' : 'nieogłoszone',
      }))

  return {
    previewContractPlacement,
    confirmContractPlacementAtAim,
    openNoticeBoard,
    cancelContract,
    quickActionsList,
    openHireHelp,
  }
}
