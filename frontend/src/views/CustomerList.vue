<script setup>
import CatalogManager from '../components/CatalogManager.vue'
import { customerApi } from '../api/invoices'
</script>

<template>
  <CatalogManager kind="customer" :api="customerApi" title="អតិថិជន" />
</template>
