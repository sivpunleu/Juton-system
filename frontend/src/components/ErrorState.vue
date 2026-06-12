<script setup>
defineProps({
  message: {
    type: String,
    default: 'Unable to load data',
  },
  retryLabel: {
    type: String,
    default: 'ព្យាយាមម្ដងទៀត',
  },
  retrying: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['retry'])
</script>

<template>
  <div class="error-state" role="alert">
    <span class="error-state-icon">
      <i class="bi bi-wifi-off"></i>
    </span>
    <div class="error-state-copy">
      <strong>មានបញ្ហាក្នុងការទាញទិន្នន័យ</strong>
      <span>{{ message }}</span>
    </div>
    <button
      class="btn btn-outline-danger"
      type="button"
      :disabled="retrying"
      @click="$emit('retry')"
    >
      <span
        v-if="retrying"
        class="spinner-border spinner-border-sm me-1"
      ></span>
      <i v-else class="bi bi-arrow-clockwise me-1"></i>
      {{ retryLabel }}
    </button>
  </div>
</template>
