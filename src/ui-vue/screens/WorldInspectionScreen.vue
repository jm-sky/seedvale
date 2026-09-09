<script setup lang="ts">
import InspectionActions from '../components/inspection/InspectionActions.vue'
import InspectionHeader from '../components/inspection/InspectionHeader.vue'
import InspectionSectionBlock from '../components/inspection/InspectionSectionBlock.vue'
import UiPanel from '../components/UiPanel.vue'
import { useOverlayScreen } from '../composables/useOverlayScreen'
import { closeWorldInspection, isWorldInspectionOpen, ui } from '../store'

useOverlayScreen('world-inspection', isWorldInspectionOpen, closeWorldInspection)
</script>

<template>
  <div
    v-if="ui.worldInspection.open && ui.worldInspection.view"
    class="pointer-events-auto fixed inset-0 z-20 flex items-center justify-center bg-panel-backdrop backdrop-blur-[2px]"
    @click.self="closeWorldInspection"
  >
    <UiPanel
      class="max-w-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="world-inspection-title"
    >
      <InspectionHeader
        :title="ui.worldInspection.view.title"
        :description="ui.worldInspection.view.description"
      />
      <div class="flex flex-col gap-3">
        <InspectionSectionBlock
          v-for="section in ui.worldInspection.view.sections"
          :key="section.title"
          :title="section.title"
          :rows="section.rows"
          @fill="ui.worldInspection.onFillContainer?.($event)"
        />
      </div>
      <InspectionActions
        :actions="ui.worldInspection.view.actions"
        @run="ui.worldInspection.onAction?.($event)"
      />
      <div class="mt-3 text-[11px] opacity-60">
        Esc — zamknij
      </div>
    </UiPanel>
  </div>
</template>
