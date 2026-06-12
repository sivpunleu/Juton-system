<script setup>
import CatalogManager from '../components/CatalogManager.vue'
import { salespersonApi } from '../api/invoices'
</script>

<template>
  <CatalogManager
    kind="salesperson"
    :api="salespersonApi"
    title="ក្រុមការងារ Sale"
  />
</template>
