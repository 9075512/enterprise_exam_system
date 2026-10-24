<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { UploadFilled, TopRight, CopyDocument, Download, Search, Iphone, Refresh } from '@element-plus/icons-vue';
import QRCode from 'qrcode';
import PageHeader from '@/components/common/PageHeader.vue';
import { listApps, createAppRelease, editAppRelease, changeAppStatus, formatAppDate, formatAppSize, type AppRelease, type ReleaseInput } from '@/api/apps';
const rows = ref<AppRelease[]>([]), loading = ref(false), error = ref(''), keyword = ref(''), filter = ref('all'), qr = ref('');
const dialog = ref(false), saving = ref(false), progress = ref(0), selected = ref<File | null>(null), editing = ref<AppRelease | null>(null);
const fileInput = ref<HTMLInputElement>(), formRef = ref<FormInstance>(), working = ref('');
const downloadPage = `${location.origin}/download`;
const form = reactive<ReleaseInput>({ appName: '卓达学习', versionName: '', versionCode: 0, minAndroid: '8.0', releaseNotes: '' });
const current = computed(() => rows.value.find(item => item.status === 'published'));
const dataReady = computed(() => !loading.value && !error.value);
const summaryStatus = computed(() => error.value ? '加载失败' : loading.value ? '加载中' : current.value ? '正在分发' : '待发布');
const summaryDescription = computed(() => error.value ? '暂时无法获取版本状态，请刷新重试。' : loading.value ? '正在读取版本与下载统计…' : current.value ? `当前下载版本发布于 ${formatAppDate(current.value.publishedAt)}，支持 Android ${current.value.minAndroid} 及以上。` : '上传安装包并发布后，学员即可通过下载页获取 App。');
const totalDownloads = computed(() => rows.value.reduce((total, item) => total + item.downloadCount, 0));
const visibleRows = computed(() => rows.value.filter(item => (filter.value === 'all' || item.status === filter.value) && `${item.versionName} ${item.versionCode} ${item.releaseNotes}`.toLowerCase().includes(keyword.value.trim().toLowerCase())));
const rules: FormRules = { appName: [{ required: true, message: '请输入应用名称' }], versionName: [{ pattern: /^\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$/, required: true, message: '版本号格式示例：1.0.2' }], versionCode: [{ validator: (_rule, value, callback) => Number.isInteger(value) && value > 0 && value <= 2100000000 ? callback() : callback(new Error('请输入有效的内部版本号')) }], minAndroid: [{ pattern: /^\d{1,2}(?:\.\d{1,2})?$/, required: true, message: '安卓版本格式示例：8.0' }], releaseNotes: [{ required: true, whitespace: true, message: '请填写更新说明' }] };
async function load() {
  loading.value = true; error.value = '';
  try { rows.value = await listApps(); } catch { error.value = '版本列表加载失败，请重试'; } finally { loading.value = false; }
}
async function copy(text: string) {
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
    else {
      const input = document.createElement('textarea'); input.value = text; input.style.position = 'fixed'; input.style.opacity = '0'; document.body.appendChild(input); input.select();
      try { if (!document.execCommand('copy')) throw new Error(); } finally { input.remove(); }
    }
    ElMessage.success('已复制');
  } catch { ElMessage.info('复制不可用，请手动选择并复制链接'); }
}
function openEditor(item?: AppRelease) {
  editing.value = item ?? null; selected.value = null; progress.value = 0;
  Object.assign(form, item ? { appName: item.appName, versionName: item.versionName, versionCode: item.versionCode, minAndroid: item.minAndroid, releaseNotes: item.releaseNotes } : { appName: current.value?.appName || '卓达学习', versionName: '', versionCode: 0, minAndroid: '8.0', releaseNotes: '' });
  dialog.value = true;
}
function choose(file?: File) {
  if (!file) return;
  if (!/\.apk$/i.test(file.name) || file.size > 200 * 1024 * 1024) { ElMessage.error('请选择不超过 200 MB 的 APK 文件'); return; }
  selected.value = file;
  if (!form.versionName) form.versionName = file.name.match(/\d+\.\d+\.\d+/)?.[0] || '';
}
function fileChanged(event: Event) { choose((event.target as HTMLInputElement).files?.[0]); (event.target as HTMLInputElement).value = ''; }
async function save() {
  if (saving.value) return;
  const valid = await formRef.value?.validate().catch(() => false);
  if (!valid || saving.value) return;
  if (!editing.value && !selected.value) { ElMessage.error('请先选择 APK 安装包'); return; }
  saving.value = true;
  try {
    if (editing.value) await editAppRelease(editing.value, { ...form });
    else {
      const body = new FormData();
      Object.entries(form).forEach(([key, value]) => body.append(key, String(value)));
      body.append('file', selected.value!);
      await createAppRelease(body, value => { progress.value = value; });
    }
    dialog.value = false; ElMessage.success(editing.value ? '版本信息已保存' : '已保存为草稿，可在列表中发布'); await load();
  } catch { /* API helper displays the server error. */ } finally { saving.value = false; }
}
async function status(item: AppRelease, next: 'published' | 'withdrawn') {
  try {
    await ElMessageBox.confirm(next === 'published' ? `发布 v${item.versionName} 后，访问下载页的用户将获取此版本。` : '下架后此安装包将停止公开下载；下载页会显示上一个已发布版本，没有其他版本时显示待发布。', next === 'published' ? '发布 App 版本' : '下架 App 版本', { confirmButtonText: next === 'published' ? '确认发布' : '确认下架', cancelButtonText: '取消', type: 'warning' });
    working.value = item.id; await changeAppStatus(item, next); ElMessage.success(next === 'published' ? '版本已发布' : '版本已下架'); await load();
  } catch { /* Cancel or an API error leaves the table intact. */ } finally { working.value = ''; }
}
onMounted(async () => { void load(); try { qr.value = await QRCode.toDataURL(downloadPage, { width: 180, margin: 1, color: { dark: '#23364f', light: '#ffffff' } }); } catch { /* The share link remains available. */ } });
</script>

