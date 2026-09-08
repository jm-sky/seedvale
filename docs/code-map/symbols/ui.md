# Symbols

Generated from exported TypeScript symbols.

## `ui/agentStatusLabel.ts`

- `AgentLabelDom` — type — line 31
- `AgentStatusLabelController` — type — line 112
- `applyBarPercent` — function — line 83
- `computeBarPercent` — function — line 74
- `createAgentLabel` — function — line 47
- `createAgentStatusLabelController` — function — line 146
- `createLabelBar` — function — line 21
- `INITIAL_LABEL_DISTANCE_STATE` — const — line 97
- `LabelBarKind` — type — line 16
- `LabelDistanceState` — type — line 91
- `updateAgentLabelDistanceState` — function — line 220

## `ui/createBusyOverlay.ts`

- `BusyOverlay` — type — line 3
- `createBusyOverlay` — function — line 11

## `ui/createDebugGui.ts`

- `createDebugGui` — function — line 61
- `DebugGuiHandle` — type — line 48
- `DebugGuiHandlers` — type — line 20

## `ui/createHud.ts`

- `createHud` — function — line 44
- `Hud` — type — line 5

## `ui/createInventoryScreen.ts`

- `createInventoryScreen` — function — line 48
- `InventoryScreen` — type — line 28
- `InventoryScreenHandlers` — type — line 9

## `ui/createLoadingScreen.ts`

- `createLoadingScreen` — function — line 11
- `LoadingScreen` — type — line 1

## `ui/createMinimap.ts`

- `createMinimap` — function — line 19
- `Minimap` — type — line 10

## `ui/createNpcDialog.ts`

- `createNpcDialog` — function — line 18
- `NpcDialog` — type — line 5
- `NpcDialogHandlers` — type — line 3
- `NpcDialogOffer` — type — line 4

## `ui/createNpcInspector.ts`

- `createNpcInspector` — function — line 202
- `NpcInspector` — type — line 15

## `ui/createPauseMenu.ts`

- `createPauseMenu` — function — line 47
- `PauseMenu` — type — line 45
- `PauseMenuHandlers` — type — line 6

## `ui/createQuestLog.ts`

- `createQuestLog` — function — line 15
- `QuestLog` — type — line 5
- `QuestLogHandlers` — type — line 4

## `ui/createQuickActions.ts`

- `createQuickActions` — function — line 144
- `QuickActions` — type — line 135
- `QuickActionsCropSeeds` — type — line 13
- `QuickActionsHandlers` — type — line 29
- `QuickActionsTraps` — type — line 9
- `QuickActionsWorkContract` — type — line 18
- `RestOutcome` — type — line 27
- `RestVariant` — type — line 20

## `ui/createStartScreen.ts`

- `createStartScreen` — function — line 28
- `StartScreen` — type — line 11
- `StartScreenChoice` — type — line 5

## `ui/createTimeSkipOverlay.ts`

- `createTimeSkipOverlay` — function — line 13
- `TimeSkipOverlay` — type — line 3

## `ui/createToast.ts`

- `createToast` — function — line 14
- `Toast` — type — line 5
- `ToastVariant` — type — line 3

## `ui/labelDistance.ts`

- `barsVisibleForDistance` — function — line 22
- `gazeOpacityFactor` — function — line 41
- `labelOpacityForDistance` — function — line 10

## `ui/startScreenFlow.ts`

- `BootSaveListing` — type — line 16
  - domain: ui-input
  - system: start-screen
  - role: Pure boot-loop decisions for the Start Screen (plan ui-input-011 §1/§2/§9). `main.ts` keeps every side effect — IndexedDB reads/deletes, seed resolution, `createApp()` — this module only says *whether* the screen stays open and, if not, which world to build.
- `resolveStartScreenAction` — function — line 55
  - domain: ui-input
- `shouldOpenStartScreen` — function — line 28
- `StartScreenAction` — type — line 34
