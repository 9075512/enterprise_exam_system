<script setup lang="ts">
import AppDownloadPage from '@/views/AppDownloadPage.vue';
import DownloadAlternatives from './DownloadAlternatives.vue';
import type { DownloadDesignId } from './designs';
defineProps<{ design: DownloadDesignId }>();
</script>

<template>
  <AppDownloadPage v-if="design === 'b'" />
  <DownloadAlternatives v-else :design="design" />
</template>
