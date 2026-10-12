/**
 * 考试模块 —— zod 校验 schema（中文错误信息）。
 */
import { z } from 'zod';

/** ISO 日期字符串校验。 */
const isoDate = (label: string) =>
  z.string().min(1, `请填写${label}`).refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: `请填写完整的考试时间窗`,
  });

/** 新建 / 编辑考试入参。 */
export const examSchema = z.object({
  name: z.string().min(1, '考试名称不能为空'),
  paperId: z.string().min(1, '请选择关联试卷'),
  departmentIds: z.array(z.string()).min(1, '请至少选择一个参与科室'),
  startTime: isoDate('开始时间'),
  endTime: isoDate('截止时间'),
  durationMinutes: z.coerce.number().int().min(1, '考试时长必须不少于 1 分钟'),
  passScore: z.coerce.number().min(1, '及格线必须为正数'),
  maxAttempts: z.coerce.number().int().min(1, '答题次数至少为 1').max(10, '答题次数最多为 10').default(1),
});

export type ExamInput = z.infer<typeof examSchema>;
