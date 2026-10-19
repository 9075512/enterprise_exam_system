<script setup lang="ts">
/**
 * 考试设置表单，与题目配置页共用一个最终提交动作。
 * 提交前把本地时间字符串转为 ISO 8601（后端 DATETIME(3)）。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import dayjs from 'dayjs';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import * as usersApi from '@/api/users';
import { useSettingsStore } from '@/stores/settings';
import { validateAndFocus } from '@/composables/useFormFocus';
import { buildDepartmentTree } from '@/utils/departmentTree';
import type { Department, Exam, ExamMode, User } from '@/types';

const props = defineProps<{
  exam?: Exam | null;
  departments: Department[];
  disabled?: boolean;
}>();

const departmentTree = computed(() => buildDepartmentTree(props.departments));
const loading = ref(true);
const loadFailed = ref(false);
const authors = ref<User[]>([]);
const settingsStore = useSettingsStore();

const LOCAL_FORMAT = 'YYYY-MM-DD HH:mm:ss';

const formRef = ref<FormInstance>();
const examinees = ref<User[]>([]);
const form = reactive({
  name: '',
  authorIds: [] as string[],
  departmentIds: [] as string[],
  includeUserIds: [] as string[],
  excludeUserIds: [] as string[],
  startTime: '',
  endTime: '',
  durationMinutes: 60,
  passScore: 60,
  maxAttempts: 1,
  examMode: 'closed' as ExamMode,
});

/** 人手一卷 / 选项乱序 / 补考申请 / 成绩复核：三态（inherit=跟随全局默认，on=开启，off=关闭） */
type TriState = 'inherit' | 'on' | 'off';
const ruleOptions = [{ value: 'inherit', label: '跟随全局默认' }, { value: 'on', label: '开启' }, { value: 'off', label: '关闭' }];
const shuffleMode = ref<TriState>('inherit');
const shuffleOptionsMode = ref<TriState>('inherit');
const allowRetakeMode = ref<TriState>('inherit');
const allowAppealMode = ref<TriState>('inherit');

/** boolean|null → TriState */
function toTri(v: boolean | null | undefined): TriState {
  if (v === null || v === undefined) return 'inherit';
  return v ? 'on' : 'off';
}

const rules: FormRules = {
  name: [{ required: true, message: '请输入考试名称', trigger: 'blur' }],
  startTime: [{ required: true, message: '请选择开始时间', trigger: 'change' }],
  endTime: [{ required: true, message: '请选择截止时间', trigger: 'change' }],
};

function resetForm(): void {
  const exam = props.exam;
  if (exam) {
    form.name = exam.name;
    form.authorIds = (exam.authors ?? []).map(a => a.id);
    form.departmentIds = [...exam.departmentIds];
    form.includeUserIds = [...exam.includeUserIds];
    form.excludeUserIds = [...exam.excludeUserIds];
    form.startTime = dayjs(exam.startTime).format(LOCAL_FORMAT);
    form.endTime = dayjs(exam.endTime).format(LOCAL_FORMAT);
    form.durationMinutes = exam.durationMinutes;
    form.passScore = exam.passScore;
    form.maxAttempts = exam.maxAttempts;
    form.examMode = exam.examMode ?? 'closed';
    shuffleMode.value = toTri(exam.shuffleEnabled);
    shuffleOptionsMode.value = toTri(exam.shuffleOptions);
    allowRetakeMode.value = toTri(exam.allowRetake);
    allowAppealMode.value = toTri(exam.allowAppeal);
  } else {
    form.name = '';
    form.authorIds = [];
    form.departmentIds = [];
    form.includeUserIds = [];
    form.excludeUserIds = [];
    form.startTime = '';
    form.endTime = '';
    form.durationMinutes = settingsStore.settings.examDefaultDuration;
    form.passScore = settingsStore.settings.examDefaultPassScore;
    form.maxAttempts = settingsStore.settings.examDefaultMaxAttempts;
    form.examMode = 'closed';
    shuffleMode.value = 'inherit';
    shuffleOptionsMode.value = 'inherit';
    allowRetakeMode.value = 'inherit';
    allowAppealMode.value = 'inherit';
  }
}

async function load(): Promise<void> {
  loading.value = true;
  loadFailed.value = false;
  try {
    await settingsStore.load();
    resetForm();
    const [u, a] = await Promise.all([usersApi.list({ role: 'examinee' }), usersApi.list({ role: 'author' })]);
    examinees.value = u; authors.value = a.filter(user => user.status === 'active');
  } catch { loadFailed.value = true; }
  finally { loading.value = false; }
}
onMounted(load);

async function validate(): Promise<boolean> {
  if (!formRef.value || loading.value || loadFailed.value) return false;
  const valid = await validateAndFocus(formRef.value);
  if (!valid) return false;
  if (!form.departmentIds.length && !form.includeUserIds.length) {
    ElMessage.warning('请至少选择参与科室或指定人员');
    return false;
  }

  const start = new Date(form.startTime).getTime();
  const end = new Date(form.endTime).getTime();
  if (!(end > start)) {
    ElMessage.error('截止时间必须晚于开始时间');
    return false;
  }

  return true;
}

