<script setup lang="ts">
/**
 * 试题新建 / 编辑弹窗（W3-T4，新建/编辑复用）。
 * - v-model:visible 控制；question 有值 = 编辑。
 * - 题型切换会重置答案；判断题选项固定 ['正确','错误'] 且禁止增删。
 * - 选项动态列表 A~F（MIN_OPTIONS=2，MAX_OPTIONS=6），仅客观题显示。
 * - 填空：多空参考答案（逐空文本，题干用 ___ 标记）；简答：参考文本。
 * - 提交前本地校验：题干非空、客观题选项/答案数量、填空/简答参考非空、分值 > 0。
 *   后端会再校验一遍（normalizeQuestion），错误由拦截器统一提示。
 */
import { computed, reactive, ref, watch } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Delete } from '@element-plus/icons-vue';
import * as questionsApi from '@/api/questions';
import {
  JUDGE_OPTIONS,
  MAX_OPTIONS,
  MIN_OPTIONS,
  QUESTION_DIFFICULTY_OPTIONS,
  QUESTION_TYPE_OPTIONS,
} from '@/constants';
import { optionLetter } from '@/utils/format';
import type { Question, QuestionDifficulty, QuestionType, RubricBand } from '@/types';

const props = defineProps<{
  visible: boolean;
  /** 目标题库 id（新建必填；编辑也可传，实际归属以后端当前值为准） */
  bankId: string;
  /** 传入即为编辑模式 */
  question?: Question | null;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved'): void;
}>();

const dialogVisible = computed<boolean>({
  get: () => props.visible,
  set: (value) => { if (!submitting.value) emit('update:visible', value); },
});

const isEdit = computed<boolean>(() => Boolean(props.question?.id));

/** 填空最大空数 */
const MAX_FILL_BLANKS = 10;

const form = reactive({
  type: 'single' as QuestionType,
  stem: '',
  options: ['', ''] as string[],
  /** 客观题答案：选项索引数组 */
  answer: [] as number[],
  /** 填空题参考答案：逐空文本数组 */
  fillAnswers: [''] as string[],
  /** 简答题参考答案文本 */
  shortAnswer: '',
  defaultScore: 10,
  analysis: '',
  /** 题目难度（v3.2；'' = 未标注） */
  difficulty: '' as QuestionDifficulty | '',
  /** 历史知识点数据；题库管理已取消维护，编辑时仅原样保留。 */
  tags: [] as string[],
  /** 评分细则（v1.7③ S1；仅简答题生效，最多 10 档） */
  rubric: [] as RubricBand[],
});

/** 评分细则档位上限（与后端 MAX_RUBRIC_BANDS 一致） */
const MAX_RUBRIC_BANDS = 10;

const submitting = ref(false);

/** 客观题（有选项、自动判分） */
const isObjective = computed<boolean>(
  () => form.type === 'single' || form.type === 'multiple' || form.type === 'judge',
);
const isFill = computed<boolean>(() => form.type === 'fill');
const isShort = computed<boolean>(() => form.type === 'short');

/** 是否已是判断题固定选项 */
function isJudgeOptions(options: string[]): boolean {
  return (
    options.length === JUDGE_OPTIONS.length &&
    options[0] === JUDGE_OPTIONS[0] &&
    options[1] === JUDGE_OPTIONS[1]
  );
}

/** 按 question / 默认值重置表单 */
function resetForm(): void {
  const q = props.question;
  if (q) {
    form.type = q.type;
    form.stem = q.stem;
    form.options = q.type === 'judge' ? [...JUDGE_OPTIONS] : [...q.options];
    if (q.type === 'fill') {
      form.fillAnswers = (q.answer as string[]).length > 0 ? [...(q.answer as string[])] : [''];
      form.answer = [];
      form.shortAnswer = '';
    } else if (q.type === 'short') {
      form.shortAnswer = (q.answer as string[])[0] ?? '';
      form.fillAnswers = [''];
      form.answer = [];
    } else {
      form.answer = [...(q.answer as number[])];
      form.fillAnswers = [''];
      form.shortAnswer = '';
    }
    form.defaultScore = q.defaultScore;
    form.analysis = q.analysis;
    form.difficulty = q.difficulty ?? '';
    form.tags = [...(q.tags ?? [])];
    form.rubric = (q.rubric ?? []).map((b) => ({ ...b }));
  } else {
    form.type = 'single';
    form.stem = '';
    form.options = ['', ''];
    form.answer = [];
    form.fillAnswers = [''];
    form.shortAnswer = '';
    form.defaultScore = 10;
    form.analysis = '';
    form.difficulty = '';
    form.tags = [];
    form.rubric = [];
  }
}

watch(
  () => props.visible,
  (visible) => {
    if (visible) {
      resetForm();
    }
  },
);

