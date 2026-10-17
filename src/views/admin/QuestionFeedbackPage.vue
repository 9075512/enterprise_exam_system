<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage } from 'element-plus';
import PageHeader from '@/components/common/PageHeader.vue';
import { feedbackApi } from '@/api/coreFeatures';
import type { QuestionFeedback, QuestionFeedbackStatus } from '@/types';
const rows=ref<QuestionFeedback[]>([]);const loading=ref(false);const status=ref<QuestionFeedbackStatus|''>('');const dialog=ref(false);const current=ref<QuestionFeedback|null>(null);const form=reactive({status:'processing' as QuestionFeedbackStatus,reply:''});
const labels:Record<QuestionFeedbackStatus,string>={pending:'待处理',processing:'处理中',resolved:'已解决',closed:'已关闭'};
async function load(){loading.value=true;try{rows.value=await feedbackApi.list(status.value||undefined)}finally{loading.value=false}}
function open(row:QuestionFeedback){current.value=row;form.status=row.status;form.reply=row.reply;dialog.value=true}
function openRow(row: unknown){ open(row as QuestionFeedback) }
async function save(){if(!current.value)return;await feedbackApi.update(current.value.id,form);dialog.value=false;ElMessage.success('处理结果已保存');await load()}
onMounted(load);
</script>
<template><div class="page"><PageHeader title="题目反馈" description="处理来自考试成绩明细和练题结果的纠错反馈，回复与状态变化会写入审计日志"/><el-card shadow="never"><div class="filters"><el-select v-model="status" clearable placeholder="全部状态" @change="load"><el-option v-for="(v,k) in labels" :key="k" :label="v" :value="k"/></el-select></div><el-table v-loading="loading" :data="rows"><el-table-column prop="userName" label="反馈人" width="120"/><el-table-column prop="source" label="来源" width="90"/><el-table-column prop="category" label="类型" width="120"/><el-table-column prop="content" label="反馈内容" min-width="260" show-overflow-tooltip/><el-table-column label="状态" width="100"><template #default="{row}">{{ labels[row.status as QuestionFeedbackStatus] }}</template></el-table-column><el-table-column prop="createdAt" label="提交时间" width="190"/><el-table-column label="操作" width="90"><template #default="{row}"><el-button link type="primary" @click="openRow(row)">处理</el-button></template></el-table-column></el-table></el-card><el-dialog v-model="dialog" title="处理题目反馈" width="560"><el-form label-width="80"><el-form-item label="状态"><el-select v-model="form.status"><el-option v-for="(v,k) in labels" :key="k" :label="v" :value="k"/></el-select></el-form-item><el-form-item label="回复"><el-input v-model="form.reply" type="textarea" :rows="5" maxlength="1000" show-word-limit/></el-form-item></el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog></div></template>
<style scoped>.page{display:flex;flex-direction:column;gap:16px}.filters{display:flex;margin-bottom:12px;width:180px}</style>
