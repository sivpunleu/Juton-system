<script setup>
defineProps({
  rows: {
    type: Number,
    default: 5,
  },
})
</script>

<template>
  <div class="table-skeleton" aria-busy="true" aria-label="Loading">
    <div v-for="row in rows" :key="row" class="table-skeleton-row">
      <span></span>
      <span></span>
      <span></span>
      <span></span>
    </div>
  </div>
</template>