const isJudge = computed<boolean>(() => form.type === 'judge');
const canAddOption = computed<boolean>(() => !isJudge.value && form.options.length < MAX_OPTIONS);
const canRemoveOption = computed<boolean>(
  () => !isJudge.value && form.options.length > MIN_OPTIONS,
);
const canAddBlank = computed<boolean>(() => form.fillAnswers.length < MAX_FILL_BLANKS);
const canRemoveBlank = computed<boolean>(() => form.fillAnswers.length > 1);

/** 题型切换：清空答案，并按新题型修正选项 */
function onTypeChange(): void {
  form.answer = [];
  form.fillAnswers = [''];
  form.shortAnswer = '';
  if (form.type !== 'short') form.rubric = []; // 评分细则仅简答题可用
  if (form.type === 'judge') {
    form.options = [...JUDGE_OPTIONS];
  } else if (isJudgeOptions(form.options) || form.options.length < MIN_OPTIONS) {
    form.options = ['', ''];
  }
}

/* ------------------------------ 评分细则（v1.7③ S1） ------------------------------ */

const canAddRubricBand = computed<boolean>(() => form.rubric.length < MAX_RUBRIC_BANDS);

function addRubricBand(): void {
  if (!canAddRubricBand.value) return;
  // 新档默认分值 = 题目分值，便于从满分往下调
  form.rubric.push({ score: form.defaultScore, label: '', description: '' });
}

function removeRubricBand(index: number): void {
  form.rubric.splice(index, 1);
}

function addOption(): void {
  if (canAddOption.value) form.options.push('');
}

function removeOption(index: number): void {
  if (!canRemoveOption.value) return;
  form.options.splice(index, 1);
  // 重排答案索引：删除项之后的下标整体前移，删除项本身从答案移除
  form.answer = form.answer
    .filter((i) => i !== index)
    .map((i) => (i > index ? i - 1 : i));
}

function addBlank(): void {
  if (canAddBlank.value) form.fillAnswers.push('');
}

function removeBlank(index: number): void {
  if (!canRemoveBlank.value) return;
  form.fillAnswers.splice(index, 1);
}

/** 本地校验，返回错误文案或 null */
function validateLocal(): string | null {
  if (!form.stem.trim()) return '题干不能为空';
  if (form.type === 'fill') {
    if (form.fillAnswers.some((a) => !a.trim())) return '请填写每空的参考答案';
  } else if (form.type === 'short') {
    if (!form.shortAnswer.trim()) return '请填写参考答案';
  } else if (form.type === 'judge') {
    if (form.answer.length !== 1) return '请设置正确答案';
  } else {
    const options = form.options.map((o) => o.trim());
    if (options.some((o) => !o)) return '选项内容不能为空';
    if (options.length < MIN_OPTIONS) return `至少需要 ${MIN_OPTIONS} 个选项`;
    if (options.length > MAX_OPTIONS) return `选项最多不能超过 ${MAX_OPTIONS} 个`;
    if (form.answer.length === 0) return '请设置正确答案';
    if (form.type === 'single' && form.answer.length !== 1) return '单选题只能设置一个正确答案';
    if (form.type === 'multiple' && form.answer.length < 2) return '多选题至少设置两个正确答案';
  }
  if (!(form.defaultScore > 0)) return '分值必须为正数';
  if (form.type === 'short') {
    if (form.rubric.length > MAX_RUBRIC_BANDS) return `评分细则最多 ${MAX_RUBRIC_BANDS} 档`;
    for (const band of form.rubric) {
      if (!Number.isFinite(band.score) || band.score < 0) return '评分细则档位分值不能为负';
      if (band.score > form.defaultScore) return '评分细则档位分值不能超过题目分值';
      if (!band.label.trim()) return '请填写评分细则档位名称';
    }
  }
  return null;
}

