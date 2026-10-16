<script setup lang="ts">
/**
 * 公告与轮播（v1.9⑥）—— 管理端内容运营页。
 *
 * 一份内容可选择发布到「考试端 / 练题端 / 两端」，配合启停开关与生效时间窗控制展示；
 * 页面分两个页签：公告管理、轮播图管理。
 *
 * 说明：本页仅做**内容维护**，考生侧的可见性由服务端统一判定
 * （enabled=1 且 target ∈ {scope, both} 且落在生效时间窗内），前端不重复实现。
 */
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import {
  batchAnnouncements,
  batchBanners,
  createAnnouncement,
  createBanner,
  deleteAnnouncement,
  deleteBanner,
  getTouchStats,
  listAnnouncements,
  listBanners,
  updateAnnouncement,
  updateBanner,
  type ContentBatchAction,
} from '@/api/content';
import { uploadImage } from '@/api/attachments';
import { formatRange } from '@/utils/datetime';
import PageHeader from '@/components/common/PageHeader.vue';
import BatchActionBar from '@/components/common/BatchActionBar.vue';
import TableDensityToggle from '@/components/common/TableDensityToggle.vue';
import EmptyState from '@/components/common/EmptyState.vue';
import RichTextEditor from '@/components/common/RichTextEditor.vue';
import type { Announcement, AnnouncementLevel, Banner, ContentTarget, ContentTouchStats } from '@/types';

/* ============================ 通用 ============================ */

const TARGET_OPTIONS: ReadonlyArray<{ value: ContentTarget; label: string }> = [
  { value: 'both', label: '两端同步' },
  { value: 'exam', label: '仅考试端' },
  { value: 'practice', label: '仅练题端' },
];

const TARGET_LABELS: Record<ContentTarget, string> = {
  both: '两端',
  exam: '考试端',
  practice: '练题端',
};

const TARGET_TAG: Record<ContentTarget, 'primary' | 'success' | 'warning'> = {
  both: 'primary',
  exam: 'success',
  practice: 'warning',
};

/**
 * 生效状态（与服务端口径一致）。
 * 入参放宽为 unknown：Element Plus 表格插槽的 row 为 DefaultRow，无法直接匹配结构化类型。
 */
function statusOf(input: unknown): { text: string; type: 'success' | 'info' | 'warning' } {
  const row = input as { enabled: boolean; startAt: string | null; endAt: string | null };
  if (!row.enabled) return { text: '已停用', type: 'info' };
  const now = Date.now();
  if (row.startAt && new Date(row.startAt).getTime() > now) return { text: '未生效', type: 'warning' };
  if (row.endAt && new Date(row.endAt).getTime() < now) return { text: '已过期', type: 'info' };
  return { text: '生效中', type: 'success' };
}

/** 生效时间窗展示文案。 */
function windowText(input: unknown): string {
  const row = input as { startAt: string | null; endAt: string | null };
  if (!row.startAt && !row.endAt) return '长期有效';
  if (row.startAt && row.endAt) return formatRange(row.startAt, row.endAt);
  if (row.startAt) return `${formatRange(row.startAt, row.startAt).split(' ')[0]} 起`;
  return `至 ${formatRange(row.endAt!, row.endAt!)}`;
}

const activeTab = ref<'announcement' | 'banner'>('announcement');

/* ------------------------------ 触达看板（v2.0③） ------------------------------ */

const touchVisible = ref(false);
const touchLoading = ref(false);
const touchStats = ref<ContentTouchStats | null>(null);
const touchTab = ref<'announcement' | 'banner'>('announcement');

async function openTouchStats(): Promise<void> {
  touchVisible.value = true;
  touchLoading.value = true;
  try {
    touchStats.value = await getTouchStats();
  } catch {
    touchStats.value = null;
  } finally {
    touchLoading.value = false;
  }
}

/** 富文本是否为空（仅标签 / 空白；含图片视为非空）——与后端 isRichTextEmpty 同口径。 */
function richTextEmpty(html: string): boolean {
  if (/<img\b/i.test(html)) return false;
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/gi, ' ').trim() === '';
}

/* ============================ 公告 ============================ */

