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
  shuffleEnabled: z.boolean({ invalid_type_error: '人手一卷开关必须为布尔值' }).nullable().optional().default(null),
  shuffleOptions: z.boolean({ invalid_type_error: '选项乱序开关必须为布尔值' }).nullable().optional().default(null),
  allowRetake: z.boolean({ invalid_type_error: '补考申请开关必须为布尔值' }).nullable().optional().default(null),
  allowAppeal: z.boolean({ invalid_type_error: '成绩复核开关必须为布尔值' }).nullable().optional().default(null),
});

export type ExamInput = z.infer<typeof examSchema>;

/** 特殊考试安排入参（v1.7①）。 */
export const examExceptionSchema = z.object({
  extraMinutes: z.coerce.number().int().min(0, '加时必须在 0~600 分钟之间').max(600, '加时必须在 0~600 分钟之间').optional().default(0),
  extraAttempts: z.coerce.number().int().min(0, '额外次数必须在 0~10 之间').max(10, '额外次数必须在 0~10 之间').optional().default(0),
  exempt: z.boolean({ invalid_type_error: '免考标记必须为布尔值' }).optional().default(false),
  note: z.string().max(255, '备注不能超过 255 个字符').optional().default(''),
});

export type ExamExceptionInput = z.infer<typeof examExceptionSchema>;