/** 提交 */
async function handleSubmit(): Promise<void> {
  if (submitting.value) return;
  const message = validateLocal();
  if (message) {
    ElMessage.warning(message);
    return;
  }

  // 组合 answer：客观题=索引数组；填空=逐空文本；简答=单元素文本数组
  let answer: number[] | string[];
  if (form.type === 'fill') {
    answer = form.fillAnswers.map((s) => s.trim());
  } else if (form.type === 'short') {
    answer = [form.shortAnswer.trim()];
  } else {
    answer = [...form.answer].sort((a, b) => a - b);
  }

  submitting.value = true;
  try {
    const payload = {
      bankId: props.bankId,
      type: form.type,
      stem: form.stem.trim(),
      options:
        form.type === 'judge'
          ? [...JUDGE_OPTIONS]
          : isObjective.value
            ? form.options.map((o) => o.trim())
            : [],
      answer,
      defaultScore: form.defaultScore,
      analysis: form.analysis.trim(),
      difficulty: form.difficulty || null,
      tags: [...form.tags],
      rubric:
        form.type === 'short'
          ? [...form.rubric]
              .map((b) => ({
                score: b.score,
                label: b.label.trim(),
                description: (b.description ?? '').trim(),
              }))
              .sort((a, b) => b.score - a.score)
          : [],
    };

    if (isEdit.value && props.question) {
      await questionsApi.update(props.question.id, payload);
      ElMessage.success('试题已更新');
    } else {
      await questionsApi.create(payload);
      ElMessage.success('试题已创建');
    }
    emit('saved');
    emit('update:visible', false);
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
  <el-drawer
    v-model="dialogVisible"
    class="question-form-drawer"
    :title="isEdit ? '编辑试题' : '新增试题'"
    size="760px"
    append-to-body
    destroy-on-close
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    :show-close="!submitting"
  >
    <el-form label-position="top" :disabled="submitting">
      <el-form-item label="题型">
        <el-radio-group v-model="form.type" class="question-type-picker" aria-label="题型" @change="onTypeChange">
          <el-radio-button
            v-for="opt in QUESTION_TYPE_OPTIONS"
            :key="opt.value"
            :value="opt.value"
          >
            {{ opt.label }}
          </el-radio-button>
        </el-radio-group>
      </el-form-item>

      <el-form-item label="题干">
        <el-input
          v-model="form.stem"
          type="textarea"
          :rows="2"
          maxlength="1000"
          show-word-limit
          :placeholder="isFill ? '请输入题干，用 ___ 标记每个空' : '请输入题干'"
        />
      </el-form-item>

      <el-form-item v-if="isObjective" label="选项">
        <div class="option-list">
          <div v-for="(_, index) in form.options" :key="index" class="option-row">
            <span class="option-row__letter">{{ optionLetter(index) }}</span>
            <el-input
              v-model="form.options[index]"
              type="textarea"
              :autosize="{ minRows: 2, maxRows: 6 }"
              :aria-label="`选项 ${optionLetter(index)}`"
              :disabled="isJudge"
              :placeholder="`选项 ${optionLetter(index)}`"
            />
            <el-button
              type="danger"
              link
              :icon="Delete"
              :disabled="!canRemoveOption"
              :aria-label="`删除选项 ${optionLetter(index)}`"
              @click="removeOption(index)"
            >
              删除
            </el-button>
          </div>
          <el-button
            class="option-list__add"
            :icon="Plus"
            :disabled="!canAddOption"
            @click="addOption"
          >
            添加选项
          </el-button>
        </div>
      </el-form-item>

      <el-form-item :label="isFill ? '参考答案（逐空）' : '正确答案'">
        <!-- 单选 / 判断：单选一组 -->
        <el-radio-group
          v-if="form.type === 'single' || form.type === 'judge'"
          v-model="form.answer[0]"
          class="answer-choices"
          aria-label="正确答案"
        >
          <el-radio v-for="(opt, index) in form.options" :key="index" :value="index">
            {{ optionLetter(index) }}{{ opt ? ` · ${opt}` : '' }}
          </el-radio>
        </el-radio-group>
        <!-- 多选：复选一组 -->
        <el-checkbox-group v-else-if="form.type === 'multiple'" v-model="form.answer" class="answer-choices" aria-label="正确答案">
          <el-checkbox v-for="(opt, index) in form.options" :key="index" :value="index">
            {{ optionLetter(index) }}{{ opt ? ` · ${opt}` : '' }}
          </el-checkbox>
        </el-checkbox-group>
        <!-- 填空：逐空参考答案 -->
        <div v-else-if="form.type === 'fill'" class="fill-list">
          <div v-for="(_, index) in form.fillAnswers" :key="index" class="fill-row">
            <span class="fill-row__label">第 {{ index + 1 }} 空</span>
            <el-input v-model="form.fillAnswers[index]" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" :aria-label="`第 ${index + 1} 空参考答案`" placeholder="参考答案" />
            <el-button
              type="danger"
              link
              :icon="Delete"
              :disabled="!canRemoveBlank"
              :aria-label="`删除第 ${index + 1} 空`"
              @click="removeBlank(index)"
            >
              删除
            </el-button>
          </div>
          <el-button class="fill-list__add" :icon="Plus" :disabled="!canAddBlank" @click="addBlank">
            添加空
          </el-button>
        </div>
        <!-- 简答：参考答案文本 -->
        <el-input
          v-else-if="form.type === 'short'"
          v-model="form.shortAnswer"
          type="textarea"
          :rows="3"
          maxlength="1000"
          show-word-limit
          placeholder="请输入参考答案（供阅卷参考）"
        />
      </el-form-item>

      <!-- 评分细则（分档 rubric，v1.7③ S1；仅简答题） -->
      <el-form-item v-if="isShort" label="评分细则（选填）">
        <div class="rubric-list">
          <div v-for="(band, index) in form.rubric" :key="index" class="rubric-row">
            <span class="rubric-row__heading">档位 {{ index + 1 }}</span>
            <el-input-number
              v-model="band.score"
              class="rubric-row__score"
              :min="0"
              :max="form.defaultScore"
              :step="0.5"
              :precision="1"
              :aria-label="`档位 ${index + 1} 得分`"
            />
            <el-input v-model="band.label" class="rubric-row__label" :aria-label="`档位 ${index + 1} 名称`" maxlength="32" placeholder="档位名称，如「完全正确」" />
            <el-input v-model="band.description" type="textarea" :autosize="{ minRows: 2, maxRows: 6 }" class="rubric-row__desc" :aria-label="`档位 ${index + 1} 说明`" maxlength="200" placeholder="档位说明（选填）" />
            <el-button class="rubric-row__remove" type="danger" link :icon="Delete" :aria-label="`删除档位 ${index + 1}`" @click="removeRubricBand(index)">删除档位</el-button>
          </div>
          <el-button :icon="Plus" :disabled="!canAddRubricBand" @click="addRubricBand">
            添加档位
          </el-button>
          <span class="rubric-list__hint">
            供阅卷时分档快选，最多 {{ MAX_RUBRIC_BANDS }} 档；不设置则阅卷自由打分
          </span>
        </div>
      </el-form-item>


      <el-form-item label="难度">
        <el-select v-model="form.difficulty" clearable placeholder="未标注" class="difficulty-select">
          <el-option
            v-for="opt in QUESTION_DIFFICULTY_OPTIONS"
            :key="opt.value"
            :label="opt.label"
            :value="opt.value"
          />
        </el-select>
      </el-form-item>

      <el-form-item label="解析">
        <el-input
          v-model="form.analysis"
          type="textarea"
          :rows="3"
          maxlength="1000"
          show-word-limit
          placeholder="选填，答案解析"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button :disabled="submitting" @click="handleCancel">取消</el-button>
      <el-button type="primary" :loading="submitting" @click="handleSubmit">
        {{ isEdit ? '保存' : '创建' }}
      </el-button>
    </template>
  </el-drawer>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.option-list {
  width: 100%;

  &__add {
    margin-top: 4px;
  }
}

.option-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  > .el-textarea { flex: 1; min-width: 0; }
  > .el-button { flex-shrink: 0; }

  &__letter {
    flex: 0 0 20px;
    text-align: center;
    font-weight: 600;
    color: $text-secondary;
  }
}

.fill-list {
  width: 100%;

  &__add {
    margin-top: 4px;
  }
}

.fill-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
  > .el-textarea { flex: 1; min-width: 0; }
  > .el-button { flex-shrink: 0; }

  &__label {
    flex: 0 0 52px;
    text-align: right;
    font-size: 13px;
    font-weight: 600;
    color: $text-secondary;
  }
}

