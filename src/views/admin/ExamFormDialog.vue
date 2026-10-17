<script setup lang="ts">
/**
 * 考试新建 / 编辑弹窗（W3-T2，新建/编辑复用）。
 * 提交前把本地时间字符串转为 ISO 8601（后端 DATETIME(3)）。
 */
import { computed, reactive, ref, watch } from 'vue';
import dayjs from 'dayjs';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import * as examsApi from '@/api/exams';
import * as usersApi from '@/api/users';
import { templatesApi } from '@/api/coreFeatures';
import { useSettingsStore } from '@/stores/settings';
import { validateAndFocus } from '@/composables/useFormFocus';
import { buildDepartmentTree } from '@/utils/departmentTree';
import type { AudienceTemplate, Department, Exam, ExamMode, Paper, User } from '@/types';

const props = defineProps<{
  visible: boolean;
  exam?: Exam | null;
  papers: Paper[];
  departments: Department[];
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved'): void;
}>();

/** 参与科室树（多级；选择上级科室将自动覆盖其下级科室考生）。 */
const departmentTree = computed(() => buildDepartmentTree(props.departments));

const dialogVisible = computed<boolean>({
  get: () => props.visible,
  set: (value) => emit('update:visible', value),
});

const isEdit = computed<boolean>(() => Boolean(props.exam?.id));

const settingsStore = useSettingsStore();

const LOCAL_FORMAT = 'YYYY-MM-DD HH:mm:ss';

const formRef = ref<FormInstance>();
const submitting = ref(false);
const examinees = ref<User[]>([]);
const audienceTemplates = ref<AudienceTemplate[]>([]);
const form = reactive({
  name: '',
  paperId: '',
  departmentIds: [] as string[],
  includeUserIds: [] as string[],
  excludeUserIds: [] as string[],
  audienceTemplateId: null as string | null,
  startTime: '',
  endTime: '',
  durationMinutes: 60,
  passScore: 60,
  maxAttempts: 1,
  examMode: 'closed' as ExamMode,
});

/** 人手一卷 / 选项乱序 / 补考申请 / 成绩复核：三态（inherit=跟随全局默认，on=开启，off=关闭） */
type TriState = 'inherit' | 'on' | 'off';
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
  paperId: [{ required: true, message: '请选择关联试卷', trigger: 'change' }],
  startTime: [{ required: true, message: '请选择开始时间', trigger: 'change' }],
  endTime: [{ required: true, message: '请选择截止时间', trigger: 'change' }],
};

function resetForm(): void {
  const exam = props.exam;
  if (exam) {
    form.name = exam.name;
    form.paperId = exam.paperId;
    form.departmentIds = [...exam.departmentIds];
    form.includeUserIds = [...exam.includeUserIds];
    form.excludeUserIds = [...exam.excludeUserIds];
    form.audienceTemplateId = exam.audienceTemplateId;
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
    form.paperId = '';
    form.departmentIds = [];
    form.includeUserIds = [];
    form.excludeUserIds = [];
    form.audienceTemplateId = null;
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

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    void settingsStore.load();
    void Promise.all([usersApi.list({ role: 'examinee' }), templatesApi.audiences()]).then(([u, t]) => { examinees.value = u; audienceTemplates.value = t; });
    resetForm();
    formRef.value?.clearValidate();
  },
);

