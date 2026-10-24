import { query } from '../../db/pool.js';
import { APP_RELEASE_DDL } from './apps.ddl.js';

/** Validate all columns used by the API with SELECT permission only. */
export async function checkAppReleaseSchema(): Promise<void> {
  await query(`SELECT id, app_name, version_name, version_code, min_android, release_notes,
    file_key, file_size, sha256, status, revision, download_count, created_by,
    created_at, updated_at, published_at FROM app_releases LIMIT 0`);
}

/** Existing installations need no CREATE privilege; only a missing table requires migration credentials. */
export async function ensureAppReleaseSchema(): Promise<void> {
  try { await checkAppReleaseSchema(); }
  catch (error) {
    if ((error as { code?: string }).code !== 'ER_NO_SUCH_TABLE') throw error;
    await query(APP_RELEASE_DDL);
    await checkAppReleaseSchema();
  }
}
