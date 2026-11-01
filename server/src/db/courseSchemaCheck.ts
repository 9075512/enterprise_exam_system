import { query } from './pool.js';

/** Read-only deployment preflight, usable by the existing SELECT-only schema check account. */
export async function checkCourseSchema(): Promise<void> {
  await query('SELECT id, audience_json FROM courses LIMIT 0');
}
