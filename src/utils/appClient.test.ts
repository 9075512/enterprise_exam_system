import { describe, expect, it } from 'vitest';
import { isLearnerAndroidApp } from './appClient';

describe('Android learner client detection', () => {
  it('recognizes the native user agent marker', () => {
    expect(isLearnerAndroidApp('Mozilla/5.0 (Linux; Android 15; wv) ZhuodaLearnerAndroid/1.0.0')).toBe(true);
  });
  it('does not affect regular browsers or unrelated markers', () => {
    expect(isLearnerAndroidApp('Mozilla/5.0 (Linux; Android 15) Chrome/130.0')).toBe(false);
    expect(isLearnerAndroidApp('OtherZhuodaLearnerAndroid/1.0.0')).toBe(false);
    expect(isLearnerAndroidApp('ZhuodaLearnerAndroid/unknown')).toBe(false);
  });
});