const annLoading = ref(false);
const annList = ref<Announcement[]>([]);
const annTotal = ref(0);
const annPage = ref(1);
const annPageSize = ref(20);
const annFilter = reactive<{ target: '' | ContentTarget; enabled: '' | 'on' | 'off'; keyword: string }>({
  target: '',
  enabled: '',
  keyword: '',
});
/** 是否处于筛选态（决定空态口径与是否给「清空筛选」出路） */
const annHasFilter = computed<boolean>(() =>
  Boolean(annFilter.keyword.trim() || annFilter.target || annFilter.enabled),
);
const annEmptyText = computed<string>(() => (annHasFilter.value ? '没有符合条件的内容' : '暂无公告'));

async function loadAnnouncements(): Promise<void> {
  annLoading.value = true;
  try {
    const data = await listAnnouncements({
      target: annFilter.target || undefined,
      enabled: annFilter.enabled === '' ? undefined : annFilter.enabled === 'on',
      keyword: annFilter.keyword.trim() || undefined,
      page: annPage.value,
      pageSize: annPageSize.value,
    });
    annList.value = data.list;
    annTotal.value = data.total;
  } catch {
    annList.value = [];
    annTotal.value = 0;
  } finally {
    annLoading.value = false;
  }
}

function searchAnnouncements(): void {
  annPage.value = 1;
  void loadAnnouncements();
}

/* ------------------------------ 公告批量操作（v2.0④） ------------------------------ */

const annSelection = ref<Announcement[]>([]);
/** 公告表格实例（仅用于「取消选择」清空勾选） */
const annTableRef = ref<{ clearSelection: () => void } | null>(null);

function onAnnSelectionChange(rows: Announcement[]): void {
  annSelection.value = rows;
}

/** 清空公告勾选 */
function clearAnnSelection(): void {
  annTableRef.value?.clearSelection();
  annSelection.value = [];
}

/** 清空公告筛选并回到第一页 */
function resetAnnFilter(): void {
  annFilter.target = '';
  annFilter.enabled = '';
  annFilter.keyword = '';
  searchAnnouncements();
}

