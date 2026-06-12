<script setup>
import { computed } from 'vue'

const props = defineProps({
  pagination: {
    type: Object,
    required: true,
  },
})

const emit = defineEmits(['change'])
const pages = computed(() => {
  const totalPages = Math.max(1, Number(props.pagination.pages || 1))
  const current = Math.max(1, Number(props.pagination.page || 1))
  const start = Math.max(1, current - 2)
  const end = Math.min(totalPages, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
})

const goTo = (page) => {
  const target = Math.min(
    Number(props.pagination.pages || 1),
    Math.max(1, Number(page)),
  )
  if (target !== props.pagination.page) emit('change', target)
}
</script>

<template>
  <div
    v-if="pagination.pages > 1"
    class="pagination-bar"
  >
    <span>
      {{ pagination.total }} records · Page {{ pagination.page }} / {{ pagination.pages }}
    </span>
    <nav aria-label="Pagination">
      <button
        class="btn btn-sm btn-light"
        type="button"
        :disabled="pagination.page <= 1"
        @click="goTo(pagination.page - 1)"
      >
        <i class="bi bi-chevron-left"></i>
      </button>
      <button
        v-for="page in pages"
        :key="page"
        class="btn btn-sm"
        :class="page === pagination.page ? 'btn-danger' : 'btn-light'"
        type="button"
        @click="goTo(page)"
      >
        {{ page }}
      </button>
      <button
        class="btn btn-sm btn-light"
        type="button"
        :disabled="pagination.page >= pagination.pages"
        @click="goTo(pagination.page + 1)"
      >
        <i class="bi bi-chevron-right"></i>
      </button>
    </nav>
  </div>
</template>
