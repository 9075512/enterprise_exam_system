<script setup lang="ts">
import { computed } from 'vue';
import { groupKeyOf, groupTextOf } from '@/layouts/menuConfig';
import type { MenuPermission, Role } from '@/types';

const props = defineProps<{ modelValue: string[]; baseRole: Role; catalog: MenuPermission['catalog'] }>();
const emit = defineEmits<{ 'update:modelValue': [value: string[]] }>();
const visible = computed(() => props.catalog.filter(m => m.defaultRoles.includes(props.baseRole) || m.key === 'exam-messages'));
const groups = computed(() => [...new Set(visible.value.map(m => groupKeyOf(m.key)))].map(key => ({
  key, name: groupTextOf(key), items: visible.value.filter(m => groupKeyOf(m.key) === key),
})));
function toggle(key: string, value: unknown): void {
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
          :disabled="baseRole === 'admin' && item.adminRequired" @change="toggle(item.key, $event)">
          {{ item.name }}<span v-if="baseRole === 'admin' && item.adminRequired">（必授）</span>
        </el-checkbox>
      </div>
    </div>
    <el-empty v-if="!visible.length" description="暂无可配置菜单" />
  </div>
</template>

<style scoped lang="scss">
.role-menu-picker__group + .role-menu-picker__group { margin-top: 16px; }
.role-menu-picker__title { font-weight: 600; margin-bottom: 6px; }
.role-menu-picker__items { display: flex; flex-wrap: wrap; gap: 4px 20px; }
.role-menu-picker__items .el-checkbox { margin-right: 0; }
</style>
