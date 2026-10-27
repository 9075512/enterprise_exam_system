// A successful start request already saved its photo. This one-use, in-memory
// receipt avoids a second photo when navigating to the answer page. A refresh
// has no receipt and still takes the required resume photo.
let receipt: { recordId: string; savedAt: number } | undefined;
export function rememberStartCapture(recordId: string): void {
  receipt = { recordId, savedAt: Date.now() };
}
export function consumeStartCapture(recordId: string): boolean {
  const current = receipt;
  if (!current) return false;
  if (Date.now() - current.savedAt > 60000) { receipt = undefined; return false; }
  if (current.recordId !== recordId) return false;
  receipt = undefined;
  return true;
}
