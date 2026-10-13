/** 试卷 / 组卷 API（§4.5 试卷 / 组卷） */
import { del, get, post, put } from './http';
import type { DrawResult, DrawRules, PaperDetail, Paper, PaperSaveInput } from '@/types';

/** 试卷保存入参（不含 id） */
export type PaperPayload = Omit<PaperSaveInput, 'id'>;

/** 试卷列表（含来源题库） */
export function list(): Promise<Paper[]> {
  return get<Paper[]>('/papers');
}

/** 新建试卷 */
export function create(payload: PaperPayload): Promise<Paper> {
  return post<Paper>('/papers', payload);
}

/** 试卷详情（题目 + 来源题库 + 逐题来源） */
export function detail(id: string): Promise<PaperDetail> {
  return get<PaperDetail>(`/papers/${id}`);
}

/** 编辑试卷（整卷重写） */
export function update(id: string, payload: PaperPayload): Promise<Paper> {
  return put<Paper>(`/papers/${id}`, payload);
}

/** 删除试卷（被考试引用 1005） */
export function remove(id: string): Promise<null> {
  return del<null>(`/papers/${id}`);
}

/** 按题型随机抽题 */
export function drawQuestions(payload: {
  bankIds: string[];
  rules: DrawRules;
}): Promise<DrawResult> {
  return post<DrawResult>('/papers/draw-questions', payload);
}

/**
 * 导出试卷为 PDF（考生版 / 答案版）。
 * 后端返回裸二进制 PDF，拦截器原样透传为 Blob。
 */
export function exportPaperPdf(paperId: string, withAnswer: boolean): Promise<Blob> {
  return get<Blob>(`/papers/${paperId}/export-pdf`, { withAnswer: withAnswer ? 1 : 0 }, { responseType: 'blob' });
}
