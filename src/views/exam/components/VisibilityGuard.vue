<script setup lang="ts">
/**
 * 切屏检测组件（W3-T1）。
 * 监听 document.visibilitychange：页面隐藏时记录时刻并显示遮罩，恢复可见时上报离开秒数。
 * disabled=true（如已交卷）时不记录、不上报。
 */
import { onMounted, onUnmounted, ref } from 'vue';

const props = defineProps<{ disabled?: boolean }>();
const emit = defineEmits<{ (e: 'away', seconds: number): void }>();

const hidden = ref(false);
let hiddenAt = 0;

function onVisibilityChange(): void {
  if (props.disabled) return;
  if (document.hidden) {
    hiddenAt = Date.now();
    hidden.value = true;
  } else if (hidden.value) {
    const awaySeconds = Math.max(1, Math.round((Date.now() - hiddenAt) / 1000));
    hidden.value = false;
    emit('away', awaySeconds);
  }
}

onMounted(() => document.addEventListener('visibilitychange', onVisibilityChange));
onUnmounted(() => document.removeEventListener('visibilitychange', onVisibilityChange));
</script>

<template>
  <Teleport to="body">
    <div v-if="hidden" class="visibility-mask">
      <el-alert
        class="visibility-mask__alert"
        type="warning"
        :closable="false"
        show-icon
        title="检测到您离开了考试页面，此行为已被记录"
        description="请尽快返回考试页面继续作答。"
      />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.visibility-mask {
  position: fixed;
  inset: 0;
  z-index: 3000;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 23, 42, 0.35);
  backdrop-filter: blur(2px);

  &__alert {
    width: min(520px, calc(100vw - 48px));
    border-radius: $radius-lg;
    box-shadow: $shadow-lg;
  }
}
</style>
