/** 试题 API（§4.5 题库 / 试题） */
import { del, get, post, put } from './http';
import type { Page, Question, QuestionSaveInput, QuestionType } from '@/types';

/** 全局试题池查询参数（组卷用） */
export interface QuestionPoolQuery {
  bankIds?: string[];
  type?: QuestionType | '';
  subject?: string;
  keyword?: string;
  page?: number;
  pageSize?: number;
}

/** bankIds 数组 → 逗号分隔（后端 bankIdsQuery 兼容逗号分隔与重复 key）。 */
function serializeBankIds(bankIds?: string[]): string | undefined {
  return bankIds && bankIds.length > 0 ? bankIds.join(',') : undefined;
}

/** 全局试题池（筛选 + 分页） */
export function pool(query: QuestionPoolQuery = {}): Promise<Page<Question>> {
  return get<Page<Question>>('/questions', {
    bankIds: serializeBankIds(query.bankIds),
    type: query.type || undefined,
    subject: query.subject || undefined,
    keyword: query.keyword || undefined,
    page: query.page,
    pageSize: query.pageSize,
  });
}

/** 全部科目（去重排序） */
export function subjects(bankIds?: string[]): Promise<string[]> {
  return get<string[]>('/questions/subjects', { bankIds: serializeBankIds(bankIds) });
}

/** 新增试题 */
export function create(payload: Omit<QuestionSaveInput, 'id'>): Promise<Question> {
  return post<Question>('/questions', payload);
}

/** 编辑试题 */
export function update(id: string, payload: Omit<QuestionSaveInput, 'id'>): Promise<Question> {
  return put<Question>(`/questions/${id}`, payload);
}

/** 删除试题 */
export function remove(id: string): Promise<null> {
  return del<null>(`/questions/${id}`);
}