function getPayload() {
  return {
      name: form.name.trim(),
      authorIds: [...form.authorIds],
      departmentIds: [...form.departmentIds],
      includeUserIds: [...form.includeUserIds],
      excludeUserIds: [...form.excludeUserIds],
      startTime: props.exam?.questionsLocked ? props.exam.startTime : new Date(form.startTime).toISOString(),
      endTime: new Date(form.endTime).toISOString(),
      durationMinutes: form.durationMinutes,
      passScore: form.passScore,
      maxAttempts: form.maxAttempts,
      examMode: form.examMode,
      shuffleEnabled: shuffleMode.value === 'inherit' ? null : shuffleMode.value === 'on',
      shuffleOptions: shuffleOptionsMode.value === 'inherit' ? null : shuffleOptionsMode.value === 'on',
      allowRetake: allowRetakeMode.value === 'inherit' ? null : allowRetakeMode.value === 'on',
      allowAppeal: allowAppealMode.value === 'inherit' ? null : allowAppealMode.value === 'on',
    };
}

defineExpose({ validate, getPayload, form });
</script>

<template>
  <div v-loading="loading" class="exam-settings">
    <el-alert v-if="loadFailed" title="人员数据加载失败，请重试后继续" type="error" :closable="false"><el-button @click="load">重试</el-button></el-alert>
    <el-form v-if="!loading && !loadFailed" ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="disabled">
      <section class="settings-section" aria-labelledby="exam-basic-heading">
        <header class="settings-section__head">
          <span class="settings-section__number">01</span>
          <div><h3 id="exam-basic-heading">基本信息</h3><p>设置考试名称，安排出题工作。</p></div>
        </header>
        <el-form-item label="考试名称" prop="name">
          <el-input v-model="form.name" maxlength="120" show-word-limit placeholder="如：安全知识月考" />
        </el-form-item>
        <div class="settings-grid">
          <el-form-item label="指定出题人">
            <el-select v-model="form.authorIds" multiple filterable clearable class="exam-form__full" placeholder="可选，指定题目维护人员">
              <el-option v-for="user in authors" :key="user.id" :label="user.name + '（' + user.username + '）'" :value="user.id" />
            </el-select>
          </el-form-item>
          <el-form-item label="考试形式">
            <el-radio-group v-model="form.examMode" aria-label="考试形式"><el-radio value="closed">闭卷</el-radio><el-radio value="open">开卷</el-radio></el-radio-group>
          </el-form-item>
        </div>
      </section>

      <section class="settings-section" aria-labelledby="exam-schedule-heading">
        <header class="settings-section__head">
          <span class="settings-section__number">02</span>
          <div><h3 id="exam-schedule-heading">考试安排</h3><p>考生可在指定时间范围内进入考试。</p></div>
        </header>
        <div class="settings-grid">
          <el-form-item label="开始时间" prop="startTime">
            <el-date-picker v-model="form.startTime" :disabled="exam?.questionsLocked" type="datetime" popper-class="exam-schedule-picker" class="exam-form__full" placeholder="选择开始时间" value-format="YYYY-MM-DD HH:mm:ss" />
          </el-form-item>
          <el-form-item label="截止时间" prop="endTime">
            <el-date-picker v-model="form.endTime" type="datetime" popper-class="exam-schedule-picker" class="exam-form__full" placeholder="选择截止时间" value-format="YYYY-MM-DD HH:mm:ss" />
          </el-form-item>
        </div>
        <div class="settings-grid settings-grid--three">
          <el-form-item label="考试时长（分钟）"><el-input-number v-model="form.durationMinutes" :min="1" :max="600" /></el-form-item>
          <el-form-item label="及格分数线"><el-input-number v-model="form.passScore" :min="1" :max="1000" :step="1" /></el-form-item>
          <el-form-item label="答题次数（每人最多）" prop="maxAttempts"><el-input-number v-model="form.maxAttempts" :min="1" :max="10" /></el-form-item>
        </div>
        <p v-if="exam?.questionsLocked" class="settings-section__note">考试已开始或已有作答，开始时间与题目配置已锁定。</p>
      </section>

      <section class="settings-section" aria-labelledby="exam-audience-heading">
        <header class="settings-section__head">
          <span class="settings-section__number">03</span>
          <div><h3 id="exam-audience-heading">参与人员</h3><p>按科室选择范围，也可单独加入、排除人员。</p></div>
        </header>
        <div class="settings-grid">
          <el-form-item label="参与科室（可多选）" prop="departmentIds">
            <el-tree-select v-model="form.departmentIds" :data="departmentTree" class="exam-form__full" multiple show-checkbox check-strictly :render-after-expand="false" default-expand-all placeholder="请选择参与科室" />
            <span class="exam-form__hint">选择上级科室，自动覆盖其下级科室。</span>
          </el-form-item>
          <el-form-item label="指定加入人员">
            <el-select v-model="form.includeUserIds" multiple filterable class="exam-form__full" placeholder="可与科室叠加"><el-option v-for="u in examinees" :key="u.id" :label="u.name + '（' + u.username + '）'" :value="u.id" /></el-select>
          </el-form-item>
          <el-form-item label="指定排除人员">
            <el-select v-model="form.excludeUserIds" multiple filterable class="exam-form__full" placeholder="从参与范围中排除"><el-option v-for="u in examinees" :key="u.id" :label="u.name + '（' + u.username + '）'" :value="u.id" /></el-select>
          </el-form-item>
        </div>
        <p class="settings-section__note">保存后确定参与名单，排除人员优先；已有作答时只能追加人员。</p>
      </section>

      <details class="settings-section settings-section--advanced" :open="Boolean(exam && [exam.shuffleEnabled, exam.shuffleOptions, exam.allowRetake, exam.allowAppeal].some(v => v != null))">
        <summary><span class="settings-section__number">04</span><span class="settings-section__summary"><strong>更多考试规则</strong><span>题目乱序、选项乱序、补考与成绩复核</span></span><span class="settings-section__expand">展开设置</span></summary>
        <div class="settings-grid settings-section__rules">
          <el-form-item label="人手一卷"><el-select v-model="shuffleMode" class="exam-form__full"><el-option v-for="o in ruleOptions" :key="o.value" :label="o.label" :value="o.value" /></el-select><span class="exam-form__hint">开启后，每位考生的题目顺序随机。</span></el-form-item>
          <el-form-item label="选项乱序"><el-select v-model="shuffleOptionsMode" class="exam-form__full"><el-option v-for="o in ruleOptions" :key="o.value" :label="o.label" :value="o.value" /></el-select><span class="exam-form__hint">在人手一卷开启时，进一步打乱选项。</span></el-form-item>
          <el-form-item label="补考申请"><el-select v-model="allowRetakeMode" class="exam-form__full"><el-option v-for="o in ruleOptions" :key="o.value" :label="o.label" :value="o.value" /></el-select><span class="exam-form__hint">不及格且次数用尽后，可申请补考。</span></el-form-item>
          <el-form-item label="成绩复核"><el-select v-model="allowAppealMode" class="exam-form__full"><el-option v-for="o in ruleOptions" :key="o.value" :label="o.label" :value="o.value" /></el-select><span class="exam-form__hint">允许考生在规定时限内申请成绩复核。</span></el-form-item>
        </div>
      </details>
    </el-form>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.exam-settings { min-width: 0; min-height: 160px; container-type: inline-size; }
