# Player as Builder and Settlement Founder

## Direction

The player can gradually transform an unused part of the world into a functioning settlement. Building is not a separate player-only construction mode; it should connect to the same resources, NPC cooperation, work, logistics and settlement systems that operate elsewhere in Seedvale.

The player is therefore not simply building a personal base, but can become the founder of a new community.

## Building

The player should be able to prepare and develop land, including the already available garden and well mechanics, and gradually construct:

- paths and roads,
- bridges and other infrastructure,
- fences, palisades and gates,
- houses and shelters,
- storage and production buildings,
- workshops and other settlement facilities.

Construction should require real resources and should change the world in meaningful ways.

## Resources and construction

Buildings and infrastructure require materials. Construction should connect to the existing item, resource gathering, transport and storage systems rather than introducing a separate resource economy.

A construction project can progress through stages such as planning, material delivery, construction and completion.

## NPC cooperation

The player can ask NPCs to help with construction. Existing and emerging NPC helper mechanisms should be reused rather than creating a player-specific worker system.

NPCs should be able to participate through normal simulation concepts: tasks, actions, work, resource gathering and transport.

## Founding a settlement

A sufficiently developed player-built area can become a settlement or colony. It should then behave as a normal part of the world rather than as a special player base.

The settlement can develop through:

- housing,
- infrastructure,
- resource availability,
- production,
- storage,
- population,
- local needs and problems,
- relationships with other settlements.

## Inviting NPCs

The player can invite NPCs to join the settlement. Invited NPCs should become inhabitants using the same household, relationship, profession and lifecycle mechanisms as other NPCs.

The player should be able to assign roles and tasks according to the capabilities of the existing NPC simulation.

Possible roles include farming, forestry, hunting, construction, transport, crafting and defense, but the final implementation should reuse the existing profession/work/task systems.

## Long-term direction

The intended progression is:

player → construction → infrastructure → NPC cooperation → inhabitants → roles → production → settlement → growth

The resulting settlement should participate in the wider world economy and simulation. It may eventually trade, cooperate or compete with other settlements and develop its own persistent problems, needs and history.

## Design constraints

- Reuse existing world, resource, item, NPC, household, work and settlement mechanisms.
- Avoid player-only parallel systems where existing simulation concepts can be extended.
- Keep the settlement autonomous once established; it should continue operating without the player.
- Preserve deterministic simulation.
- Construction should create persistent consequences in the world.
- Design the system so that future multiplayer does not require a fundamental rewrite.
