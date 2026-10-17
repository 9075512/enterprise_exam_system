/**
 * 种子数据写入（幂等）。
 * 与 v1.0 `src/services/storage.ts` 的种子完全一致，仅密码改用 bcryptjs（cost 10）加密。
 * 幂等策略：全部使用 `INSERT ... ON DUPLICATE KEY UPDATE id = id`（无操作），
 * 重复执行不产生重复数据、不覆盖已存在行（含时间戳），无异常。
 */
import bcrypt from 'bcryptjs';
import type { Connection } from 'mysql2/promise';
import { nowDb, toDbDate } from '../utils/datetime.js';
import { toJsonColumn } from '../utils/json.js';
import { DEFAULT_SETTINGS } from '../modules/settings/settings.defaults.js';

/** bcrypt 加盐轮数。 */
const BCRYPT_COST = 10;

/** 示例题目定义（题干/选项/答案/解析/科目逐字照搬 v1.0 storage.ts；难度为 v3.2 演示数据）。 */
interface SeedQuestion {
  id: string;
  bankId: string;
  type: 'single' | 'multiple' | 'judge';
  stem: string;
  options: string[];
  answer: number[];
  subject: string;
  analysis: string;
  /** 题目难度（v3.2 演示数据） */
  difficulty: 'low' | 'medium' | 'high';
}

/** 10 道示例题（q-01~q-06 → bank-security；q-07~q-10 → bank-culture）。 */
const SEED_QUESTIONS: readonly SeedQuestion[] = [
  {
    id: 'q-01', bankId: 'bank-security', type: 'single', difficulty: 'low',
    stem: '下列哪种行为符合公司信息安全规范？',
    options: ['与同事共享工作账号', '使用个人密码并定期更换', '将密码贴在显示器上便于记忆', '通过公共 Wi-Fi 处理敏感数据'],
    answer: [1], subject: '安全知识',
    analysis: '工作账号严禁共享；密码应个人保管、定期更换，且不得明文记录；敏感数据处理应使用可信网络。',
  },
  {
    id: 'q-02', bankId: 'bank-security', type: 'single', difficulty: 'medium',
    stem: '发现公司内部数据疑似泄露时，正确的第一反应是？',
    options: ['截图发到社交媒体曝光', '立即报告直属上级与信息安全部门', '自行删除相关文件掩盖痕迹', '不作处理，等年底统一排查'],
    answer: [1], subject: '安全知识',
    analysis: '数据泄露应第一时间上报直属上级与信息安全部门，由专人按应急流程处置。',
  },
  {
    id: 'q-03', bankId: 'bank-security', type: 'multiple', difficulty: 'medium',
    stem: '以下哪些属于强密码的特征？',
    options: ['包含大小写字母与数字', '长度不少于 8 位', '使用生日或手机号', '包含特殊字符'],
    answer: [0, 1, 3], subject: '安全知识',
    analysis: '强密码应足够长并混合字符类型；生日、手机号等个人信息易被猜测，不应使用。',
  },
  {
    id: 'q-04', bankId: 'bank-security', type: 'multiple', difficulty: 'low',
    stem: '办公电脑的安全使用做法包括哪些？',
    options: ['设置开机与锁屏密码', '离开工位时锁屏', '长期不更新操作系统', '不随意插入来历不明的 U 盘'],
    answer: [0, 1, 3], subject: '安全知识',
    analysis: '锁屏密码与及时锁屏可防止物理接触泄露；系统应及时更新；外来 U 盘可能携带恶意程序。',
  },
  {
    id: 'q-05', bankId: 'bank-security', type: 'judge', difficulty: 'low',
    stem: '通过邮件将公司内部资料发送给外部人员时，无需任何审批流程。',
    options: ['正确', '错误'],
    answer: [1], subject: '安全知识',
    analysis: '对外发送内部资料属于敏感操作，必须按保密制度履行审批流程。',
  },
  {
    id: 'q-06', bankId: 'bank-security', type: 'judge', difficulty: 'low',
    stem: '在公共 Wi-Fi 环境下不应处理公司敏感数据。',
    options: ['正确', '错误'],
    answer: [0], subject: '安全知识',
    analysis: '公共 Wi-Fi 存在被窃听与中间人攻击的风险，不应处理敏感数据。',
  },
  {
    id: 'q-07', bankId: 'bank-culture', type: 'single', difficulty: 'low',
    stem: '以下哪一项不属于公司的核心价值观？',
    options: ['客户第一', '诚信务实', '投机取巧走捷径', '团队合作'],
    answer: [2], subject: '企业文化',
    analysis: '公司倡导客户第一、诚信务实与团队合作；投机取巧违背价值观。',
  },
  {
    id: 'q-08', bankId: 'bank-culture', type: 'judge', difficulty: 'low',
    stem: '员工应遵守公司考勤制度，按时出勤。',
    options: ['正确', '错误'],
    answer: [0], subject: '企业文化',
    analysis: '遵守考勤制度是员工基本职责。',
  },
  {
    id: 'q-09', bankId: 'bank-culture', type: 'multiple', difficulty: 'high',
    stem: '以下哪些是公司要求全员遵守的行为准则？',
    options: ['廉洁自律', '保守商业机密', '利用职务之便谋取私利', '尊重同事'],
    answer: [0, 1, 3], subject: '企业文化',
    analysis: '廉洁自律、保密与相互尊重是基本行为准则；以权谋私为严禁行为。',
  },
  {
    id: 'q-10', bankId: 'bank-culture', type: 'single', difficulty: 'medium',
    stem: '收到客户投诉时，正确的处理方式是？',
    options: ['推诿给其他部门', '耐心倾听并按流程跟进处理', '与客户争辩对错', '不予理会'],
    answer: [1], subject: '企业文化',
    analysis: '面对投诉应耐心倾听、按流程跟进闭环处理。',
  },
];

