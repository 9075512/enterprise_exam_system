import { afterEach, describe, expect, it, vi } from 'vitest';
import { captureFrame, cameraErrorMessage } from './useExamCamera';
import { createCaptureId } from '@/utils/captureId';

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
describe('摄像头图片与兼容提示', () => {
  it('保留画面比例并压缩到最长边640像素的JPEG', async () => {
    let canvas: HTMLCanvasElement | undefined;
    const drawImage = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (this: HTMLCanvasElement, callback, type, quality) {
      canvas = this; expect(type).toBe('image/jpeg'); expect(quality).toBe(0.8); callback(new Blob(['photo'], { type }));
    });
    const video = { videoWidth: 1920, videoHeight: 1080, readyState: 2 } as HTMLVideoElement;
    const blob = await captureFrame(video);
    expect(canvas?.width).toBe(640); expect(canvas?.height).toBe(360); expect(blob.type).toBe('image/jpeg');
    expect(drawImage).toHaveBeenCalledWith(video, 0, 0, 640, 360);
  });
  it('无实际画面时不生成空照片；权限、设备和占用错误给出明确提示', async () => {
    await expect(captureFrame({ videoWidth: 0, videoHeight: 0, readyState: 0 } as HTMLVideoElement)).rejects.toThrow('尚未准备好');
    expect(cameraErrorMessage(new DOMException('', 'NotAllowedError'))).toContain('授权被拒绝');
    expect(cameraErrorMessage(new DOMException('', 'NotFoundError'))).toContain('未找到摄像头');
    expect(cameraErrorMessage(new DOMException('', 'NotReadableError'))).toContain('被占用');
  });
  it('普通HTTP缺少randomUUID时仍可生成可选模式的采集标识', () => {
    vi.stubGlobal('crypto', {});
    const first = createCaptureId(); const second = createCaptureId();
    expect(first).toMatch(/^[a-zA-Z0-9_-]{1,64}$/); expect(first).not.toBe(second);
  });
});
