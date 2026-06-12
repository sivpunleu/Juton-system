<script setup>
import CatalogManager from '../components/CatalogManager.vue'
import { productApi } from '../api/invoices'
</script>

<template>
  <CatalogManager kind="product" :api="productApi" title="បញ្ជីទំនិញ" />
</template>