/** 用户种子（明文密码仅用于首次生成哈希，不落库）。 */
const SEED_USERS: ReadonlyArray<{
  id: string;
  username: string;
  password: string;
  name: string;
  role: 'admin' | 'author' | 'examinee';
  departmentId: string | null;
}> = [
  { id: 'user-admin', username: 'admin', password: 'admin123', name: '系统管理员', role: 'admin', departmentId: null },
  { id: 'user-author', username: 'author', password: 'author123', name: '王出题', role: 'author', departmentId: null },
  { id: 'user-zhangsan', username: 'zhangsan', password: '123456', name: '张三', role: 'examinee', departmentId: 'dept-rd' },
  { id: 'user-lisi', username: 'lisi', password: '123456', name: '李四', role: 'examinee', departmentId: 'dept-mkt' },
  { id: 'user-wangwu', username: 'wangwu', password: '123456', name: '王五', role: 'examinee', departmentId: 'dept-rd' },
];

/**
 * 幂等写入全部种子数据（在单个事务内执行，异常自动回滚）。
 * @param conn 事务连接（PoolConnection 或普通 Connection 均可）。
 */
export async function seed(conn: Connection): Promise<void> {
  const now = nowDb();

  // 1. 科室
  for (const d of [
    { id: 'dept-rd', name: '研发部', description: '负责产品研发与技术支持' },
    { id: 'dept-mkt', name: '市场部', description: '负责市场推广与客户运营' },
  ]) {
    await conn.query(
      `INSERT INTO departments (id, name, description, created_at)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [d.id, d.name, d.description, now],
    );
  }

  // 2. 用户（bcrypt 加盐）
  for (const u of SEED_USERS) {
    const hash = await bcrypt.hash(u.password, BCRYPT_COST);
    await conn.query(
      `INSERT INTO users (id, username, password_hash, name, role, department_id, status, password_changed_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [u.id, u.username, hash, u.name, u.role, u.departmentId, now, now],
    );
  }

  // 2b. 默认角色组：用户的系统角色由所属用户组统一维护。
  for (const group of [
    { id: 'role-group-admin', name: '管理员组', role: 'admin', description: '拥有系统管理权限' },
    { id: 'role-group-author', name: '出题人组', role: 'author', description: '拥有题库、试卷与阅卷权限' },
    { id: 'role-group-examinee', name: '考生组', role: 'examinee', description: '参加考试与练题' },
  ] as const) {
    await conn.query(
      `INSERT INTO user_groups (id, name, role, description, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE role = VALUES(role)`,
      [group.id, group.name, group.role, group.description, now, now],
    );
  }
  for (const user of SEED_USERS) {
    await conn.query(
      `INSERT IGNORE INTO user_group_members (group_id, user_id, created_at)
       SELECT ?, ?, ? WHERE NOT EXISTS (
         SELECT 1 FROM user_group_members gm JOIN user_groups g ON g.id = gm.group_id
          WHERE gm.user_id = ? AND g.role = ?
       )`,
      [`role-group-${user.role}`, user.id, now, user.id, user.role],
    );
  }

  // 3. 题库（种子题库默认对外开放练题，保证练题端开箱即有可练内容）
  for (const b of [
    { id: 'bank-security', name: '安全知识题库', description: '公司信息安全相关题目', category: '安全知识' },
    { id: 'bank-culture', name: '企业文化题库', description: '公司企业文化与行为准则相关题目', category: '企业文化' },
  ]) {
    await conn.query(
      `INSERT INTO question_banks
        (id, name, description, category, allow_practice, permission_mode, view_all,
         include_child_departments, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 1, 'override', 1, 1, 'user-author', ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [b.id, b.name, b.description, b.category, now, now],
    );
  }

  // 3b. 题库-出题人授权（v1.6③；演示出题人 user-author 被授权两个示例题库）
  for (const bankId of ['bank-security', 'bank-culture']) {
    await conn.query(
      `INSERT INTO bank_authors (bank_id, user_id, created_at)
       VALUES (?, 'user-author', ?)
       ON DUPLICATE KEY UPDATE bank_id = bank_id`,
      [bankId, now],
    );
  }

  // 4. 试题（default_score = 10，created_by = user-author）
  for (const q of SEED_QUESTIONS) {
    await conn.query(
      `INSERT INTO questions
         (id, bank_id, type, stem, options, answer, default_score, analysis, subject, subject_id, difficulty, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 10.0, ?, ?, ?, ?, 'user-author', ?)
       ON DUPLICATE KEY UPDATE difficulty = ?`,
      [q.id, q.bankId, q.type, q.stem, toJsonColumn(q.options), toJsonColumn(q.answer), q.analysis, q.subject, q.bankId, q.difficulty, now, q.difficulty],
    );
  }

  // 5. 试卷
  await conn.query(
    `INSERT INTO papers (id, name, description, total_score, created_by, created_at)
     VALUES (?, ?, ?, ?, 'user-author', ?)
     ON DUPLICATE KEY UPDATE id = id`,
    [
      'paper-demo',
      '示例综合试卷（安全与企业文化）',
      '由 10 道示例题目组成的演示试卷，每题 10 分，满分 100 分。',
      100.0,
      now,
    ],
  );

  // 6. 试卷题目（10 题各 10 分，sort_order 按题号顺序）
  for (let i = 0; i < SEED_QUESTIONS.length; i += 1) {
    const q = SEED_QUESTIONS[i];
    await conn.query(
      `INSERT INTO paper_questions (paper_id, question_id, score, sort_order)
       VALUES ('paper-demo', ?, 10.0, ?)
       ON DUPLICATE KEY UPDATE paper_id = paper_id`,
      [q.id, i],
    );
  }

  // 7. 试卷-题库关联（来源题库两条）
  for (const bankId of ['bank-security', 'bank-culture']) {
    await conn.query(
      `INSERT INTO paper_bank_refs (paper_id, bank_id)
       VALUES ('paper-demo', ?)
       ON DUPLICATE KEY UPDATE paper_id = paper_id`,
      [bankId],
    );
  }

  // 8. 考试（时间窗：当前 -1h ~ +7d，动态计算；maxAttempts=2 便于演示多次作答）
  //    重复执行不覆盖时间窗等既有数据，但会把演示考试的答题次数上限刷新为 2（幂等、不报错）
  const start = new Date(Date.now() - 60 * 60 * 1000);
  const end = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await conn.query(
    `INSERT INTO exams
       (id, name, paper_id, department_ids, start_time, end_time, duration_minutes, pass_score, max_attempts, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'user-admin', ?)
     ON DUPLICATE KEY UPDATE max_attempts = VALUES(max_attempts)`,
    [
      'exam-demo',
      '示例考试：安全与企业文化',
      'paper-demo',
      toJsonColumn(['dept-rd', 'dept-mkt']),
      toDbDate(start),
      toDbDate(end),
      30,
      60.0,
      2,
      now,
    ],
  );
  await conn.query("INSERT IGNORE INTO exam_authors (exam_id, user_id) VALUES ('exam-demo', 'user-author')");
  // exam_records / import_batches 不写数据。

  // 9. 系统设置（全局单行，id = 1）。
  //    幂等：`INSERT IGNORE` 仅在行不存在时写入默认值，绝不覆盖管理员已保存的设置。
  await conn.query(
    `INSERT IGNORE INTO system_settings (id, settings, updated_by, updated_at)
     VALUES (1, ?, '', ?)`,
    [toJsonColumn(DEFAULT_SETTINGS), now],
  );
}
