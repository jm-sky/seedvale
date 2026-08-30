# Physical Resource Storage & Logistics

## Goal

Replace the abstract household and settlement `food` resource with dedicated food `ItemKind` storage, introduce physically separated storage places for different resource categories, connect NPC delivery to the correct destination, and make stored resources visible in the world.

The implementation should reuse the existing inventory, economy, settlement, household and local-resource-exchange mechanisms rather than introducing parallel storage or logistics systems.

## Target model

### Household

- Wood remains a resource-level stock where the existing economy requires it.
- Food is represented by concrete `ItemKind` values already present in the item system, such as carrot, cabbage, potato, tomato, fish and other food items.
- The existing inventory mechanism remains the source of truth for concrete food items.
- The abstract household `food` stock should be removed once all consumers and producers have migrated.

### Settlement

Settlement-level food should likewise use concrete food `ItemKind` values rather than an abstract `food` quantity.

Existing economic resources such as wood should remain compatible with the economy model where appropriate. The implementation must preserve the distinction between economic resources and concrete item instances.

## Physical storage

Households and settlements should have distinct world storage places for at least:

- Wood Storage
- Food Storage

The storage place is a world destination, not a second copy of the stored state.

NPCs carrying:

- wood → deliver to Wood Storage
- food items → deliver to Food Storage

Existing local resource exchange and logistics should be extended rather than replaced.

## Physical visualization

Once the storage model and logistics are correct, storage contents should be represented visually in the world.

### Wood

Wood storage should have quantity-dependent visual states, for example:

- 0: no wood
- 1–3: small pile
- 4–7: larger pile
- 8–12: medium pile
- 13–20: large pile
- above the capacity of one pile: additional pile/segment

### Food

Food storage should visually represent concrete food types rather than an abstract food value.

Initial examples:

- carrots
- cabbage
- potatoes
- tomatoes
- fish

The visual representation may use quantity levels rather than rendering every individual item.

## Implementation order

The work is intentionally divided into a small number of large implementation contexts to minimize Claude Code cost and context overhead.

1. **Food / Item Storage Model**
   - Migrate household and settlement food from abstract `food` to concrete food `ItemKind`.
   - Update needs, consumption, production, exchange and tests.
   - Reuse the existing inventory and item-category mechanisms.

2. **Typed Storage & Logistics**
   - Introduce distinct wood and food storage destinations.
   - Connect existing NPC delivery/local exchange to the correct storage.
   - Cover both household and settlement storage.
   - Preserve existing logistics mechanisms.

3. **Physical Storage Visualization**
   - Add world storage props/models.
   - Visualize wood quantity through pile states.
   - Visualize concrete food contents.
   - Update visuals from authoritative storage state.
   - Verify Three.js/browser behaviour and performance.

## Architectural constraints

- Do not create a parallel inventory or storage system for visualization.
- Do not keep duplicate authoritative food quantities.
- Do not replace the existing local-resource-exchange mechanism with a separate logistics system.
- Storage visuals are derived state only.
- Concrete food remains represented by existing `ItemKind` values.
- Preserve deterministic simulation and off-screen/world independence.
- Prefer existing settlement places, props, inventory and navigation mechanisms.
- Keep storage updates event-driven or low-frequency rather than per-frame where practical.

## Dependencies

The implementation builds on existing household resources, local resource exchange, item/inventory systems, food production and fauna food production.

Relevant existing work includes:

- Household resources
- Local resource exchange
- Livestock food production
- Crop planting/harvesting
- Existing settlement stockpile/place infrastructure

The implementation plans must audit the current code before changing these systems because repository code is the source of truth.

## Planned implementation plans

The detailed implementation should be delivered as three plans:

1. Food / Item Storage Model
2. Typed Storage & Logistics
3. Physical Storage Visualization

Each plan should be implementation-oriented, independently verifiable, and sized as a practical Claude Code context.

