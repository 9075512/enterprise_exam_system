/**
 * 富文本附件 API（v1.8④ U4）。
 *
 * 简答作答的图片先上传到服务端对象存储，再以站内 URL 回填到富文本里，
 * 从而避免 `data:image/...;base64` 内联导致请求体膨胀。
 */
import { upload } from './http';
import type { Attachment } from '@/types';

/**
 * 上传图片附件（multipart，字段名 `file`）。
 *
 * 说明：类型与体积上限由后端按系统设置校验（前端仅做友好提示），
 * 返回值中的 `url` 已带签名，可直接用于 `<img src>`。
 */
export function uploadImage(file: File): Promise<Attachment> {
  const form = new FormData();
  form.append('file', file);
  return upload<Attachment>('/attachments', form);
}