<template>
  <div class="app-manage" data-ui-layout="list" data-ui-page="AppManagePage">
    <PageHeader title="App 管理" description="管理安卓安装包，让每一次更新有序抵达学员。"><template #actions><el-button :icon="TopRight" tag="a" href="/download" target="_blank" rel="noopener">预览下载页</el-button><el-button type="primary" :icon="UploadFilled" @click="openEditor()">上传新版本</el-button></template></PageHeader>
    <div class="app-manage__overview">
      <section class="app-manage__current">
        <div class="app-manage__current-top"><img src="/brand/app-icon.svg" alt="" /><div><span class="app-manage__eyebrow">ANDROID APPLICATION</span><h2>{{ current?.appName || '卓达学习' }} <span v-if="current && dataReady">v{{ current.versionName }}</span></h2></div><span class="app-manage__live" :class="{ 'is-empty': !current || !dataReady }">{{ summaryStatus }}</span></div>
        <p>{{ summaryDescription }}</p>
        <div class="app-manage__numbers"><div><strong>{{ dataReady ? rows.length : '—' }}</strong><small>版本记录</small></div><div><strong>{{ dataReady ? rows.filter(item => item.status === 'published').length : '—' }}</strong><small>已发布版本</small></div><div><strong>{{ dataReady ? totalDownloads.toLocaleString() : '—' }}</strong><small>完成下载次数</small></div></div>
      </section>
      <section class="app-manage__share"><div><span class="app-manage__eyebrow">DISTRIBUTION</span><h3>一个链接，持续更新</h3><p>分享下载页，学员始终获取当前已发布版本。</p><div class="app-manage__share-link"><input :value="downloadPage" aria-label="App 下载页链接" readonly /><button aria-label="复制下载页链接" @click="copy(downloadPage)"><CopyDocument /></button></div></div><img v-if="qr" :src="qr" alt="下载页二维码" width="96" height="96" /></section>
    </div>
    <section class="app-manage__versions">
      <div class="app-manage__table-heading"><div><h3>版本与安装包 <span>{{ dataReady ? rows.length : '—' }}</span></h3><p>上传后先保存草稿，确认信息后再发布。</p></div><el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button></div>
      <div class="app-manage__filters"><el-input v-model="keyword" :prefix-icon="Search" placeholder="搜索版本号或更新说明" clearable aria-label="搜索版本" /><el-select v-model="filter" aria-label="筛选版本状态"><el-option label="全部状态" value="all" /><el-option label="已发布" value="published" /><el-option label="草稿" value="draft" /><el-option label="已下架" value="withdrawn" /></el-select><span>{{ dataReady ? `共 ${visibleRows.length} 个版本` : '版本数量待确认' }}</span></div>
      <el-alert v-if="error" :title="error" type="error" :closable="false" show-icon />
      <el-table v-else v-loading="loading" :data="visibleRows" class="app-manage__table" :empty-text="loading ? '正在加载版本…' : keyword || filter !== 'all' ? '没有符合条件的版本' : '暂无版本，点击右上角上传第一个安装包'">
        <el-table-column label="应用版本" min-width="200"><template #default="{ row }"><div class="app-manage__version-cell"><span class="app-manage__apk-icon"><Iphone /></span><div><strong>{{ row.appName }} <span>v{{ row.versionName }}</span></strong><small>versionCode {{ row.versionCode }} · {{ formatAppSize(row.fileSize) }}</small></div></div></template></el-table-column>
        <el-table-column label="更新说明" min-width="220"><template #default="{ row }"><p class="app-manage__notes">{{ row.releaseNotes }}</p><el-button link size="small" @click="copy(row.sha256)">复制 SHA-256</el-button></template></el-table-column>
        <el-table-column label="状态" width="120"><template #default="{ row }"><el-tag :type="row.status === 'published' ? 'success' : row.status === 'draft' ? 'info' : 'warning'" effect="light">{{ current?.id === row.id ? '当前版本' : row.status === 'published' ? '已发布' : row.status === 'draft' ? '草稿' : '已下架' }}</el-tag></template></el-table-column>
        <el-table-column label="下载次数" width="100"><template #default="{ row }">{{ row.downloadCount.toLocaleString() }}</template></el-table-column>
        <el-table-column label="发布时间" width="135"><template #default="{ row }"><span class="app-manage__date">{{ formatAppDate(row.publishedAt) }}</span></template></el-table-column>
        <el-table-column label="操作" min-width="165" fixed="right"><template #default="{ row }"><div class="app-manage__row-actions"><el-button link type="primary" @click="openEditor(row as AppRelease)">编辑</el-button><el-button v-if="row.status !== 'published'" link type="primary" :loading="working === row.id" @click="status(row as AppRelease, 'published')">发布</el-button><el-button v-else link type="warning" :loading="working === row.id" @click="status(row as AppRelease, 'withdrawn')">下架</el-button><el-button v-if="row.status === 'published'" link :icon="Download" tag="a" :href="row.downloadUrl" aria-label="下载安装包" /></div></template></el-table-column>
      </el-table>
      <p class="app-manage__table-note">下载次数统计完整文件传输，不代表独立用户或安装设备数。更换安装包请上传新版本，并保持签名一致。</p>
    </section>
    <el-dialog v-model="dialog" :title="editing ? '编辑版本信息' : '上传新版本'" width="640px" class="app-manage__dialog" :close-on-click-modal="false" :close-on-press-escape="!saving" :show-close="!saving" @closed="formRef?.clearValidate()">
      <el-form ref="formRef" :model="form" :rules="rules" label-position="top" :disabled="saving" @submit.prevent="save">
        <div v-if="!editing" class="app-manage__upload" @dragover.prevent @drop.prevent="!saving && choose($event.dataTransfer?.files[0])"><input ref="fileInput" type="file" accept=".apk" aria-label="选择 APK 安装包" :disabled="saving" @change="fileChanged" /><UploadFilled /><strong>{{ selected?.name || '拖拽 APK 到这里，或点击选择文件' }}</strong><small>{{ selected ? formatAppSize(selected.size) : '支持 .apk 格式，最大 200 MB' }}</small><el-button size="small" :disabled="saving" @click="fileInput?.click()">{{ selected ? '重新选择' : '选择安装包' }}</el-button></div>
        <div class="app-manage__form-grid"><el-form-item label="应用名称" prop="appName"><el-input v-model="form.appName" maxlength="60" /></el-form-item><el-form-item label="最低安卓版本" prop="minAndroid"><el-input v-model="form.minAndroid" placeholder="例如 8.0" /></el-form-item><el-form-item label="展示版本号" prop="versionName"><el-input v-model="form.versionName" :disabled="!!editing" placeholder="例如 1.0.2" /></el-form-item><el-form-item label="内部版本号（versionCode）" prop="versionCode"><el-input-number v-model="form.versionCode" :disabled="!!editing" :min="1" :max="2100000000" :precision="0" controls-position="right" /></el-form-item></div>
        <p v-if="!editing" class="app-manage__form-hint">版本信息须与 APK 打包配置一致；覆盖安装需要更大的 versionCode 和相同的发布签名。</p>
        <el-form-item label="更新说明" prop="releaseNotes"><el-input v-model="form.releaseNotes" type="textarea" :rows="5" maxlength="5000" show-word-limit placeholder="每行一条更新内容，例如：&#10;重新设计移动登录页&#10;优化练题与成绩查看体验" /></el-form-item>
        <el-progress v-if="saving && !editing" :percentage="progress" :stroke-width="6" /><p v-if="saving && progress === 100 && !editing" class="app-manage__form-hint">安装包已传输，正在校验并保存，请稍候…</p>
      </el-form>
      <template #footer><el-button :disabled="saving" @click="dialog = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">{{ editing ? '保存修改' : '保存为草稿' }}</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/variables.scss' as *;
