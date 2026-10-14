/** 题库 API（§4.5 题库 / 试题） */
import { del, get, post, put } from './http';
import type {
  BankAuthorBatchResult,
  BankCloneResult,
  BankDetail,
  BankQuestionStats,
  QuestionBank,
  Question,
  QuestionDifficulty,
  QuestionType,
  Page,
  Role,
} from '@/types';

/** 题库保存入参 */
export interface BankPayload {
  name: string;
  description?: string;
  category?: string;
  /** 是否对外开放练题（默认 false） */
  allowPractice?: boolean;
  /** 授权出题人 id 列表（仅 admin 生效） */
  authorIds?: string[];
}

/** 题库内试题查询参数 */
export interface BankQuestionsQuery {
  type?: QuestionType | '';
  subject?: string;
  /** 题目难度（v3.2） */
  difficulty?: QuestionDifficulty | '';
  /** 知识点标签（v1.7②） */
  tag?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** 题库列表（含 questionCount） */
export function list(filter: { category?: string; keyword?: string } = {}): Promise<QuestionBank[]> {
  return get<QuestionBank[]>('/banks', { category: filter.category, keyword: filter.keyword });
}

/** 新建题库 */
export function create(payload: BankPayload): Promise<QuestionBank> {
  return post<QuestionBank>('/banks', payload);
}

/** 题库详情（含统计） */
export function detail(id: string): Promise<BankDetail> {
  return get<BankDetail>(`/banks/${id}`);
}

/** 编辑题库 */
export function update(id: string, payload: BankPayload): Promise<QuestionBank> {
  return put<QuestionBank>(`/banks/${id}`, payload);
}

/** 删除题库（有题须 cascade=true） */
export function remove(id: string, cascade = false): Promise<null> {
  return del<null>(`/banks/${id}`, cascade ? { cascade: 'true' } : undefined);
}

/** 题库内试题（筛选 + 分页） */
export function questions(bankId: string, query: BankQuestionsQuery = {}): Promise<Page<Question>> {
  return get<Page<Question>>(`/banks/${bankId}/questions`, {
    type: query.type || undefined,
    subject: query.subject || undefined,
    difficulty: query.difficulty || undefined,
    tag: query.tag || undefined,
    keyword: query.keyword || undefined,
    page: query.page,
    pageSize: query.pageSize,
  });
}

/**
 * 迁移试题到其他题库（P1）。
 * 注意：后端路由 `POST /api/banks/:id/questions/migrate` 尚未实现，调用将 404；
 * 保留此函数以便后端补齐后前端零改动接入。
 */
export function migrate(
  bankId: string,
  payload: { targetBankId: string; questionIds: string[] },
): Promise<{ moved: number }> {
  return post<{ moved: number }>(`/banks/${bankId}/questions/migrate`, payload);
}

/**
 * 题库题目健康度统计（v3.3；题型分布 / 平均正确率 / 待完善口径）。
 * 全部实时聚合，无缓存列；无练题作答时 `avgCorrectRate` 为 null。
 */
export function questionStats(bankId: string): Promise<BankQuestionStats> {
  return get<BankQuestionStats>(`/banks/${bankId}/question-stats`);
}

/** 题库授权批量维护入参（v1.7③ S2；三种选择器可组合） */
export interface BankAuthorsBatchPayload {
  /** 显式指定的用户 id（手选） */
  userIds?: string[];
  /** 按科室圈选（与 userIds 取并集） */
  departmentId?: string;
  /** 是否包含子科室（默认 true） */
  includeSubDepartments?: boolean;
  /** 角色过滤（在科室范围内生效；未给科室时表示全部该角色账号） */
  role?: Role;
}

/** 批量授权出题人（仅 admin，v1.7③ S2） */
export function grantAuthors(
  bankId: string,
  payload: BankAuthorsBatchPayload,
): Promise<BankAuthorBatchResult> {
  return post<BankAuthorBatchResult>(`/banks/${bankId}/authors/grant`, payload);
}

/** 批量取消出题人授权（仅 admin，v1.7③ S2） */
export function revokeAuthors(
  bankId: string,
  payload: BankAuthorsBatchPayload,
): Promise<BankAuthorBatchResult> {
  return post<BankAuthorBatchResult>(`/banks/${bankId}/authors/revoke`, payload);
}

/**
 * 批量设置「对外开放练题」开关（仅 admin）。
 * 只改 `allow_practice` 一列；返回被修改的题库（含最新 questionCount）。
 */
export function setPracticeFlag(bankIds: string[], allowPractice: boolean): Promise<QuestionBank[]> {
  return post<QuestionBank[]>('/banks/practice/batch', { bankIds, allowPractice });
}

/** 题库复制入参（v1.7④ S4） */
export interface BankClonePayload {
  /** 新题库名称（省略 → 「原名（副本）」） */
  name?: string;
  /** 是否连同试题一起复制（默认 true） */
  copyQuestions?: boolean;
  /** 新题库授权出题人（仅 admin 生效；省略 → 继承源题库作者） */
  authorIds?: string[];
}

/**
 * 复制题库（可选连同试题；v1.7④ S4）。
 *
 * v1.8⑤ U5：返回 `{ bank, copied, reused }` —— 题目按「题型+题干+选项+答案」内容指纹
 * **去重复用**，同内容题目只新建一行（`reused` 为被复用数）。
 */
export function clone(bankId: string, payload: BankClonePayload = {}): Promise<BankCloneResult> {
  return post<BankCloneResult>(`/banks/${bankId}/clone`, payload);
}