.difficulty-select {
  width: 160px;
}

.rubric-list {
  width: 100%;

  &__hint {
    display: block;
    margin-top: 6px;
    font-size: 12px;
    line-height: 1.6;
    color: $text-secondary;
  }
}

.rubric-row {
  display: grid;
  grid-template-columns: 160px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
  padding: 16px;
  border: 1px solid $border-color;
  border-radius: $radius-lg;
  background: $bg-page;
  &__heading { grid-column: 1 / -1; font-size: 12px; font-weight: 600; color: $text-secondary; }
  &__score { width: 100%; }
  &__label { min-width: 0; }
  &__desc { grid-column: 1 / -1; min-width: 0; }
  &__remove { grid-column: 1 / -1; justify-self: end; }
}
.answer-choices {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  width: 100%;
  :deep(.el-radio), :deep(.el-checkbox) { height: auto; min-height: 36px; margin: 0; white-space: normal; align-items: flex-start; padding-block: 8px; }
  :deep(.el-radio__input), :deep(.el-checkbox__input) { margin-top: 4px; }
  :deep(.el-radio__label), :deep(.el-checkbox__label) { min-width: 0; white-space: pre-wrap; overflow-wrap: anywhere; line-height: 22px; }
}
@media (max-width: 900px) {
  .question-type-picker { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); width: 100%; }
  .question-type-picker :deep(.el-radio-button__inner) { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 44px; padding: 8px 2px; font-size: 13px; }
  .answer-choices :deep(.el-radio), .answer-choices :deep(.el-checkbox) { min-height: 44px; padding-block: 11px; }
  .option-row > .el-button, .fill-row > .el-button, .rubric-row__remove { min-height: 44px; }
  .rubric-row { grid-template-columns: minmax(0, 1fr); padding: 12px; }
  .rubric-row__score { max-width: 180px; }
}
</style>
