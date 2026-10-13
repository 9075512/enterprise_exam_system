/** 题库 API（§4.5 题库 / 试题） */
import { del, get, post, put } from './http';
import type { BankDetail, QuestionBank, Question, QuestionType, Page } from '@/types';

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
