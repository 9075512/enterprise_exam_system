/** Internal content fixtures for tests of grading, retakes, reports and attachments.
 * Production exam creation always submits content directly through /api/exams.
 */
import * as papers from '../modules/papers/papers.service.js';
import * as repo from '../modules/papers/papers.repo.js';

export async function examContent(paperId: string) {
  return {
    authorIds: ['user-author'],
    bankIds: await repo.listBankRefs(paperId),
    questions: (await repo.listPaperQuestions(paperId)).map(q => ({ questionId: q.question_id, score: Number(q.score) })),
  };
}

export async function createPaperFixture(input: Parameters<typeof papers.create>[0]) {
  const data = await papers.create(input, { id: 'user-admin', role: 'admin' });
  return { body: { code: 0, data } };
}
