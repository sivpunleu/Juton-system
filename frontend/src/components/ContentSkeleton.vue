<script setup>
defineProps({
  cards: {
    type: Number,
    default: 2,
  },
})
</script>

<template>
  <div class="content-skeleton" aria-busy="true" aria-label="Loading content">
    <div class="content-skeleton-heading">
      <span></span>
      <span></span>
    </div>
    <div class="content-skeleton-grid">
      <div
        v-for="card in cards"
        :key="card"
        class="content-skeleton-card"
      >
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </div>
    </div>
  </div>
</template>
