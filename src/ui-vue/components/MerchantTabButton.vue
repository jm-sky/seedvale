<script setup lang="ts">
import { CheckIcon } from 'lucide-vue-next'

defineProps<{
  label: string
  active: boolean
}>()

const emit = defineEmits<{
  'click': []
}>()
</script>

<template>
  <button
    type="button"
    class="flex-1 cursor-pointer rounded-md px-2 py-1.5 text-xs flex items-center justify-center gap-2"
    :class="active ? 'bg-white/15' : 'bg-white/5 hover:bg-white/10'"
    @click="emit('click')"
  >
    <CheckIcon
      v-if="active"
      class="size-4 -ml-6"
    />
    {{ label }}
  </button>
</template>