.settings-section {
  margin-bottom: 16px;
  padding: 24px;
  background: $bg-paper;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  &:last-child { margin-bottom: 0; }
  &__head { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 22px; }
  &__number { display: grid; place-items: center; flex-shrink: 0; width: 32px; height: 32px; border-radius: $radius-sm; background: $color-primary-soft; color: $color-primary-dark; font-size: 12px; font-weight: 700; font-variant-numeric: tabular-nums; }
  h3 { margin: 0; font-size: 15px; line-height: 24px; color: $text-primary; }
  &__head p { margin: 2px 0 0; font-size: 12px; line-height: 1.6; color: $text-secondary; }
  &__note { margin: 0; padding-top: 4px; font-size: 12px; line-height: 1.7; color: $text-secondary; }
  :deep(.el-form-item) { margin-bottom: 20px; min-width: 0; }
  :deep(.el-form-item__label) { color: $text-body; font-size: 13px; }
  :deep(.el-input-number), :deep(.el-date-editor.el-input) { width: 100%; }
  summary { display: flex; align-items: center; gap: 12px; cursor: pointer; list-style: none; }
  summary::-webkit-details-marker { display: none; }
  summary::after { content: '+'; color: $text-secondary; font-size: 20px; }
  &[open] summary::after { content: '−'; }
  &__summary { display: grid; gap: 4px; min-width: 0; strong { font-size: 14px; color: $text-primary; } span { font-size: 12px; color: $text-secondary; } }
  &__expand { margin-left: auto; white-space: nowrap; font-size: 12px; color: $text-secondary; }
  &[open] .settings-section__expand { visibility: hidden; }
  &__rules { margin-top: 24px; }
}
.settings-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 20px; &--three { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.exam-form__full { width: 100%; }
.exam-form__hint { display: block; width: 100%; margin-top: 6px; font-size: 12px; line-height: 1.6; color: $text-secondary; }
@container (max-width: 520px) { .settings-grid { grid-template-columns: minmax(0, 1fr); } .settings-section { padding: 18px; } .settings-section__expand { display: none; } }
@media (max-width: 900px) { .settings-section :deep(.el-radio) { min-height: 44px; height: auto; } .settings-section summary { min-height: 44px; } }
</style>