async function runAnnBatch(action: ContentBatchAction): Promise<void> {
  const rows = annSelection.value;
  if (rows.length === 0) {
    ElMessage.warning('请先勾选公告');
    return;
  }
  const verb = action === 'enable' ? '上线' : action === 'disable' ? '下线' : '删除';
  try {
    await ElMessageBox.confirm(`确定${verb}选中的 ${rows.length} 条公告吗？`, `批量${verb}`, {
      type: action === 'delete' ? 'warning' : 'info',
      confirmButtonText: verb,
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    const res = await batchAnnouncements(
      rows.map((r) => r.id),
      action,
    );
    ElMessage.success(`已${verb} ${res.affected} 条公告`);
    await loadAnnouncements();
  } catch {
    /* 错误已由请求拦截器统一提示 */
  }
}

const annDialogVisible = ref(false);
const annEditingId = ref('');
const annSubmitting = ref(false);
const annForm = reactive<{
  title: string;
  content: string;
  target: ContentTarget;
  level: AnnouncementLevel;
  pinned: boolean;
  enabled: boolean;
  startAt: Date | null;
  endAt: Date | null;
}>({
  title: '',
  content: '',
  target: 'both',
  level: 'normal',
  pinned: false,
  enabled: true,
  startAt: null,
  endAt: null,
});

const annDialogTitle = computed<string>(() => (annEditingId.value ? '编辑公告' : '新建公告'));

function resetAnnForm(): void {
  annForm.title = '';
  annForm.content = '';
  annForm.target = 'both';
  annForm.level = 'normal';
  annForm.pinned = false;
  annForm.enabled = true;
  annForm.startAt = null;
  annForm.endAt = null;
}

function openAnnCreate(): void {
  annEditingId.value = '';
  resetAnnForm();
  annDialogVisible.value = true;
}

function openAnnEdit(row: Announcement): void {
  annEditingId.value = row.id;
  annForm.title = row.title;
  annForm.content = row.content;
  annForm.target = row.target;
  annForm.level = row.level;
  annForm.pinned = row.pinned;
  annForm.enabled = row.enabled;
  annForm.startAt = row.startAt ? new Date(row.startAt) : null;
  annForm.endAt = row.endAt ? new Date(row.endAt) : null;
  annDialogVisible.value = true;
}

async function submitAnnouncement(): Promise<void> {
  if (!annForm.title.trim()) {
    ElMessage.warning('请填写公告标题');
    return;
  }
  if (richTextEmpty(annForm.content)) {
    ElMessage.warning('请填写公告内容');
    return;
  }
  if (annForm.startAt && annForm.endAt && annForm.endAt.getTime() <= annForm.startAt.getTime()) {
    ElMessage.warning('生效结束时间必须晚于开始时间');
    return;
  }
  annSubmitting.value = true;
  try {
    const payload = {
      title: annForm.title.trim(),
      content: annForm.content,
      target: annForm.target,
      level: annForm.level,
      pinned: annForm.pinned,
      enabled: annForm.enabled,
      startAt: annForm.startAt ? annForm.startAt.toISOString() : null,
      endAt: annForm.endAt ? annForm.endAt.toISOString() : null,
    };
    if (annEditingId.value) {
      await updateAnnouncement(annEditingId.value, payload);
      ElMessage.success('公告已更新');
    } else {
      await createAnnouncement(payload);
      ElMessage.success('公告已创建');
    }
    annDialogVisible.value = false;
    await loadAnnouncements();
  } catch {
    /* 错误已由请求拦截器统一提示 */
  } finally {
    annSubmitting.value = false;
  }
}

async function removeAnnouncement(row: Announcement): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除公告「${row.title}」吗？删除后两端将立即不再展示。`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await deleteAnnouncement(row.id);
    ElMessage.success('公告已删除');
    await loadAnnouncements();
  } catch {
    /* 错误已由请求拦截器统一提示 */
  }
}

/* ============================ 轮播图 ============================ */

const bnLoading = ref(false);
const bnList = ref<Banner[]>([]);
const bnTotal = ref(0);
const bnPage = ref(1);
const bnPageSize = ref(20);
const bnFilter = reactive<{ target: '' | ContentTarget; enabled: '' | 'on' | 'off' }>({
  target: '',
  enabled: '',
});
/** 是否处于筛选态（决定空态口径与是否给「清空筛选」出路） */
const bnHasFilter = computed<boolean>(() => Boolean(bnFilter.target || bnFilter.enabled));
const bnEmptyText = computed<string>(() => (bnHasFilter.value ? '没有符合条件的轮播图' : '暂无轮播图'));

async function loadBanners(): Promise<void> {
  bnLoading.value = true;
  try {
    const data = await listBanners({
      target: bnFilter.target || undefined,
      enabled: bnFilter.enabled === '' ? undefined : bnFilter.enabled === 'on',
      page: bnPage.value,
      pageSize: bnPageSize.value,
    });
    bnList.value = data.list;
    bnTotal.value = data.total;
  } catch {
    bnList.value = [];
    bnTotal.value = 0;
  } finally {
    bnLoading.value = false;
  }
}

function searchBanners(): void {
  bnPage.value = 1;
  void loadBanners();
}

/* ------------------------------ 轮播批量操作（v2.0④） ------------------------------ */

const bnSelection = ref<Banner[]>([]);
/** 轮播表格实例（仅用于「取消选择」清空勾选） */
const bnTableRef = ref<{ clearSelection: () => void } | null>(null);

function onBnSelectionChange(rows: Banner[]): void {
  bnSelection.value = rows;
}

/** 清空轮播勾选 */
function clearBnSelection(): void {
  bnTableRef.value?.clearSelection();
  bnSelection.value = [];
}

/** 清空轮播筛选并回到第一页 */
function resetBnFilter(): void {
  bnFilter.target = '';
  bnFilter.enabled = '';
  searchBanners();
}

async function runBnBatch(action: ContentBatchAction): Promise<void> {
  const rows = bnSelection.value;
  if (rows.length === 0) {
    ElMessage.warning('请先勾选轮播图');
    return;
  }
  const verb = action === 'enable' ? '上线' : action === 'disable' ? '下线' : '删除';
  try {
    await ElMessageBox.confirm(`确定${verb}选中的 ${rows.length} 张轮播图吗？`, `批量${verb}`, {
      type: action === 'delete' ? 'warning' : 'info',
      confirmButtonText: verb,
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    const res = await batchBanners(
      rows.map((r) => r.id),
      action,
    );
    ElMessage.success(`已${verb} ${res.affected} 张轮播图`);
    await loadBanners();
  } catch {
    /* 错误已由请求拦截器统一提示 */
  }
}

const bnDialogVisible = ref(false);
const bnEditingId = ref('');
const bnSubmitting = ref(false);
const bnUploading = ref(false);
const bnFileInput = ref<HTMLInputElement | null>(null);
const bnForm = reactive<{
  title: string;
  imageUrl: string;
  linkUrl: string;
  target: ContentTarget;
  sortOrder: number;
  enabled: boolean;
  startAt: Date | null;
  endAt: Date | null;
}>({
  title: '',
  imageUrl: '',
  linkUrl: '',
  target: 'both',
  sortOrder: 0,
  enabled: true,
  startAt: null,
  endAt: null,
});

const bnDialogTitle = computed<string>(() => (bnEditingId.value ? '编辑轮播图' : '新建轮播图'));

function resetBnForm(): void {
  bnForm.title = '';
  bnForm.imageUrl = '';
  bnForm.linkUrl = '';
  bnForm.target = 'both';
  bnForm.sortOrder = 0;
  bnForm.enabled = true;
  bnForm.startAt = null;
  bnForm.endAt = null;
}

function openBnCreate(): void {
  bnEditingId.value = '';
  resetBnForm();
  bnDialogVisible.value = true;
}

function openBnEdit(row: Banner): void {
  bnEditingId.value = row.id;
  bnForm.title = row.title;
  bnForm.imageUrl = row.imageUrl;
  bnForm.linkUrl = row.linkUrl;
  bnForm.target = row.target;
  bnForm.sortOrder = row.sortOrder;
  bnForm.enabled = row.enabled;
  bnForm.startAt = row.startAt ? new Date(row.startAt) : null;
  bnForm.endAt = row.endAt ? new Date(row.endAt) : null;
  bnDialogVisible.value = true;
}

/** 选择本地图片 → 上传到对象存储 → 回填地址。 */
async function onBnFileChange(event: Event): Promise<void> {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  bnUploading.value = true;
  try {
    const attachment = await uploadImage(file);
    bnForm.imageUrl = attachment.url;
    ElMessage.success('图片已上传');
  } catch {
    /* 错误已由请求拦截器统一提示 */
  } finally {
    bnUploading.value = false;
  }
}

async function submitBanner(): Promise<void> {
  if (!bnForm.title.trim()) {
    ElMessage.warning('请填写轮播图标题');
    return;
  }
  if (!bnForm.imageUrl.trim()) {
    ElMessage.warning('请上传或填写轮播图片地址');
    return;
  }
  if (bnForm.startAt && bnForm.endAt && bnForm.endAt.getTime() <= bnForm.startAt.getTime()) {
    ElMessage.warning('生效结束时间必须晚于开始时间');
    return;
  }
  bnSubmitting.value = true;
  try {
    const payload = {
      title: bnForm.title.trim(),
      imageUrl: bnForm.imageUrl.trim(),
      linkUrl: bnForm.linkUrl.trim(),
      target: bnForm.target,
      sortOrder: Number.isFinite(bnForm.sortOrder) ? bnForm.sortOrder : 0,
      enabled: bnForm.enabled,
      startAt: bnForm.startAt ? bnForm.startAt.toISOString() : null,
      endAt: bnForm.endAt ? bnForm.endAt.toISOString() : null,
    };
    if (bnEditingId.value) {
      await updateBanner(bnEditingId.value, payload);
      ElMessage.success('轮播图已更新');
    } else {
      await createBanner(payload);
      ElMessage.success('轮播图已创建');
    }
    bnDialogVisible.value = false;
    await loadBanners();
  } catch {
    /* 错误已由请求拦截器统一提示 */
  } finally {
    bnSubmitting.value = false;
  }
}

async function removeBanner(row: Banner): Promise<void> {
  try {
    await ElMessageBox.confirm(`确定删除轮播图「${row.title}」吗？`, '删除确认', {
      type: 'warning',
      confirmButtonText: '删除',
      cancelButtonText: '取消',
    });
  } catch {
    return;
  }
  try {
    await deleteBanner(row.id);
    ElMessage.success('轮播图已删除');
    await loadBanners();
  } catch {
    /* 错误已由请求拦截器统一提示 */
  }
}

/* ============================ 生命周期 ============================ */

onMounted(() => {
  void loadAnnouncements();
  void loadBanners();
});
</script>

<template>
  <div class="content-page">
    <PageHeader
      title="公告与轮播"
      description="面向考生发布公告与轮播图；可选择同步两端，或只发布到考试端 / 练题端"
    >
      <template #actions>
        <el-button @click="openTouchStats">触达概览</el-button>
      </template>
    </PageHeader>

    <el-card class="content-page__panel" shadow="never">
      <el-tabs v-model="activeTab">
        <!-- ------------------------------ 公告管理 ------------------------------ -->
        <el-tab-pane label="公告管理" name="announcement">
          <div class="content-page__toolbar">
            <el-select v-model="annFilter.target" class="content-page__select" @change="searchAnnouncements">
              <el-option label="全部范围" value="" />
              <el-option v-for="opt in TARGET_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
            <el-select v-model="annFilter.enabled" class="content-page__select" @change="searchAnnouncements">
              <el-option label="全部状态" value="" />
              <el-option label="已启用" value="on" />
              <el-option label="已停用" value="off" />
            </el-select>
            <el-input
              v-model="annFilter.keyword"
              class="content-page__search"
              placeholder="搜索标题 / 内容"
              clearable
              @keyup.enter="searchAnnouncements"
              @clear="searchAnnouncements"
            />
            <el-button @click="searchAnnouncements">查询</el-button>
            <div class="content-page__spacer" />
            <TableDensityToggle />
            <el-button type="primary" @click="openAnnCreate">新建公告</el-button>
          </div>

          <BatchActionBar :count="annSelection.length" noun="条公告" @clear="clearAnnSelection">
            <el-button @click="runAnnBatch('enable')">批量上线</el-button>
            <el-button @click="runAnnBatch('disable')">批量下线</el-button>
            <el-button type="danger" plain @click="runAnnBatch('delete')">批量删除</el-button>
          </BatchActionBar>

          <el-table
            ref="annTableRef"
            v-loading="annLoading"
            :data="annList"
            row-key="id"
            stripe
            @selection-change="onAnnSelectionChange"
          >
            <el-table-column type="selection" width="44" />
            <el-table-column label="标题" min-width="220" show-overflow-tooltip>
              <template #default="{ row }">
                <el-tag v-if="row.pinned" size="small" type="danger" effect="plain" class="content-page__pin">置顶</el-tag>
                <span>{{ row.title }}</span>
              </template>
            </el-table-column>
            <el-table-column label="发布范围" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="TARGET_TAG[row.target as ContentTarget]" effect="light">
                  {{ TARGET_LABELS[row.target as ContentTarget] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="级别" width="90">
              <template #default="{ row }">
                <span :class="{ 'content-page__important': row.level === 'important' }">
                  {{ row.level === 'important' ? '重要' : '普通' }}
                </span>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="statusOf(row).type" effect="light">{{ statusOf(row).text }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="生效时间" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">{{ windowText(row) }}</template>
            </el-table-column>
            <el-table-column label="阅读" width="80" align="right">
              <template #default="{ row }">{{ row.readCount ?? 0 }}</template>
            </el-table-column>
            <el-table-column prop="createdByName" label="创建人" width="110" show-overflow-tooltip />
            <el-table-column class-name="table-actions-cell" label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="openAnnEdit(row as Announcement)">编辑</el-button>
                <el-button type="danger" link @click="removeAnnouncement(row as Announcement)">删除</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState
                :text="annEmptyText"
                :filtered="annHasFilter"
                action-text="新建公告"
                @clear="resetAnnFilter"
                @action="openAnnCreate"
              />
            </template>
          </el-table>

          <div class="content-page__pager">
            <el-pagination
              v-model:current-page="annPage"
              v-model:page-size="annPageSize"
              :total="annTotal"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next"
              background
              @current-change="loadAnnouncements"
              @size-change="searchAnnouncements"
            />
          </div>
        </el-tab-pane>

        <!-- ------------------------------ 轮播图管理 ------------------------------ -->
        <el-tab-pane label="轮播图管理" name="banner">
          <div class="content-page__toolbar">
            <el-select v-model="bnFilter.target" class="content-page__select" @change="searchBanners">
              <el-option label="全部范围" value="" />
              <el-option v-for="opt in TARGET_OPTIONS" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
            <el-select v-model="bnFilter.enabled" class="content-page__select" @change="searchBanners">
              <el-option label="全部状态" value="" />
              <el-option label="已启用" value="on" />
              <el-option label="已停用" value="off" />
            </el-select>
            <el-button @click="searchBanners">查询</el-button>
            <div class="content-page__spacer" />
            <TableDensityToggle />
            <el-button type="primary" @click="openBnCreate">新建轮播图</el-button>
          </div>

          <BatchActionBar :count="bnSelection.length" noun="张轮播图" @clear="clearBnSelection">
            <el-button @click="runBnBatch('enable')">批量上线</el-button>
            <el-button @click="runBnBatch('disable')">批量下线</el-button>
            <el-button type="danger" plain @click="runBnBatch('delete')">批量删除</el-button>
          </BatchActionBar>

          <el-table
            ref="bnTableRef"
            v-loading="bnLoading"
            :data="bnList"
            row-key="id"
            stripe
            @selection-change="onBnSelectionChange"
          >
            <el-table-column type="selection" width="44" />
            <el-table-column label="预览" width="120">
              <template #default="{ row }">
                <el-image
                  v-if="row.imageUrl"
                  class="content-page__thumb"
                  :src="row.imageUrl"
                  fit="cover"
                  :preview-src-list="[row.imageUrl]"
                  preview-teleported
                />
                <span v-else class="content-page__muted">—</span>
              </template>
            </el-table-column>
            <el-table-column prop="title" label="标题" min-width="160" show-overflow-tooltip />
            <el-table-column label="跳转地址" min-width="180" show-overflow-tooltip>
              <template #default="{ row }">
                <a v-if="row.linkUrl" :href="row.linkUrl" target="_blank" rel="noopener noreferrer">{{ row.linkUrl }}</a>
                <span v-else class="content-page__muted">不可点击</span>
              </template>
            </el-table-column>
            <el-table-column prop="sortOrder" label="排序" width="80" />
            <el-table-column label="发布范围" width="110">
              <template #default="{ row }">
                <el-tag size="small" :type="TARGET_TAG[row.target as ContentTarget]" effect="light">
                  {{ TARGET_LABELS[row.target as ContentTarget] }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column label="状态" width="100">
              <template #default="{ row }">
                <el-tag size="small" :type="statusOf(row).type" effect="light">{{ statusOf(row).text }}</el-tag>
              </template>
            </el-table-column>
            <el-table-column label="生效时间" min-width="200" show-overflow-tooltip>
              <template #default="{ row }">{{ windowText(row) }}</template>
            </el-table-column>
            <el-table-column label="点击" width="80" align="right">
              <template #default="{ row }">{{ row.clickCount ?? 0 }}</template>
            </el-table-column>
            <el-table-column class-name="table-actions-cell" label="操作" width="140" fixed="right">
              <template #default="{ row }">
                <el-button type="primary" link @click="openBnEdit(row as Banner)">编辑</el-button>
                <el-button type="danger" link @click="removeBanner(row as Banner)">删除</el-button>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState
                :text="bnEmptyText"
                :filtered="bnHasFilter"
                action-text="新建轮播图"
                @clear="resetBnFilter"
                @action="openBnCreate"
              />
            </template>
          </el-table>

          <div class="content-page__pager">
            <el-pagination
              v-model:current-page="bnPage"
              v-model:page-size="bnPageSize"
              :total="bnTotal"
              :page-sizes="[10, 20, 50, 100]"
              layout="total, sizes, prev, pager, next"
              background
              @current-change="loadBanners"
              @size-change="searchBanners"
            />
          </div>
        </el-tab-pane>
      </el-tabs>
    </el-card>

    <!-- ------------------------------ 公告弹窗 ------------------------------ -->
    <el-dialog v-model="annDialogVisible" :title="annDialogTitle" width="640px" destroy-on-close append-to-body>
      <el-form label-width="96px" label-position="right">
        <el-form-item label="公告标题" required>
          <el-input v-model="annForm.title" maxlength="120" show-word-limit placeholder="请输入公告标题" />
        </el-form-item>
        <el-form-item label="公告内容" required>
          <RichTextEditor
            v-model="annForm.content"
            :max-images="5"
            :max-image-bytes="1024 * 1024"
            :min-height="180"
            placeholder="请输入公告正文（支持加粗、列表与插入图片）"
          />
        </el-form-item>
        <el-form-item label="发布范围">
          <el-radio-group v-model="annForm.target">
            <el-radio-button v-for="opt in TARGET_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="公告级别">
          <el-radio-group v-model="annForm.level">
            <el-radio-button value="normal">普通</el-radio-button>
            <el-radio-button value="important">重要</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="生效时间">
          <div class="content-page__range">
            <el-date-picker
              v-model="annForm.startAt"
              type="datetime"
              placeholder="开始时间（留空立即生效）"
              :clearable="true"
            />
            <span class="content-page__tilde">至</span>
            <el-date-picker
              v-model="annForm.endAt"
              type="datetime"
              placeholder="结束时间（留空长期有效）"
              :clearable="true"
            />
            <span class="content-page__tip">开始时间晚于当前 → 预约发布；结束时间到点自动下线</span>
          </div>
        </el-form-item>
        <el-form-item label="置顶">
          <el-switch v-model="annForm.pinned" />
          <span class="content-page__tip">置顶公告在两端列表最前展示</span>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="annForm.enabled" />
          <span class="content-page__tip">关闭后两端立即不可见（不受时间窗影响）</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="annDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="annSubmitting" @click="submitAnnouncement">保存</el-button>
      </template>
    </el-dialog>

    <!-- ------------------------------ 轮播图弹窗 ------------------------------ -->
    <el-dialog v-model="bnDialogVisible" :title="bnDialogTitle" width="640px" destroy-on-close append-to-body>
      <el-form label-width="96px" label-position="right">
        <el-form-item label="标题" required>
          <el-input v-model="bnForm.title" maxlength="120" show-word-limit placeholder="请输入轮播图标题" />
        </el-form-item>
        <el-form-item label="图片" required>
          <div class="content-page__upload">
            <el-image v-if="bnForm.imageUrl" class="content-page__upload-preview" :src="bnForm.imageUrl" fit="cover" />
            <div class="content-page__upload-actions">
              <el-button :loading="bnUploading" @click="bnFileInput?.click()">上传图片</el-button>
              <el-input
                v-model="bnForm.imageUrl"
                class="content-page__upload-url"
                placeholder="也可直接粘贴图片地址"
                clearable
              />
            </div>
            <input ref="bnFileInput" type="file" accept="image/*" hidden @change="onBnFileChange" />
          </div>
        </el-form-item>
        <el-form-item label="跳转地址">
          <el-input v-model="bnForm.linkUrl" maxlength="500" placeholder="点击轮播图跳转的链接（留空则不可点击）" />
        </el-form-item>
        <el-form-item label="发布范围">
          <el-radio-group v-model="bnForm.target">
            <el-radio-button v-for="opt in TARGET_OPTIONS" :key="opt.value" :value="opt.value">
              {{ opt.label }}
            </el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="排序">
          <el-input-number v-model="bnForm.sortOrder" :min="0" :max="9999" :step="1" />
          <span class="content-page__tip">数值越小越靠前</span>
        </el-form-item>
        <el-form-item label="生效时间">
          <div class="content-page__range">
            <el-date-picker
              v-model="bnForm.startAt"
              type="datetime"
              placeholder="开始时间（留空立即生效）"
              :clearable="true"
            />
            <span class="content-page__tilde">至</span>
            <el-date-picker
              v-model="bnForm.endAt"
              type="datetime"
              placeholder="结束时间（留空长期有效）"
              :clearable="true"
            />
            <span class="content-page__tip">开始时间晚于当前 → 预约发布；结束时间到点自动下线</span>
          </div>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="bnForm.enabled" />
          <span class="content-page__tip">关闭后两端立即不可见</span>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="bnDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="bnSubmitting" @click="submitBanner">保存</el-button>
      </template>
    </el-dialog>

    <!-- ------------------------------ 触达概览（v2.0③） ------------------------------ -->
    <el-dialog v-model="touchVisible" title="内容触达概览" width="760px" destroy-on-close append-to-body>
      <div v-loading="touchLoading" class="content-page__touch">
        <div class="content-page__touch-audience">
          <span>受众规模：考试端 <b>{{ touchStats?.audience.exam ?? 0 }}</b> 人</span>
          <span>练题端 <b>{{ touchStats?.audience.practice ?? 0 }}</b> 人</span>
        </div>
        <el-tabs v-model="touchTab">
          <el-tab-pane label="公告阅读" name="announcement">
            <el-table :data="touchStats?.announcements ?? []" size="small" max-height="360">
              <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
              <el-table-column label="范围" width="90">
                <template #default="{ row }">{{ TARGET_LABELS[row.target as ContentTarget] }}</template>
              </el-table-column>
              <el-table-column prop="readCount" label="阅读人数" width="100" align="right" />
              <el-table-column label="阅读率" width="100" align="right">
                <template #default="{ row }">{{ row.readRate }}%</template>
              </el-table-column>
              <template #empty>
                <EmptyState text="暂无公告" />
              </template>
            </el-table>
          </el-tab-pane>
          <el-tab-pane label="轮播点击" name="banner">
            <el-table :data="touchStats?.banners ?? []" size="small" max-height="360">
              <el-table-column prop="title" label="标题" min-width="220" show-overflow-tooltip />
              <el-table-column label="范围" width="90">
                <template #default="{ row }">{{ TARGET_LABELS[row.target as ContentTarget] }}</template>
              </el-table-column>
              <el-table-column prop="clickCount" label="点击人数" width="100" align="right" />
              <el-table-column label="点击率" width="100" align="right">
                <template #default="{ row }">{{ row.clickRate }}%</template>
              </el-table-column>
              <template #empty>
                <EmptyState text="暂无轮播图" />
              </template>
            </el-table>
          </el-tab-pane>
        </el-tabs>
        <p class="content-page__touch-tip">
          阅读 / 点击均为去重人数（同一用户同一端只计一次）；触达率分母按发布范围取对应端受众。
        </p>
      </div>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;

.content-page {
  &__panel {
    :deep(.el-card__body) {
      padding-top: 8px;
    }
  }

  &__toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
    flex-wrap: wrap;
  }

  &__spacer {
    flex: 1;
  }

  &__select {
    width: 140px;
  }

  &__search {
    width: 220px;
  }

  &__pin {
    margin-right: 6px;
  }

  &__important {
    font-weight: 700;
    color: $color-error-text;
  }

  &__muted {
    color: $text-disabled;
  }

  &__thumb {
    width: 88px;
    height: 48px;
    border: 1px solid $border-color;
    border-radius: 4px;
  }

  &__pager {
    display: flex;
    justify-content: flex-end;
    margin-top: 14px;
  }

  &__range {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  &__tilde {
    color: $text-secondary;
    font-size: 13px;
  }

  &__tip {
    margin-left: 10px;
    font-size: 12px;
    color: $text-secondary;
  }

  &__upload {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    width: 100%;
  }

  &__upload-preview {
    width: 120px;
    height: 68px;
    flex: 0 0 auto;
    border: 1px solid $border-color;
    border-radius: 4px;
  }

  &__upload-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex: 1;
    min-width: 0;
  }

  &__upload-url {
    width: 100%;
  }

  &__touch {
    min-height: 200px;
  }

  &__touch-audience {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
    margin-bottom: 8px;
    padding: 10px 14px;
    background: $color-table-head;
    border: 1px solid $border-color;
    border-radius: 4px;
    font-size: 13px;
    color: $text-secondary;

    b {
      color: $color-primary;
      font-variant-numeric: tabular-nums;
    }
  }

  &__touch-tip {
    margin: 10px 0 0;
    font-size: 12px;
    color: $text-disabled;
  }
}
</style>
