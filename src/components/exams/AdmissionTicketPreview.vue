<script setup lang="ts">
import { computed, ref, toRef, watch } from 'vue';
import { ArrowLeft, ArrowRight, Calendar, Clock, Download, Tickets, User } from '@element-plus/icons-vue';
import { participantsApi } from '@/api/coreFeatures';
import { useRequest } from '@/composables/useRequest';
import { formatDateTime } from '@/utils/datetime';
import RequestError from '@/components/common/RequestError.vue';
import EmptyState from '@/components/common/EmptyState.vue';

const props = withDefaults(defineProps<{
  modelValue: boolean;
  exam: { id: string; name: string } | null;
  batch?: boolean;
}>(), { batch: false });
const emit = defineEmits<{ 'update:modelValue': [value: boolean] }>();
const visible = toRef(props, 'modelValue');
const exam = toRef(props, 'exam');
const { data: tickets, loading, error, refresh } = useRequest(
  () => visible.value && exam.value ? participantsApi.tickets(exam.value.id) : Promise.resolve([]),
  [visible, exam], { keepPreviousData: false },
);
const selectedUserId = ref('');
const downloading = ref(false);
const downloadError = ref('');
const index = computed(() => (tickets.value ?? []).findIndex(ticket => ticket.userId === selectedUserId.value));
const currentTicket = computed(() => tickets.value?.[index.value] ?? null);
watch(tickets, value => { selectedUserId.value = value?.[0]?.userId ?? ''; });
watch([visible, exam], () => { downloadError.value = ''; });

