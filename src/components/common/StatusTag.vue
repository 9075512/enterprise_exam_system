<script setup lang="ts">
/**
 * 状态标签：考试状态 / 记录状态 → el-tag（颜色按 docs/ui-v2.1 §8.4）
 *
 * 颜色一律取「语义三件套」（底 / 描边 / 文本）：
 * 文本用 700 档（对白底 ≥ 4.5:1，达 WCAG AA 正文），
 * 不使用语义原色作文字（原色仅用于图形，见 §2.4）。
 */
import { computed } from 'vue';
import { THEME } from '@/constants/theme';
import type { ExamStatus, RecordStatus } from '@/types';

const props = defineProps<{ status: ExamStatus | RecordStatus }>();

/** 语义色调 → 三件套色值（fg 文字 / border 描边 / bg 底） */
interface Tone {
  fg: string;
  border: string;
  bg: string;
}

const TONES = {
  neutral: { fg: THEME.textSecondary, border: THEME.border, bg: THEME.neutralBg },
  primary: { fg: THEME.primaryDark, border: THEME.primaryBorder, bg: THEME.primarySoft },
  success: { fg: THEME.successText, border: THEME.successBorder, bg: THEME.successBg },
  warning: { fg: THEME.warningText, border: THEME.warningBorder, bg: THEME.warningBg },
  info: { fg: THEME.infoText, border: THEME.infoBorder, bg: THEME.infoBg },
} satisfies Record<string, Tone>;

/** 状态 → 文案 + 语义色调 */
const MAP: Record<string, { label: string; tone: keyof typeof TONES }> = {
  not_started: { label: '未开始', tone: 'neutral' },
  ongoing: { label: '进行中', tone: 'primary' },
  ended: { label: '已结束', tone: 'info' },
  in_progress: { label: '进行中', tone: 'primary' },
  submitted: { label: '已交卷', tone: 'success' },
  pending_review: { label: '待阅卷', tone: 'warning' },
};

const info = computed(() => {
  const hit = MAP[props.status];
  return { label: hit?.label ?? String(props.status), ...TONES[hit?.tone ?? 'neutral'] };
});
</script>

<template>
  <el-tag
    effect="plain"
    round
    :style="{ color: info.fg, borderColor: info.border, backgroundColor: info.bg }"
  >
    {{ info.label }}
  </el-tag>
</template>
