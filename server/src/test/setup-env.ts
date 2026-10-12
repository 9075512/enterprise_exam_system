/**
 * 测试环境变量注入（vitest setupFiles）。
 * 必须在任何业务模块（config/env、db/pool）被导入之前执行：
 * 将 DB_NAME 指向测试库，避免污染开发库 enterprise_exam_system。
 * dotenv 不覆盖已存在的 process.env 值，故此处先设置即可生效。
 */
process.env.NODE_ENV = 'test';
process.env.DB_NAME = process.env.DB_NAME_TEST || 'enterprise_exam_system_test';

export {};
