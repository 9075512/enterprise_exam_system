<script setup lang="ts">
/** 状态标签：考试状态 / 记录状态 → el-tag（颜色按 PRD §7.1） */
import { computed } from 'vue';
import { THEME } from '@/constants/theme';
import type { ExamStatus, RecordStatus } from '@/types';

const props = defineProps<{ status: ExamStatus | RecordStatus }>();

interface TagInfo {
  text: string;
  color: string;
}

const MAP: Record<string, TagInfo> = {
  not_started: { text: '未开始', color: THEME.textSecondary },
  ongoing: { text: '进行中', color: THEME.primary },
  ended: { text: '已结束', color: THEME.textDisabled },
  in_progress: { text: '进行中', color: THEME.primary },
  submitted: { text: '已交卷', color: THEME.success },
};

const info = computed<TagInfo>(
  () => MAP[props.status] ?? { text: String(props.status), color: THEME.textSecondary },
);
</script>

<template>
  <el-tag
    effect="plain"
    round
    :style="{ color: info.color, borderColor: info.color, backgroundColor: `${info.color}1A` }"
  >
    {{ info.text }}
  </el-tag>
</template>
