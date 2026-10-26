export const downloadDesigns = [
  { id: 'a', name: '简洁下载中心', description: '清晰直接，下载优先', color: 'light' },
  { id: 'b', name: '精致品牌展示', description: '正式采用 · 留白与品牌色', color: 'blue' },
  { id: 'c', name: '深色科技风', description: '深海军蓝，沉浸式学习空间', color: 'dark' },
  { id: 'd', name: '自然编辑风', description: '暖白与深绿，慢一点也在前进', color: 'sage' },
  { id: 'e', name: '活力海报风', description: '大字与鲜明分区，学习即刻发生', color: 'poster' },
] as const;

export type DownloadDesignId = typeof downloadDesigns[number]['id'];
export function resolveDownloadDesign(value: unknown): DownloadDesignId {
  return downloadDesigns.find(item => item.id === value)?.id ?? 'b';
}
