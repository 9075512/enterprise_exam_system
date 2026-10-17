/**
 * 管理员账号应急恢复工具。
 *
 * 仅供拥有服务器 shell 与 server/.env 读取权限的运维人员使用。密码只从
 * stdin 读取，避免出现在 shell 历史和进程参数中。恢复时会同时清除登录
 * 失败锁定、撤销已有会话，并写入一条自包含审计日志。
 *
 * 用法：
 *   printf '%s' "$NEW_PASSWORD" | npm run admin:recover -- --username admin --password-stdin
 */
import bcrypt from 'bcryptjs';
import type { RowDataPacket } from 'mysql2/promise';
import { closePool, runQuery, withTransaction } from '../db/pool.js';
import { getSettings } from '../modules/settings/settings.service.js';
import { assertPasswordPolicy } from '../utils/passwordPolicy.js';
import { genId } from '../utils/id.js';
import { nowDb } from '../utils/datetime.js';

const BCRYPT_COST = 10;
const MAX_STDIN_BYTES = 1024;

interface AdminRow extends RowDataPacket {
  id: string;
  username: string;
  name: string;
  role: string;
  status: string;
}

function usage(): string {
  return [
    '用法：npm run admin:recover -- --username <管理员账号> --password-stdin',
    '',
    '新密码必须通过标准输入传入；命令不会接受明文密码参数。',
  ].join('\n');
}

function parseUsername(args: string[]): string {
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    process.exit(0);
  }
  if (!args.includes('--password-stdin')) {
    throw new Error(`缺少 --password-stdin。\n${usage()}`);
  }
  const index = args.indexOf('--username');
  if (index < 0 || !args[index + 1]?.trim()) {
    throw new Error(`缺少 --username。\n${usage()}`);
  }
  const username = args[index + 1].trim();
  if (username.length > 64) throw new Error('管理员账号长度不能超过 64 个字符');
  return username;
}

async function readPasswordFromStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error('拒绝从交互终端读取密码，请通过管道将密码传入标准输入');
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_STDIN_BYTES) throw new Error('标准输入过长，已拒绝处理');
    chunks.push(buffer);
  }
  // 只移除管道通常附带的换行，不破坏密码中有意义的其他空白。
  return Buffer.concat(chunks).toString('utf8').replace(/[\r\n]+$/, '');
}

async function recover(username: string, password: string): Promise<void> {
  const settings = await getSettings();
  assertPasswordPolicy(password, settings);
  const passwordHash = await bcrypt.hash(password, BCRYPT_COST);
  const recoveredAt = nowDb();

  await withTransaction(async (conn) => {
    const rows = await runQuery<AdminRow[]>(
      conn,
      `SELECT id, username, name, role, status FROM users WHERE username = ? LIMIT 1 FOR UPDATE`,
      [username],
    );
    const admin = rows[0];
    if (!admin) throw new Error(`账号 "${username}" 不存在`);
    if (admin.role !== 'admin') throw new Error(`账号 "${username}" 不是管理员，拒绝恢复`);
    if (admin.status !== 'active') {
      throw new Error(`账号 "${username}" 已停用，请先由数据库管理员核实停用原因`);
    }

    await runQuery(
      conn,
      `UPDATE users SET password_hash = ?, password_changed_at = ? WHERE id = ?`,
      [passwordHash, recoveredAt, admin.id],
    );
    await runQuery(conn, `DELETE FROM login_attempts WHERE username = ?`, [username]);
    await runQuery(
      conn,
      `UPDATE user_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL`,
      [recoveredAt, admin.id],
    );
    await runQuery(
      conn,
      `INSERT INTO audit_logs
         (id, actor_id, actor_name, action, target_type, target_id, target_name, detail, created_at)
       VALUES (?, 'system:admin-recovery', '服务器恢复工具', 'user.recover_password',
               'user', ?, ?, ?, ?)`,
      [
        genId('audit-'),
        admin.id,
        admin.name,
        JSON.stringify({ username: admin.username, source: 'server-cli', sessionsRevoked: true }),
        recoveredAt,
      ],
    );
  });
}

async function main(): Promise<void> {
  const username = parseUsername(process.argv.slice(2));
  const password = await readPasswordFromStdin();
  if (!password) throw new Error('新密码不能为空');
  await recover(username, password);
  console.log(`管理员账号 "${username}" 已恢复：密码已更新、登录锁定已清除、旧会话已撤销。`);
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[admin:recover] 失败：${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closePool();
  });
