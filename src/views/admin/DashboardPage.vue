<script setup lang="ts">
/**
 * 数据总览（W3-T2，管理员）。
 * 4 个统计卡片 + 近期考试表；各接口 Promise.allSettled 互相隔离失败。
 */
import { onMounted, reactive, ref } from 'vue';
import {
  Collection,
  Document,
  OfficeBuilding,
  User,
} from '@element-plus/icons-vue';
import * as banksApi from '@/api/banks';
import * as departmentsApi from '@/api/departments';
import * as examsApi from '@/api/exams';
import * as papersApi from '@/api/papers';
import * as usersApi from '@/api/users';
import { THEME } from '@/constants/theme';
import { formatRange } from '@/utils/datetime';
import { getExamStatus } from '@/utils/examStatus';
import PageHeader from '@/components/common/PageHeader.vue';
import LoadingSkeleton from '@/components/common/LoadingSkeleton.vue';
import StatusTag from '@/components/common/StatusTag.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import type { Exam } from '@/types';

const loading = ref(false);
const stats = reactive({
  departments: 0,
  users: 0,
  banks: 0,
  questions: 0,
  papers: 0,
});
const exams = ref<Exam[]>([]);
const paperNames = ref<Record<string, string>>({});

const cards = [
  { key: 'departments', label: '科室数', icon: OfficeBuilding, color: THEME.primary },
  { key: 'users', label: '用户数', icon: User, color: THEME.secondary },
  { key: 'banks', label: '题库 / 题目', icon: Collection, color: THEME.info },
  { key: 'papers', label: '试卷数', icon: Document, color: THEME.success },
] as const;

function cardValue(key: (typeof cards)[number]['key']): string {
  if (key === 'banks') return `${stats.banks} / ${stats.questions}`;
  return String(stats[key]);
}

async function load(): Promise<void> {
  loading.value = true;
  const [d, u, b, p, e] = await Promise.allSettled([
    departmentsApi.list(),
    usersApi.list(),
    banksApi.list(),
    papersApi.list(),
    examsApi.list(),
  ]);

  if (d.status === 'fulfilled') stats.departments = d.value.length;
  if (u.status === 'fulfilled') stats.users = u.value.length;
  if (b.status === 'fulfilled') {
    stats.banks = b.value.length;
    stats.questions = b.value.reduce((sum, item) => sum + item.questionCount, 0);
  }
  if (p.status === 'fulfilled') {
    stats.papers = p.value.length;
    paperNames.value = Object.fromEntries(p.value.map((item) => [item.id, item.name]));
  }
  if (e.status === 'fulfilled') exams.value = e.value;

  loading.value = false;
}

onMounted(load);
</script>

<template>
  <div class="dashboard">
    <PageHeader title="数据总览" description="系统运行概况" />

    <LoadingSkeleton v-if="loading && exams.length === 0" :rows="4" />

    <template v-else>
      <el-row :gutter="16" class="dashboard__cards">
        <el-col v-for="card in cards" :key="card.key" :xs="12" :sm="12" :md="6">
          <el-card class="stat-card" shadow="hover">
            <div class="stat-card__body">
              <el-icon class="stat-card__icon" :style="{ color: card.color, backgroundColor: `${card.color}1A` }">
                <component :is="card.icon" />
              </el-icon>
              <div class="stat-card__text">
                <div class="stat-card__label">{{ card.label }}</div>
                <div class="stat-card__value num">{{ cardValue(card.key) }}</div>
              </div>
            </div>
          </el-card>
        </el-col>
      </el-row>

      <el-card class="dashboard__recent" shadow="never">
        <template #header>
          <span>近期考试</span>
        </template>

        <EmptyState v-if="exams.length === 0" text="暂无考试" />

        <el-table v-else :data="exams" row-key="id" stripe>
          <el-table-column prop="name" label="考试名称" min-width="180" show-overflow-tooltip />
          <el-table-column label="关联试卷" min-width="180" show-overflow-tooltip>
            <template #default="{ row }">{{ paperNames[row.paperId] || row.paperId }}</template>
          </el-table-column>
          <el-table-column label="参与科室" width="100" align="center">
            <template #default="{ row }">{{ row.departmentIds.length }}</template>
          </el-table-column>
          <el-table-column label="时间窗" min-width="320">
            <template #default="{ row }">{{ formatRange(row.startTime, row.endTime) }}</template>
          </el-table-column>
          <el-table-column label="状态" width="100" align="center">
            <template #default="{ row }">
              <StatusTag :status="getExamStatus(row as Exam)" />
            </template>
          </el-table-column>
        </el-table>
      </el-card>
    </template>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.dashboard__cards {
  margin-bottom: 16px;
}

.dashboard__recent {
  border-radius: $radius-lg;
}

.stat-card {
  border-radius: $radius-lg;

  &__body {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  &__icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 48px;
    border-radius: $radius-sm;
    font-size: 24px;
  }

  &__label {
    font-size: 13px;
    color: $text-secondary;
  }

  &__value {
    margin-top: 4px;
    font-size: 26px;
    font-weight: 700;
    color: $text-primary;
    line-height: 1.2;
  }
}
</style>