.app-manage { &__overview { display: grid; grid-template-columns: 1.4fr 1fr; gap: 20px; margin-bottom: 24px; } &__current { padding: 26px 28px; border-radius: $radius-lg; color: white; background: linear-gradient(120deg, #1c3456, #2b4b73); > p { color: #b3c4dc; font-size: 12px; line-height: 1.9; margin: 19px 0; } } &__current-top { display: flex; align-items: center; gap: 14px; img { width: 50px; height: 50px; border-radius: 12px; } h2 { margin: 5px 0 0; font-size: 20px; span { font-size: 13px; margin-left: 8px; color: #bccde3; font-weight: 400; } } }
  &__eyebrow { font-size: 9px; letter-spacing: 1.8px; color: #95b1d6; } &__live { margin-left: auto; white-space: nowrap; display: inline-flex; align-items: center; gap: 7px; padding: 5px 10px; border: 1px solid #729e9d55; border-radius: 30px; /* radius-exception: compact publication status capsule. */ color: #b6e5ca; background: #a1d7c111; font-size: 10px; &::before { content: ''; width: 5px; height: 5px; border-radius: 50%; background: #89cea4; } &.is-empty { color: #cfdae7; &::before { background: #cfdae7; } } }
  &__numbers { display: grid; grid-template-columns: repeat(3, 1fr); padding-top: 18px; border-top: 1px solid #a9bdd51f; strong { display: block; font-size: 24px; line-height: 1.2; font-weight: 600; font-variant-numeric: tabular-nums; } small { display: block; margin-top: 7px; font-size: 10px; color: #adc1db; } }
  &__share { display: flex; align-items: center; gap: 20px; padding: 25px; border: 1px solid $border-color; border-radius: $radius-lg; background: #fff; > div { min-width: 0; flex: 1; } h3 { margin: 10px 0; font-size: 17px; } p { color: $text-secondary; font-size: 12px; line-height: 1.9; } img { width: 96px; height: 96px; flex: 0 0 96px; border: 1px solid $border-color; border-radius: 8px; } }
  &__share-link { display: flex; width: 100%; margin-top: 17px; border: 1px solid $border-color; border-radius: 6px; background: #f8fafc; input { min-width: 0; width: 100%; border: none; background: transparent; color: $text-secondary; padding: 8px; font-size: 11px; } button { display: grid; place-items: center; flex: 0 0 32px; border: none; border-left: 1px solid $border-color; background: none; color: $color-primary; cursor: pointer; svg { width: 14px; height: 14px; } } }
  &__versions { background: #fff; border: 1px solid $border-color; border-radius: $radius-lg; overflow: hidden; } &__table-heading { display: flex; align-items: center; justify-content: space-between; gap: 15px; padding: 23px 24px 0; h3 { font-size: 16px; margin: 0; span { margin-left: 8px; padding: 2px 7px; border-radius: 4px; color: $text-secondary; background: #f1f4f8; font-size: 11px; font-weight: 400; } } p { margin: 7px 0 0; color: $text-secondary; font-size: 11px; } }
  &__filters { display: flex; align-items: center; gap: 12px; padding: 20px 24px; .el-input { width: 260px; } .el-select { width: 130px; } > span { margin-left: auto; font-size: 11px; color: $text-secondary; } } &__table { width: 100%; } &__row-actions { display: inline-flex; align-items: center; gap: 12px; white-space: nowrap; .el-button { margin-left: 0; } } &__version-cell { display: flex; align-items: center; gap: 10px; strong { display: block; color: $text-primary; font-size: 12px; span { font-size: 11px; font-weight: 400; margin-left: 5px; color: $text-secondary; } } small { display: block; font-size: 10px; margin-top: 5px; color: $text-secondary; } } &__apk-icon { display: grid; place-items: center; width: 32px; height: 38px; border-radius: 6px; background: #edf4ff; color: $color-primary; svg { width: 19px; height: 19px; } } &__notes { max-width: 340px; margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: $text-body; font-size: 11px; } &__date { color: $text-secondary; font-size: 11px; } &__table-note { margin: 0; padding: 17px 24px; border-top: 1px solid $border-color; color: $text-secondary; font-size: 10px; line-height: 1.9; }
  &__upload { position: relative; display: flex; align-items: center; flex-direction: column; gap: 9px; padding: 23px; margin-bottom: 23px; border: 1px dashed #b9cfee; border-radius: 8px; background: #f7faff; input { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; } > svg { width: 31px; height: 31px; color: $color-primary; } strong { max-width: 100%; word-break: break-all; font-size: 12px; font-weight: 500; } small { font-size: 10px; color: $text-secondary; } } &__form-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0 20px; .el-input-number { width: 100%; } } &__form-hint { margin: -4px 0 20px; color: $text-secondary; font-size: 11px; line-height: 1.8; }
}
@media(max-width: 1100px) { .app-manage__overview { grid-template-columns: 1fr; } }
@media(max-width: 600px) { .app-manage { &__current { padding: 20px; } &__share { padding: 20px; gap: 12px; img { width: 80px; height: 80px; flex-basis: 80px; } } &__current-top h2 { font-size: 17px; } &__filters { flex-wrap: wrap; padding-inline: 16px; .el-input { width: 100%; } > span { font-size: 10px; } } &__table-heading { padding-inline: 16px; } &__form-grid { grid-template-columns: 1fr; } &__table-note { padding-inline: 16px; } } }
</style>
