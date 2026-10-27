import { afterEach, describe, expect, it, vi } from 'vitest';
import { consumeStartCapture, rememberStartCapture } from './examCaptureHandoff';
afterEach(() => vi.useRealTimers());
describe('开考照片交接', () => {
  it('仅对对应答卷生效且只能消费一次，刷新没有持久化回执', () => {
    rememberStartCapture('r1');
    expect(consumeStartCapture('another-record')).toBe(false);
    expect(consumeStartCapture('r1')).toBe(true);
    expect(consumeStartCapture('r1')).toBe(false);
  });
  it('过期回执不抑制重新进入时的补拍', () => {
    vi.useFakeTimers(); rememberStartCapture('r2'); vi.advanceTimersByTime(60001);
    expect(consumeStartCapture('r2')).toBe(false);
  });
});
