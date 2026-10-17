<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import PageHeader from '@/components/common/PageHeader.vue';
import { groupsApi, positionsApi } from '@/api/coreFeatures';
import * as usersApi from '@/api/users';
import type { Position, User, UserGroup } from '@/types';

const tab = ref('positions'); const positions = ref<Position[]>([]); const groups = ref<UserGroup[]>([]); const users = ref<User[]>([]);
const dialog = ref(false); const kind = ref<'position'|'group'>('position'); const editId = ref('');
const form = reactive({ name: '', description: '', userIds: [] as string[] });
async function load(){ [positions.value, groups.value, users.value] = await Promise.all([positionsApi.list(), groupsApi.list(), usersApi.list()]); }
function open(k:'position'|'group', item?:Position|UserGroup){ kind.value=k; editId.value=item?.id??''; Object.assign(form,{name:item?.name??'',description:item?.description??'',userIds:'userIds' in (item??{}) ? [...(item as UserGroup).userIds] : []}); dialog.value=true; }
function openPosition(row: unknown){ open('position', row as Position); }
function openGroup(row: unknown){ open('group', row as UserGroup); }
async function save(){ if(!form.name.trim()) return ElMessage.warning('请输入名称'); if(kind.value==='position'){ const p={name:form.name,description:form.description}; editId.value?await positionsApi.update(editId.value,p):await positionsApi.create(p); } else { const p={name:form.name,description:form.description,userIds:form.userIds}; editId.value?await groupsApi.update(editId.value,p):await groupsApi.create(p); } dialog.value=false; ElMessage.success('已保存'); await load(); }
async function remove(k:'position'|'group',id:string){ await ElMessageBox.confirm('确认删除？','删除',{type:'warning'}); k==='position'?await positionsApi.remove(id):await groupsApi.remove(id); await load(); }
onMounted(load);
</script>
<template><div class="page"><PageHeader title="组织扩展" description="岗位为用户单选属性，用户组支持一个用户加入多个组"/><el-card shadow="never"><el-tabs v-model="tab"><el-tab-pane label="岗位" name="positions"><div class="actions"><el-button type="primary" @click="open('position')">新增岗位</el-button></div><el-table :data="positions"><el-table-column prop="name" label="岗位"/><el-table-column prop="description" label="说明"/><el-table-column label="操作" width="140"><template #default="{row}"><el-button link type="primary" @click="openPosition(row)">编辑</el-button><el-button link type="danger" @click="remove('position',row.id)">删除</el-button></template></el-table-column></el-table></el-tab-pane><el-tab-pane label="用户组" name="groups"><div class="actions"><el-button type="primary" @click="open('group')">新增用户组</el-button></div><el-table :data="groups"><el-table-column prop="name" label="用户组"/><el-table-column prop="description" label="说明"/><el-table-column label="成员数" width="100"><template #default="{row}">{{ row.userIds.length }}</template></el-table-column><el-table-column label="操作" width="140"><template #default="{row}"><el-button link type="primary" @click="openGroup(row)">编辑</el-button><el-button link type="danger" @click="remove('group',row.id)">删除</el-button></template></el-table-column></el-table></el-tab-pane></el-tabs></el-card><el-dialog v-model="dialog" :title="editId?'编辑':'新增'" width="520"><el-form label-width="80"><el-form-item label="名称"><el-input v-model="form.name"/></el-form-item><el-form-item label="说明"><el-input v-model="form.description" type="textarea"/></el-form-item><el-form-item v-if="kind==='group'" label="成员"><el-select v-model="form.userIds" multiple filterable style="width:100%"><el-option v-for="u in users" :key="u.id" :label="`${u.name}（${u.username}）`" :value="u.id"/></el-select></el-form-item></el-form><template #footer><el-button @click="dialog=false">取消</el-button><el-button type="primary" @click="save">保存</el-button></template></el-dialog></div></template>
<style scoped>.page{display:flex;flex-direction:column;gap:16px}.actions{display:flex;justify-content:flex-end;margin-bottom:12px}</style>
