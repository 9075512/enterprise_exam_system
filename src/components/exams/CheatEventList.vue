<script setup lang="ts">
import type { CheatEvent } from '@/types';
import { formatDateTime } from '@/utils/datetime';
defineProps<{ events: CheatEvent[] }>();
</script>
<template><ol class="cheat-event-list" aria-label="切屏事件时间线"><li v-for="(event,index) in events" :key="index"><span class="cheat-event-list__index">{{ index + 1 }}</span><div><time>{{ formatDateTime(event.at) }}</time><p>离开时长 <strong>{{ event.awaySeconds }}</strong> 秒</p></div></li></ol><p v-if="!events.length" class="cheat-event-list__empty">该记录暂无切屏事件</p></template>
<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.cheat-event-list { display: grid; gap: 12px; list-style: none; margin: 0; padding: 0; li { display: flex; align-items: flex-start; gap: 12px; min-width: 0; padding: 16px; background: $bg-paper; border: 1px solid $border-color; border-radius: $radius-lg; } &__index { flex: 0 0 28px; text-align: center; color: $color-primary; background: $color-primary-soft; border-radius: $radius-sm; } li>div { min-width: 0; overflow-wrap: anywhere; } time { font-variant-numeric: tabular-nums; } p { margin: 6px 0 0; color: $text-secondary; } &__empty { color: $text-secondary; } }
</style>
