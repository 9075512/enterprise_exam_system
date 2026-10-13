<script setup lang="ts">
/**
 * 图形验证码（v1.7③ T1）。
 * 通过 `v-model` 向父组件回传 captchaId；父组件可用模板 ref 调 `refresh()` 换一张。
 */
import { onMounted, ref } from 'vue';
import { Refresh } from '@element-plus/icons-vue';
import * as authApi from '@/api/auth';

defineProps<{ modelValue: string }>();
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>();

const image = ref('');
const loading = ref(false);

/** 拉取一张新验证码。 */
async function refresh(): Promise<void> {
  loading.value = true;
  try {
    const res = await authApi.fetchCaptcha();
    image.value = res.image;
    emit('update:modelValue', res.captchaId);
  } catch {
    image.value = '';
    emit('update:modelValue', '');
  } finally {
    loading.value = false;
  }
}

defineExpose({ refresh });
onMounted(() => void refresh());
</script>

<template>
  <div class="captcha" role="img" aria-label="图形验证码">
    <img v-if="image" class="captcha__img" :src="image" alt="图形验证码" @click="refresh" />
    <span v-else class="captcha__placeholder">{{ loading ? '加载中…' : '点击刷新' }}</span>
    <el-button class="captcha__refresh" text :icon="Refresh" :loading="loading" @click="refresh">
      换一张
    </el-button>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.captcha {
  display: flex;
  align-items: center;
  gap: 8px;

  &__img {
    height: 40px;
    width: 128px;
    border: 1px solid $border-color;
    border-radius: $radius-sm;
    cursor: pointer;
    background: #fff;
  }

  &__placeholder {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    height: 40px;
    width: 128px;
    font-size: 12.5px;
    color: $text-secondary;
    border: 1px dashed $border-color;
    border-radius: $radius-sm;
  }

  &__refresh {
    padding: 4px 6px;
  }
}
</style>
