# 10 · PRD v1.6 —— 考试系统增强（防作弊 / 题型 / 组织权限 / 数据运营）

> 版本目标：在 v1.5 完整闭环之上，补齐四块能力。按「低风险高价值优先、耦合度递进」分四期交付，每期独立落地（实现 + 测试 + 提交）。
> 贯穿原则不变：**能做开关/阈值的，一律配置化**，放在对应位置。

---

## 1. 四期范围与进度

| 期 | 功能块 | 关键点 | 状态 |
| --- | --- | --- | --- |
| ① 防作弊与公平性 | 答题页浮水印 + 复制/粘贴限制 + 切屏审查页 | 后台可配置；切屏审查独立视图 | ✅ 已完成 |
| ② 题型扩展与人工阅卷 | 填空/简答 + 主观题阅卷流 | 全链路题型扩展，`pending_review` 状态 | ✅ 已完成 |
| ③ 组织与权限精细化 | 多级科室树 + 出题人题库授权 | 父子科室、题库负责人映射 | ✅ 已完成 |
| ④ 数据运营与审计 | 操作审计日志 + PDF 导出 + 趋势归因 | 审计表、PDF、看板趋势 | ✅ 已完成 |

---

## 2. ① 防作弊与公平性（已完成）

### 2.1 配置新增（`system_settings`，「考试规则」Tab）

| 字段 | 类型 | 默认 | 说明 |
| --- | --- | --- | --- |
| `cheatWatermarkEnabled` | bool | true | 答题页铺陈「姓名 + 账号」淡浮水印 |
| `cheatCopyGuardEnabled` | bool | true | 答题页禁用复制/剪切/右键/文本选择/拖拽 |

### 2.2 答题页行为（`ExamTakingPage`）

- **浮水印**：`pointer-events:none` 的全屏 fixed 覆盖层，斜排重复「姓名 账号」，`z-index` 介于吸顶栏与弹窗之间，不影响作答。
- **复制限制**：根容器绑定 `copy/cut/contextmenu/selectstart/dragstart` 守卫，仅在 `cheatCopyGuardEnabled` 开启时 `preventDefault`（响应式，无需手动绑定/解绑）。

### 2.3 切屏审查页（成绩报表新增「切屏审查」Tab）

- 后端 `GET /api/records/cheat?examId=`（admin）：返回该考试「含切屏事件的已交卷记录」，附带姓名/科室，按切屏次数降序（上限 500）。
- 前端成绩报表新增第 5 个 Tab「切屏审查」：汇总列表 + 展开行展示每条 `cheatEvents` 时间线（发生时间 / 离开秒数）。
- 实现要点：路由 `/cheat` 注册在 `/:id` 之前避免被参数路由抢先匹配；复用 `ExamRecordDetailRow` + `mapRecordDetailRow`。

---

## 3. ② 题型扩展与人工阅卷（已完成）

- `questions.type` 扩 `fill`（填空，自动判分）、`short`（简答，人工阅卷）。
- 填空 `answer` = 文本数组（逐空参考答案），自动判分：`trim` + 忽略大小写逐空匹配。
- 简答 `answer` = 参考答案文本，交卷后记录进 `pending_review`，客观题先行计分。
- 迁移：`ALTER TABLE questions MODIFY type ENUM(...)`（幂等）；`exam_records.status` 增 `pending_review`。
- 阅卷：`GET /records/pending`（待阅卷列表，admin）、`PUT /records/:id/review`（逐题主观分 + 重算总分）。
- 贯穿：题库 CRUD/导入/组卷/快照/判分/答题/成绩明细/报表。

---

## 4. ③ 组织与权限精细化（已完成）

- **多级科室树**：`departments` 增 `parent_id`（自引用），支持父子结构；用户可归属叶子/任意节点。
  - 考试参与科室按树级联授权：考生科室的**祖先链**命中考试所选科室即视为参与（选中父科室自动覆盖整棵子树），发布通知同步覆盖子树。
  - 防环：禁止自引用 / 挂到子孙节点；删除时存在子科室或归属用户 → 1005。
- **出题人题库授权**：新增 `bank_authors`（bank_id ↔ user_id）映射表。
  - `author` 仅能管理被授权题库：列表隔离 + 详情/试题/导入/组卷/抽题/迁移等写操作校验（`bankAuth.assertBankAccess`）。
  - admin 在题库表单中维护「授权出题人」；author 新建题库自动授权自己；种子数据将演示出题人 `user-author` 授权到两个示例题库。

---

## 5. ④ 数据运营与审计（已完成）

- **操作审计日志**：`audit_logs` 表（actor_id/actor_name/action/target_type/target_id/target_name/detail/created_at，自包含、无外键）。
  - 关键操作落日志：用户（建/改/删/重置密码）、考试（建/改/删）、题库（建/改/删/迁移试题）、菜单权限（更新）。
  - 统一入口 `audit.service.record()`，fail-open（审计失败不阻断主业务）；`GET /api/audit-logs`（admin）按动作/目标类型/关键字/时间范围过滤 + 分页。
- **PDF 导出**：`GET /api/reports/exams/:id/export-pdf`，复用成绩导出的列白名单；`utils/pdfExport.ts`（pdfkit + 中文字体解析 + 表格自动分页）；前端导出弹窗支持 Excel / PDF 格式切换。
- **看板趋势与归因**：`GET /api/reports/dashboard`（及格率时间趋势 + 按科目错题归因）；前端数据总览页 ECharts 双轴折线（及格率/平均分）+ 科目错题率柱状图。

---

## 6. 数据库变更汇总

**①（已落地）**：无新表（复用 `exam_records.cheat_events`）；仅 `system_settings` 增 2 个 JSON 字段。

**②（已落地）**：`questions.type` enum 增 `fill/short`；`exam_records.status` 增 `pending_review`；新增 `exam_records.subjective_scores` 主观题得分列。

**③（已落地）**：`departments` 增 `parent_id`（自引用）；新增 `bank_authors`。

**④（已落地）**：新增 `audit_logs`。

---

## 7. 验收标准（节选）

- ① 关闭 `cheatWatermarkEnabled`：答题页无浮水印；开启：浮水印可见且不遮挡内容。关闭 `cheatCopyGuardEnabled`：可正常复制；开启：复制/右键/选择被拦截。切屏审查 Tab 只列出有切屏记录的考生，时间线展开正确。
- ② 填空题 trim+忽略大小写判分；简答题交卷进待阅卷，阅卷后总分 = 客观 + 主观。
- ③ 子科室考试自动覆盖父科室考生；出题人无法访问未授权题库。
- ④ 关键操作留痕可查；PDF 导出可下载；趋势图数据正确。
