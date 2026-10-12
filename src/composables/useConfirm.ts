/**
 * 二次确认封装（ElMessageBox.confirm），返回 Promise<boolean>。
 */
import { ElMessageBox } from 'element-plus';

export interface ConfirmOptions {
  title?: string;
  confirmButtonText?: string;
  cancelButtonText?: string;
  type?: 'warning' | 'info' | 'success' | 'error';
}

export function useConfirm() {
  /**
   * 弹出确认框。
   * @returns 用户点击「确定」为 true，取消/关闭为 false
   */
  async function confirm(message: string, options: ConfirmOptions = {}): Promise<boolean> {
    try {
      await ElMessageBox.confirm(message, options.title ?? '提示', {
        confirmButtonText: options.confirmButtonText ?? '确定',
        cancelButtonText: options.cancelButtonText ?? '取消',
        type: options.type ?? 'warning',
      });
      return true;
    } catch {
      return false;
    }
  }

  return { confirm };
}