async function handleSubmit(): Promise<void> {
  if (!formRef.value) return;
  const valid = await validateAndFocus(formRef.value);
  if (!valid) return;
  if (!form.departmentIds.length && !form.includeUserIds.length && !form.audienceTemplateId) {
    ElMessage.warning('请至少选择参与科室、指定人员或抽考模板');
    return;
  }

  const start = new Date(form.startTime).getTime();
  const end = new Date(form.endTime).getTime();
  if (!(end > start)) {
    ElMessage.error('截止时间必须晚于开始时间');
    return;
  }

  submitting.value = true;
  try {
    const payload = {
      name: form.name.trim(),
      paperId: form.paperId,
      departmentIds: [...form.departmentIds],
      includeUserIds: [...form.includeUserIds],
      excludeUserIds: [...form.excludeUserIds],
      audienceTemplateId: form.audienceTemplateId,
      startTime: new Date(form.startTime).toISOString(),
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
    if (isEdit.value && props.exam) {
      await examsApi.update(props.exam.id, payload);
      ElMessage.success('考试已更新');
    } else {
      await examsApi.create(payload);
      ElMessage.success('考试已创建');
    }
    emit('saved');
    dialogVisible.value = false;
  } catch {
    // 错误提示已由 http.ts 响应拦截器统一弹出
  } finally {
    submitting.value = false;
  }
}

function handleCancel(): void {
  dialogVisible.value = false;
}
</script>

<template>
  <el-dialog
    v-model="dialogVisible"
    :title="isEdit ? '编辑考试' : '新建考试'"
    width="560px"
    top="6vh"
    append-to-body
    destroy-on-close
  >
    <el-form ref="formRef" :model="form" :rules="rules" label-position="top">
      <el-form-item label="考试名称" prop="name">
        <el-input v-model="form.name" maxlength="120" show-word-limit placeholder="如：安全知识月考" />
      </el-form-item>

      <el-form-item label="关联试卷" prop="paperId">
        <el-select v-model="form.paperId" class="exam-form__full" placeholder="请选择试卷">
          <el-option
            v-for="paper in papers"
            :key="paper.id"
            :label="`${paper.name}（${paper.totalScore} 分）`"
            :value="paper.id"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="参与科室（可多选）" prop="departmentIds">
        <el-tree-select
          v-model="form.departmentIds"
          :data="departmentTree"
          class="exam-form__full"
          multiple
          show-checkbox
          check-strictly
          :render-after-expand="false"
          default-expand-all
          placeholder="请选择参与科室"
        />
        <span class="exam-form__hint">选择上级科室将自动覆盖其所有下级科室考生</span>
      </el-form-item>
      <el-form-item label="人员抽考模板">
        <el-select v-model="form.audienceTemplateId" clearable class="exam-form__full" placeholder="可选；应用后立即解析并冻结名单"><el-option v-for="t in audienceTemplates" :key="t.id" :label="t.name" :value="t.id" /></el-select>
      </el-form-item>
      <el-form-item label="指定加入人员">
        <el-select v-model="form.includeUserIds" multiple filterable class="exam-form__full" placeholder="可与科室、模板叠加"><el-option v-for="u in examinees" :key="u.id" :label="`${u.name}（${u.username}）`" :value="u.id" /></el-select>
      </el-form-item>
      <el-form-item label="指定排除人员">
        <el-select v-model="form.excludeUserIds" multiple filterable class="exam-form__full" placeholder="排除优先于所有加入来源"><el-option v-for="u in examinees" :key="u.id" :label="`${u.name}（${u.username}）`" :value="u.id" /></el-select>
        <span class="exam-form__hint">新建或重新保存后冻结最终名单；已有作答时仅允许追加，不能移除原人员。</span>
      </el-form-item>

      <el-row :gutter="12">
        <el-col :xs="24" :sm="12">
          <el-form-item label="开始时间" prop="startTime">
            <el-date-picker
              v-model="form.startTime"
              type="datetime"
              class="exam-form__full"
              placeholder="选择开始时间"
              value-format="YYYY-MM-DD HH:mm:ss"
            />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="截止时间" prop="endTime">
            <el-date-picker
              v-model="form.endTime"
              type="datetime"
              class="exam-form__full"
              placeholder="选择截止时间"
              value-format="YYYY-MM-DD HH:mm:ss"
            />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="12">
        <el-col :xs="24" :sm="12">
          <el-form-item label="考试时长（分钟）">
            <el-input-number v-model="form.durationMinutes" :min="1" :max="600" />
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="及格分数线">
            <el-input-number v-model="form.passScore" :min="1" :max="1000" :step="1" />
          </el-form-item>
        </el-col>
      </el-row>

      <el-row :gutter="12">
        <el-col :xs="24" :sm="12">
          <el-form-item label="考试形式">
            <el-radio-group v-model="form.examMode">
              <el-radio value="closed">闭卷</el-radio>
              <el-radio value="open">开卷</el-radio>
            </el-radio-group>
          </el-form-item>
        </el-col>
        <el-col :xs="24" :sm="12">
          <el-form-item label="答题次数（每人最多）" prop="maxAttempts">
            <el-input-number v-model="form.maxAttempts" :min="1" :max="10" />
          </el-form-item>
        </el-col>
      </el-row>
      <el-form-item label-width="0">
        <span class="exam-form__hint">考试形式仅作标注展示；同一考生可重复作答的最大次数见「答题次数」</span>
      </el-form-item>

      <el-form-item label="人手一卷">
        <el-radio-group v-model="shuffleMode">
          <el-radio value="inherit">跟随全局默认</el-radio>
          <el-radio value="on">开启</el-radio>
          <el-radio value="off">关闭</el-radio>
        </el-radio-group>
        <span class="exam-form__hint">开启后每位考生的题目顺序随机</span>
      </el-form-item>

      <el-form-item label="选项乱序">
        <el-radio-group v-model="shuffleOptionsMode">
          <el-radio value="inherit">跟随全局默认</el-radio>
          <el-radio value="on">开启</el-radio>
          <el-radio value="off">关闭</el-radio>
        </el-radio-group>
        <span class="exam-form__hint">人手一卷开启时，进一步打乱每道题的选项顺序</span>
      </el-form-item>

      <el-form-item label="补考申请">
        <el-radio-group v-model="allowRetakeMode">
          <el-radio value="inherit">跟随全局默认</el-radio>
          <el-radio value="on">开启</el-radio>
          <el-radio value="off">关闭</el-radio>
        </el-radio-group>
        <span class="exam-form__hint">
          不及格且答题次数用完后可申请补考，经管理员审批通过后追加一次答题机会
        </span>
      </el-form-item>

      <el-form-item label="成绩复核">
        <el-radio-group v-model="allowAppealMode">
          <el-radio value="inherit">跟随全局默认</el-radio>
          <el-radio value="on">开启</el-radio>
          <el-radio value="off">关闭</el-radio>
        </el-radio-group>
        <span class="exam-form__hint">开启后考生可在时限内对已出成绩申请复核，管理员可改分</span>
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="handleCancel">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ isEdit ? '保存' : '创建' }}
      </el-button>
    </template>
  </el-dialog>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.exam-form__full {
  width: 100%;
}

.exam-form__hint {
  display: block;
  width: 100%;
  margin-top: 4px;
  font-size: 12px;
  color: $text-secondary;
}
</style>
