# 项目文档与设计资料

当前界面采用蓝色多彩方案，设计资料集中在 `docs/ui-redesign/`。

## 当前资料

- [项目说明与运行方式](README.md)：功能概览、初始化、构建与测试。
- [当前 UI 设计规范](docs/ui-redesign/design-spec.json)：颜色、字体、布局、组件、响应式与可访问性约束。
- [共享设计 token](docs/ui-redesign/tokens.json)：主应用与练题端的共享色板。
- [页面清单](docs/ui-redesign/page-manifest.json)：页面与路由映射。
- [Figma 状态记录](docs/ui-redesign/figma-state.json)：设计文件及页面节点信息。

`docs/` 根目录保留需求、架构、功能交付说明与 Mermaid 源文件。这些文档包含分版本增量需求，不能仅凭版本较旧就认定已被完整替代；实际运行与配置以当前代码和 README 为准。

`docs/ui-redesign/` 保留当前设计源文件、生成脚本和交付资料。其 `deliverables/` 为本地生成目录，未纳入 Git，不作为仓库唯一文档入口。

## 历史资料

2026-10-16 清理了以下历史原型和验收资料：

- `docs/ui-v2.1/`、`docs/ui-v3/`、`docs/ui-v3b/`：旧版 UI 规范、原型、设计对比、审计脚本、报告与截图。
- `docs/ui-v4-sample/`：探索阶段的 UI 样稿。
- `docs/screenshots/`、`docs/screenshots-practice/`、`docs/screenshots-practice-enhance/`：历史功能验收截图及导出样本。

这些目录的文件均已记录在 Git 提交 `1c96f23` 中，需要追溯旧版设计、验收依据或审计方法时，可读取对应历史文件，例如：

```bash
git show 1c96f23:docs/ui-v3b/DESIGN-C.md
git show 1c96f23:docs/ui-v3b/tools/audit-fidelity.mjs
```

也可将单个历史目录导出为 ZIP，在工作区之外查阅：

```bash
git archive --format=zip --output=../exam-ui-v3b-history.zip 1c96f23 docs/ui-v3b
```

历史验收结果只描述当时的验证情况，不代表当前代码已重新通过测试。
