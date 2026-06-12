<script setup>
import { computed } from 'vue'
import {
  formatDate,
  formatMoney,
  invoiceStatusLabels,
  resolveInvoiceStatus,
} from '../utils/invoice'

const props = defineProps({
  invoice: {
    type: Object,
    required: true,
  },
  deleted: {
    type: Boolean,
    default: false,
  },
  canManage: {
    type: Boolean,
    default: false,
  },
})

defineEmits(['delete', 'restore'])

const resolvedStatus = computed(() => resolveInvoiceStatus(props.invoice))
</script>

<template>
  <tr>
    <td class="mobile-card-primary" data-label="វិក្កយបត្រ">
      <RouterLink
        v-if="!deleted"
        class="invoice-number"
        :to="{ name: 'invoice-preview', params: { id: invoice.id } }"
      >
        {{ invoice.invoiceNumber }}
      </RouterLink>
      <strong v-else>{{ invoice.invoiceNumber }}</strong>
      <small class="d-block text-secondary">{{ formatDate(invoice.invoiceDate) }}</small>
    </td>
    <td data-label="អតិថិជន">
      <strong>{{ invoice.customer?.name }}</strong>
      <small v-if="invoice.customer?.phone" class="d-block text-secondary">
        {{ invoice.customer.phone }}
      </small>
    </td>
    <td data-label="ប្រភពលក់">
      <span
        class="sales-source-badge"
        :class="
          invoice.salesChannel === 'salesperson'
            ? 'sales-source-person'
            : 'sales-source-store'
        "
      >
        <i
          :class="
            invoice.salesChannel === 'salesperson'
              ? 'bi bi-person-badge'
              : 'bi bi-shop'
          "
        ></i>
        {{
          invoice.salesChannel === 'salesperson'
            ? invoice.salesperson?.name || 'Sale'
            : 'នៅហាង'
        }}
      </span>
    </td>
    <td class="text-nowrap" data-label="ថ្ងៃកំណត់">{{ formatDate(invoice.dueDate) }}</td>
    <td data-label="ស្ថានភាព">
      <span class="status-pill" :class="`status-${resolvedStatus}`">
        {{ invoiceStatusLabels[resolvedStatus] || resolvedStatus }}
      </span>
    </td>
    <td class="text-end fw-bold" data-label="សរុប">{{ formatMoney(invoice.grandTotal) }}</td>
    <td class="text-end" data-label="នៅសល់">{{ formatMoney(invoice.balanceDue) }}</td>
    <td class="text-end text-nowrap mobile-card-actions" data-label="សកម្មភាព">
      <button
        v-if="deleted && canManage"
        class="btn btn-sm btn-outline-success"
        type="button"
        @click="$emit('restore', invoice)"
      >
        <i class="bi bi-arrow-counterclockwise me-1"></i> Restore
      </button>
      <template v-else>
        <RouterLink
          class="btn btn-sm btn-light action-button"
          :to="{ name: 'invoice-preview', params: { id: invoice.id } }"
          title="មើល"
          aria-label="មើលវិក្កយបត្រ"
        >
          <i class="bi bi-eye"></i>
        </RouterLink>
        <RouterLink
          v-if="canManage"
          class="btn btn-sm btn-light action-button"
          :to="{ name: 'invoice-edit', params: { id: invoice.id } }"
          title="កែប្រែ"
          aria-label="កែប្រែវិក្កយបត្រ"
        >
          <i class="bi bi-pencil"></i>
        </RouterLink>
        <button
          v-if="canManage"
          class="btn btn-sm btn-light action-button text-danger"
          type="button"
          title="លុប"
          aria-label="លុបវិក្កយបត្រ"
          @click="$emit('delete', invoice)"
        >
          <i class="bi bi-trash3"></i>
        </button>
      </template>
    </td>
  </tr>
</template>