function move(offset: number): void {
  const ticket = tickets.value?.[index.value + offset];
  if (ticket) selectedUserId.value = ticket.userId;
}
function close(): void {
  if (!downloading.value) emit('update:modelValue', false);
}
async function download(): Promise<void> {
  if (downloading.value || loading.value || error.value || !currentTicket.value || !exam.value) return;
  downloading.value = true;
  downloadError.value = '';
  const currentExam = exam.value;
  let url = '';
  try {
    const blob = await participantsApi.ticketsPdf(currentExam.id);
    url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${currentExam.name.replace(/[\\/:*?"<>|]/g, '_')}-准考证.pdf`;
    document.body.appendChild(anchor);
    try { anchor.click(); } finally { anchor.remove(); }
  } catch {
    downloadError.value = '准考证下载失败，请重试。预览信息已保留。';
  } finally {
    // 给浏览器与移动端文件保存器留出读取 Blob 的时间。
    if (url) setTimeout(() => URL.revokeObjectURL(url), 1000);
    downloading.value = false;
  }
}
</script>

<template>
  <el-dialog
    :model-value="modelValue" title="准考证预览" width="860px" top="5vh"
    class="admission-preview" append-to-body destroy-on-close
    :close-on-click-modal="!downloading" :close-on-press-escape="!downloading" :show-close="!downloading"
    @update:model-value="value => { if (!value) close(); }"
  >
    <template #header="{ titleId }">
      <div class="admission-preview__heading">
        <span class="admission-preview__heading-icon" aria-hidden="true"><el-icon><Tickets /></el-icon></span>
        <div><h2 :id="titleId">准考证预览</h2><p>核对考试与考生信息后，下载 PDF 保存</p></div>
      </div>
    </template>

    <div v-if="loading" class="admission-preview__state" role="status" aria-live="polite" aria-busy="true">
      <el-skeleton :rows="7" animated /><p>正在加载准考证…</p>
    </div>
    <RequestError v-else-if="error" text="准考证加载失败，请重新加载" @retry="refresh" />
    <EmptyState v-else-if="!tickets?.length" text="该考试暂无可用准考证" />
    <template v-else>
      <div v-if="batch" class="admission-preview__toolbar">
        <div class="admission-preview__picker">
          <label for="admission-ticket-person">查看考生</label>
          <el-select id="admission-ticket-person" v-model="selectedUserId" filterable placeholder="搜索姓名、账号或准考证号" aria-label="搜索并选择考生" :disabled="downloading">
            <el-option v-for="ticket in tickets" :key="ticket.userId" :value="ticket.userId" :label="`${ticket.userName} · ${ticket.username} · ${ticket.admissionNo}`" />
          </el-select>
        </div>
        <div class="admission-preview__pagination" aria-label="准考证翻页">
          <el-button :icon="ArrowLeft" aria-label="上一张准考证" :disabled="index <= 0 || downloading" @click="move(-1)" />
          <span aria-live="polite">{{ index + 1 }} / {{ tickets.length }}</span>
          <el-button :icon="ArrowRight" aria-label="下一张准考证" :disabled="index >= tickets.length - 1 || downloading" @click="move(1)" />
        </div>
      </div>

      <div v-if="currentTicket" class="admission-preview__canvas">
        <article class="admission-ticket" aria-label="准考证信息">
          <header class="admission-ticket__header">
            <div class="admission-ticket__eyebrow"><span>考试准考证</span><span lang="en">ADMISSION TICKET</span></div>
            <h3>{{ currentTicket.examName }}</h3>
            <span class="admission-ticket__mode">{{ currentTicket.examMode === 'open' ? '开卷考试' : '闭卷考试' }}</span>
          </header>
          <div class="admission-ticket__number"><span>准考证号</span><strong>{{ currentTicket.admissionNo || '—' }}</strong></div>
          <section class="admission-ticket__section">
            <h4><el-icon aria-hidden="true"><User /></el-icon>考生信息</h4>
            <dl class="admission-ticket__identity">
              <div><dt>考生姓名</dt><dd class="admission-ticket__name">{{ currentTicket.userName || '—' }}</dd></div>
              <div><dt>登录账号</dt><dd>{{ currentTicket.username || '—' }}</dd></div>
              <div class="admission-ticket__department"><dt>所属科室</dt><dd>{{ currentTicket.departmentName || '—' }}</dd></div>
            </dl>
          </section>
          <section class="admission-ticket__section admission-ticket__schedule">
            <h4><el-icon aria-hidden="true"><Calendar /></el-icon>考试安排</h4>
            <dl class="admission-ticket__times">
              <div><dt>开始时间</dt><dd>{{ formatDateTime(currentTicket.startTime) }}</dd></div>
              <div><dt>结束时间</dt><dd>{{ formatDateTime(currentTicket.endTime) }}</dd></div>
            </dl>
            <div class="admission-ticket__duration"><el-icon aria-hidden="true"><Clock /></el-icon>答题时长 <strong>{{ currentTicket.durationMinutes }} 分钟</strong></div>
          </section>
          <footer class="admission-ticket__notice"><strong>温馨提示</strong><p>请核对姓名、账号及准考证号，并在考试时间窗内进入考试。答题时长以考试安排为准，请提前做好准备。</p></footer>
        </article>
      </div>
    </template>

    <template #footer>
      <p v-if="downloadError" class="admission-preview__error" role="alert">{{ downloadError }}</p>
      <div class="admission-preview__footer">
        <p>{{ batch && tickets?.length && !loading && !error ? `PDF 包含本场全部 ${tickets.length} 位考生的准考证信息` : '请妥善保管准考证，避免泄露个人信息' }}</p>
        <div class="admission-preview__actions">
          <el-button :disabled="downloading" @click="close">关闭</el-button>
          <el-button type="primary" :icon="Download" :loading="downloading" :disabled="loading || !!error || !currentTicket" @click="download">
            {{ downloading ? '正在生成 PDF…' : batch ? '下载全部 PDF' : '下载准考证 PDF' }}
          </el-button>
        </div>
      </div>
    </template>
  </el-dialog>
</template>

<style lang="scss">
@use '@/styles/variables.scss' as *;

.admission-preview.el-dialog.el-dialog {
  padding: 0;
  max-height: 90dvh;
  .el-dialog__body { padding: 0; background: $bg-page; }
  .el-dialog__header { margin: 0; }
  .el-dialog__footer { text-align: left; }
}
.admission-preview {
  &__heading { display: flex; align-items: center; gap: 12px; padding-right: 12px; }
  &__heading-icon { width: 44px; height: 44px; flex-shrink: 0; display: grid; place-items: center; color: $color-primary; background: $color-primary-soft; border: 1px solid $color-primary-border; border-radius: 12px; font-size: 23px; }
  &__heading h2 { margin: 0 0 4px; font-size: 19px; line-height: 1.4; color: $text-primary; }
  &__heading p { margin: 0; font-size: 13px; line-height: 1.5; color: $text-secondary; }
  &__toolbar { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 16px 28px; background: $bg-paper; border-bottom: 1px solid $border-color; }
  &__picker { flex: 1; min-width: 0; display: flex; align-items: center; gap: 12px; label { flex-shrink: 0; font-size: 13px; color: $text-secondary; } .el-select { width: 100%; max-width: 390px; min-width: 0; } }
  &__pagination { display: flex; align-items: center; gap: 10px; flex-shrink: 0; font-size: 13px; color: $text-secondary; font-variant-numeric: tabular-nums; .el-button { margin: 0; width: 36px; padding: 0; } }
  &__canvas { padding: 28px 48px; }
  &__state { padding: 40px; p { text-align: center; color: $text-secondary; } }
  &__footer { width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 16px; > p { margin: 0; font-size: 12px; line-height: 1.7; color: $text-secondary; } }
  &__actions { display: flex; gap: 10px; flex-shrink: 0; .el-button.el-button { min-height: 40px; margin: 0; } }
  &__error { width: 100%; margin: 0 0 12px; color: $color-error-text; line-height: 1.6; font-size: 13px; }
}
.admission-ticket {
  overflow: hidden; background: $bg-paper; color: $text-primary; border: 1px solid #dce4ef; border-top: 4px solid $color-primary; border-radius: 12px; box-shadow: 0 8px 28px rgba(23, 35, 56, .06); overflow-wrap: anywhere;
  &__header { position: relative; padding: 26px 30px 24px; background: linear-gradient(120deg, #f0f5ff, #fff 85%); h3 { margin: 16px 0 12px; font-size: 23px; line-height: 1.55; letter-spacing: .3px; } }
  &__eyebrow { display: flex; justify-content: space-between; align-items: center; gap: 12px; color: $color-primary; font-size: 13px; font-weight: 600; [lang] { font-size: 10px; letter-spacing: 1.8px; color: $text-secondary; } }
  &__mode { display: inline-block; padding: 4px 10px; border: 1px solid $color-primary-border; border-radius: 6px; color: $color-primary; background: $color-primary-soft; font-size: 12px; }
  &__number { padding: 17px 30px; display: flex; align-items: center; gap: 18px; background: #1e3559; color: #fff; > span { font-size: 12px; color: #c6d5ee; flex-shrink: 0; } strong { font: 600 19px/1.6 ui-monospace, 'SFMono-Regular', Consolas, monospace; letter-spacing: 1.3px; min-width: 0; } }
  &__section { padding: 22px 30px; h4 { display: flex; gap: 8px; align-items: center; margin: 0 0 18px; font-size: 14px; .el-icon { color: $color-primary; font-size: 17px; } } dl { display: grid; gap: 18px 24px; grid-template-columns: repeat(2, minmax(0, 1fr)); margin: 0; } dt { margin-bottom: 7px; font-size: 12px; color: $text-secondary; } dd { margin: 0; font-size: 14px; line-height: 1.6; } }
  &__identity .admission-ticket__name { font-size: 19px; font-weight: 600; }
  &__department { grid-column: 1 / -1; }
  &__schedule { border-top: 1px dashed #dce4ef; }
  &__times dd { font-variant-numeric: tabular-nums; }
  &__duration { display: flex; align-items: center; gap: 8px; margin-top: 18px; padding: 10px 14px; border-radius: 6px; background: $color-primary-soft; font-size: 12px; color: $text-secondary; strong { color: $color-primary; font-size: 14px; } }
  &__notice { margin: 0 30px 24px; padding: 16px 0 0; border-top: 1px solid $border-color; font-size: 12px; line-height: 1.8; color: $text-secondary; strong { font-weight: 500; color: $text-body; } p { margin: 4px 0 0; } }
}
@media (max-width: 600px) {
  .admission-preview.el-dialog.el-dialog { width: 100%; max-width: 100%; height: 100dvh; max-height: 100dvh; margin: 0 !important; border: 0; border-radius: 0;
    .el-dialog__header { padding: 18px 48px 18px 16px; }
    .el-dialog__body { flex: 1; padding: 0; }
    .el-dialog__footer { padding: 12px 16px calc(12px + env(safe-area-inset-bottom)); }
  }
  .admission-preview {
    &__heading-icon { width: 38px; height: 38px; font-size: 21px; }
    &__heading { gap: 10px; padding: 0; h2 { font-size: 17px; } p { font-size: 12px; } }
    &__toolbar { padding: 14px 16px; flex-wrap: wrap; gap: 12px; }
    &__picker { width: 100%; flex-basis: 100%; flex-direction: column; align-items: stretch; gap: 8px; .el-select { max-width: none; } }
    &__pagination { width: 100%; justify-content: space-between; .el-button { width: 44px; min-height: 44px; } }
    &__canvas { padding: 16px 12px; }
    &__footer { align-items: stretch; flex-direction: column; gap: 10px; }
    &__actions { display: grid; grid-template-columns: 1fr 2fr; .el-button.el-button { min-height: 44px; padding: 10px 8px; } }
  }
  .admission-ticket {
    &__header { padding: 20px; h3 { font-size: 20px; margin-top: 14px; } }
    &__eyebrow { flex-wrap: wrap; gap: 6px; [lang] { font-size: 9px; letter-spacing: 1px; } }
    &__number { padding: 14px 20px; flex-direction: column; align-items: flex-start; gap: 4px; strong { font-size: 17px; } }
    &__section { padding: 20px; dl { gap: 16px; grid-template-columns: minmax(0, 1fr); } }
    &__notice { margin: 0 20px 20px; }
  }
}
</style>
