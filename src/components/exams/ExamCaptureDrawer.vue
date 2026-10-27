<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import * as captures from '@/api/captures';
import type { CapturePage } from '@/types';
import { formatDateTime } from '@/utils/datetime';

const props = defineProps<{ modelValue: boolean; recordId: string; title?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const data = ref<CapturePage>();
const page = ref(1);
const loading = ref(false);
const failed = ref(false);
const urls = ref<Record<string, string>>({});
const imageErrors = ref<Record<string, boolean>>({});
const selected = ref<string[]>([]);
const deleting = ref(false);
const selectableIds = computed(() => data.value?.items.filter(photo => !photo.expired && photo.status !== 'deleted').map(photo => photo.id) ?? []);
const allSelected = computed(() => selectableIds.value.length > 0 && selectableIds.value.every(id => selected.value.includes(id)));
function selectAll(checked: boolean) { selected.value = checked ? [...selectableIds.value] : []; }
function selectPhoto(id: string, checked: boolean) { selected.value = checked ? [...new Set([...selected.value, id])] : selected.value.filter(value => value !== id); }
const previewUrls = computed(() => data.value?.items.map(item => urls.value[item.id]).filter((url): url is string => Boolean(url)) ?? []);
const labels: Record<string, string> = { entry: '开考拍照', periodic: '定时抓拍', resume: '恢复拍照', ready: '摄像头恢复', interrupted: '摄像头中断', unavailable: '摄像头不可用', upload_failed: '上传失败' };
let revision = 0;
function clearUrls() { Object.values(urls.value).forEach(url => URL.revokeObjectURL(url)); urls.value = {}; }
async function removePhotos(ids: string[]) {
  if (deleting.value || !ids.length || !props.modelValue) return;
  const recordId = props.recordId;
  const current = revision;
  deleting.value = true;
  try {
    await ElMessageBox.confirm(`确定删除选中的 ${ids.length} 张抓拍照片吗？图片删除后不可恢复，时间线将保留删除记录。`, '删除考试抓拍', { type: 'warning', confirmButtonText: '确认删除', cancelButtonText: '取消' });
    if (current !== revision || !props.modelValue || props.recordId !== recordId) return;
    try {
      if (ids.length === 1) await captures.remove(recordId, ids[0]!);
      else await captures.removeBatch(recordId, ids);
    } catch (error) {
      if (current === revision && props.modelValue && props.recordId === recordId) ElMessage.error(error instanceof Error ? error.message : '删除失败，请重试');
      return;
    }
    if (current !== revision || !props.modelValue || props.recordId !== recordId) return;
    selected.value = selected.value.filter(id => !ids.includes(id));
    ids.forEach(id => { if (urls.value[id]) URL.revokeObjectURL(urls.value[id]); delete urls.value[id]; });
    ElMessage.success('照片已删除，删除记录已保留');
    await load();
  } catch { /* Confirmation cancelled; keep selection. */ }
  finally { deleting.value = false; }
}
async function load() {
  const current = ++revision;
  clearUrls(); imageErrors.value = {}; data.value = undefined; failed.value = false;
  if (!props.modelValue || !props.recordId) { loading.value = false; return; }
  loading.value = true;
  const id = props.recordId;
  try {
    const result = await captures.list(id, page.value);
    if (current !== revision) return;
    data.value = result;
    selected.value = selected.value.filter(id => selectableIds.value.includes(id));
    await Promise.all(result.items.filter(item => !item.expired && item.status !== 'deleted').map(async item => {
      try {
        const blob = await captures.image(id, item.id);
        if (current === revision) urls.value[item.id] = URL.createObjectURL(blob);
      } catch { if (current === revision) imageErrors.value[item.id] = true; }
    }));
  } catch { if (current === revision) failed.value = true; }
  finally { if (current === revision) loading.value = false; }
}
watch(() => [props.modelValue, props.recordId] as const, () => { selected.value = []; page.value = 1; void load(); }, { immediate: true });
watch(page, () => { selected.value = []; void load(); });
onBeforeUnmount(() => { revision++; clearUrls(); });
</script>

<template>
  <el-drawer :model-value="modelValue" :title="title ? `${title} · 考试抓拍` : '考试抓拍'" size="min(760px, 96vw)" append-to-body destroy-on-close @update:model-value="emit('update:modelValue', $event)">
    <div class="capture-toolbar">
      <el-button :loading="loading" :disabled="deleting" @click="load">刷新记录</el-button>
      <el-checkbox :model-value="allSelected" :indeterminate="selected.length > 0 && !allSelected" :disabled="loading || deleting || !selectableIds.length" @update:model-value="selectAll(Boolean($event))">全选本页</el-checkbox>
      <el-button type="danger" :disabled="loading || deleting || !selected.length" :loading="deleting" @click="removePhotos([...selected])">删除选中（{{ selected.length }}）</el-button>
    </div>
    <p v-if="failed" role="alert">抓拍记录加载失败，请重试。</p>
    <template v-if="data">
      <p>{{ data.config.enabled ? `本次作答已开启抓拍，间隔 ${data.config.intervalMinutes} 分钟` : '本次作答未开启抓拍' }}。共 {{ data.total }} 张照片、{{ data.eventTotal }} 条状态事件。</p>
      <p v-if="!data.total">暂无抓拍照片。</p>
      <div class="capture-grid">
        <article v-for="photo in data.items" :key="photo.id" class="capture-photo">
          <el-image v-if="urls[photo.id]" :src="urls[photo.id]" :alt="`${labels[photo.kind] || photo.kind}，${formatDateTime(photo.receivedAt)}`" :preview-src-list="previewUrls" :initial-index="previewUrls.indexOf(urls[photo.id]!)" preview-teleported fit="contain" />
          <div v-else class="capture-photo__placeholder">{{ photo.status === 'deleted' ? '管理员已删除' : photo.expired ? '照片已过期' : imageErrors[photo.id] ? '照片读取失败，请刷新重试' : '正在读取照片…' }}</div>
          <strong>{{ labels[photo.kind] || photo.kind }}</strong>
          <time>{{ formatDateTime(photo.receivedAt) }}</time>
          <small>到期：{{ formatDateTime(photo.expiresAt) }}</small>
          <template v-if="photo.status === 'deleted'"><small>删除人：{{ photo.deletedBy?.name || '管理员' }}</small><small v-if="photo.deletedAt">删除时间：{{ formatDateTime(photo.deletedAt) }}</small></template>
          <div class="capture-photo__actions">
            <el-checkbox :model-value="selected.includes(photo.id)" :disabled="loading || deleting || photo.expired || photo.status === 'deleted'" :aria-label="`选择${labels[photo.kind] || photo.kind}，${formatDateTime(photo.receivedAt)}`" @update:model-value="selectPhoto(photo.id, Boolean($event))">选择</el-checkbox>
            <el-button type="danger" link :disabled="loading || deleting || photo.expired || photo.status === 'deleted'" @click="removePhotos([photo.id])">删除照片</el-button>
          </div>
        </article>
      </div>
      <h3>摄像头状态记录</h3>
      <p v-if="!data.events.length">当前页暂无状态事件。</p>
      <ol class="capture-events"><li v-for="(event, index) in data.events" :key="index"><time>{{ formatDateTime(event.receivedAt) }}</time> · {{ labels[event.status] || event.status }}<p v-if="event.reason">{{ event.reason }}</p></li></ol>
      <el-pagination v-if="Math.max(data.total, data.eventTotal) > 12" v-model:current-page="page" :disabled="deleting || loading" :page-size="12" :total="Math.max(data.total, data.eventTotal)" layout="prev, pager, next" />
    </template>
    <p v-else-if="loading" role="status">正在加载抓拍记录…</p>
  </el-drawer>
</template>

<style scoped>
.capture-toolbar, .capture-photo__actions { display: flex; align-items: center; flex-wrap: wrap; gap: 12px; }
.capture-photo__actions { justify-content: space-between; margin-top: 8px; }
.capture-photo__actions :deep(.el-button), .capture-photo__actions :deep(.el-checkbox), .capture-toolbar :deep(.el-checkbox) { min-height: 44px; }
.capture-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; }
.capture-photo { min-width: 0; padding: 12px; border: 1px solid var(--el-border-color); border-radius: 8px; }
.capture-photo :deep(.el-image), .capture-photo__placeholder { display: flex; width: 100%; aspect-ratio: 4 / 3; align-items: center; justify-content: center; background: var(--el-fill-color-light); }
.capture-photo strong, .capture-photo time, .capture-photo small { display: block; margin-top: 6px; }
.capture-photo time, .capture-photo small { font-size: 13px; color: var(--el-text-color-secondary); }
.capture-events { padding-left: 22px; line-height: 1.7; }
.capture-events li { margin-bottom: 10px; }
.capture-events p { margin: 0; }
</style>
