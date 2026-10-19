<script setup lang="ts">
import { computed } from 'vue';
import { groupKeyOf, groupTextOf } from '@/layouts/menuConfig';
import type { MenuPermission, Role } from '@/types';

const props = defineProps<{ modelValue: string[]; baseRole: Role; catalog: MenuPermission['catalog']; disabled?: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();
const visible = computed(() => props.catalog.filter(m => m.defaultRoles.includes(props.baseRole) || m.key === 'exam-messages'));
const groups = computed(() => [...new Set(visible.value.map(m => groupKeyOf(m.key)))].map(key => ({
  key, name: groupTextOf(key), items: visible.value.filter(m => groupKeyOf(m.key) === key),
})));
function toggle(key: string, value: unknown): void {
  if (props.disabled || (props.baseRole === 'admin' && props.catalog.find(item => item.key === key)?.adminRequired)) return;
  emit('update:modelValue', value ? [...new Set([...props.modelValue, key])] : props.modelValue.filter(k => k !== key));
}
</script>

<template>
  <div class="role-menu-picker">
    <div v-for="group in groups" :key="group.key" class="role-menu-picker__group">
      <div class="role-menu-picker__title">{{ group.name }}</div>
      <div class="role-menu-picker__items">
        <el-checkbox v-for="item in group.items" :key="item.key"
          :model-value="modelValue.includes(item.key) || (baseRole === 'admin' && item.adminRequired)"
          :disabled="disabled || (baseRole === 'admin' && item.adminRequired)" @change="toggle(item.key, $event)">
          {{ item.name }}<span v-if="baseRole === 'admin' && item.adminRequired">（必授）</span>
        </el-checkbox>
      </div>
    </div>
    <el-empty v-if="!visible.length" description="暂无可配置菜单" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.role-menu-picker { width: 100%; min-width: 0; }
.role-menu-picker__group { padding: 16px; border: 1px solid $border-color; border-radius: $radius-lg; background: $bg-page; }
.role-menu-picker__group + .role-menu-picker__group { margin-top: 16px; }
.role-menu-picker__title { font-size: 12px; font-weight: 600; margin-bottom: 8px; color: $text-secondary; }
.role-menu-picker__items { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 4px 16px; }
.role-menu-picker__items .el-checkbox { margin: 0; min-width: 0; height: auto; min-height: 36px; align-items: flex-start; padding-block: 8px; :deep(.el-checkbox__input) { margin-top: 4px; } :deep(.el-checkbox__label) { min-width: 0; white-space: normal; overflow-wrap: anywhere; line-height: 22px; } }
@media (max-width: 900px) { .role-menu-picker__items { grid-template-columns: minmax(0, 1fr); } .role-menu-picker__items .el-checkbox { min-height: 44px; padding-block: 11px; } }
</style>
