/**
 * In-memory composition-time claims for authored cave content anchors.
 * Not persisted — rebuilt deterministically on each world bundle assembly.
 *
 * Callers must apply requests in stable reservation-key order
 * (`quests-progression-023` story+loot pair, then `quests-progression-024`
 * loot-only, then later consumers). Conflicts skip the later request.
 *
 * @domain world-terrain
 */
export class CaveAuthoredAnchorClaims {
  private readonly claimedAnchorIds = new Set<string>()

  isClaimed(anchorId: string): boolean {
    return this.claimedAnchorIds.has(anchorId)
  }

  /**
   * Reserves a natural-cave `storyFind` + `loot` pair for one authored
   * consumer (plan quests-progression-023). Returns false when either
   * anchor is already claimed.
   */
  tryClaimNaturalStoryPair(storyAnchorId: string, lootAnchorId: string): boolean {
    if (this.claimedAnchorIds.has(storyAnchorId) || this.claimedAnchorIds.has(lootAnchorId)) {
      return false
    }
    this.claimedAnchorIds.add(storyAnchorId)
    this.claimedAnchorIds.add(lootAnchorId)
    return true
  }

  /**
   * Reserves a single anchor (e.g. natural `loot` for quests-progression-024).
   * Returns false when the anchor is already claimed.
   */
  tryClaimAnchor(anchorId: string): boolean {
    if (this.claimedAnchorIds.has(anchorId)) return false
    this.claimedAnchorIds.add(anchorId)
    return true
  }
}
