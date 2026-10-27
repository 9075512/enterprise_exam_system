import { describe, expect, it } from 'vitest';
import { installedAppVersion, isLearnerAndroidApp, newerAppVersion, validAppDownloadPath } from './appClient';

describe('Android learner client detection', () => {
  it('读取新客户端内部版本号，并兼容旧版仅有展示版本号的 UA', () => {
    expect(installedAppVersion('Android 15 ZhuodaLearnerAndroid/1.0.6 ZhuodaLearnerBuild/10006')).toEqual({ name: '1.0.6', code: 10006 });
    expect(installedAppVersion('Android 15 ZhuodaLearnerAndroid/1.0.5')).toEqual({ name: '1.0.5' });
    expect(installedAppVersion('Chrome/130.0')).toBeNull();
  });
  it('内部版本号优先；旧版按数字版本比较，避免字典序与旧元数据误报', () => {
    expect(newerAppVersion({ versionName: '1.0.6', versionCode: 10006 }, { name: '1.0.6', code: 10006 })).toBe(false);
    expect(newerAppVersion({ versionName: '1.0.7', versionCode: 10007 }, { name: '1.0.6', code: 10006 })).toBe(true);
    expect(newerAppVersion({ versionName: '1.0.4', versionCode: 2 }, { name: '1.0.4' })).toBe(false);
    expect(newerAppVersion({ versionName: '1.0.10', versionCode: 10010 }, { name: '1.0.9' })).toBe(true);
    expect(newerAppVersion({ versionName: '1.0.5', versionCode: 10005 }, { name: '1.0.6' })).toBe(false);
  });
  it('更新链接必须为固定公开安装包路径', () => {
    expect(validAppDownloadPath('/api/apps/releases/9432b2ba-14fe-40e6-aa62-2502614a4b38/download')).toBe(true);
    for (const url of ['https://evil.test/app.apk', '//evil.test/app.apk', '/login', 'javascript:alert(1)']) expect(validAppDownloadPath(url)).toBe(false);
  });
  it('recognizes the native user agent marker', () => {
    expect(isLearnerAndroidApp('Mozilla/5.0 (Linux; Android 15; wv) ZhuodaLearnerAndroid/1.0.0')).toBe(true);
  });
  it('does not affect regular browsers or unrelated markers', () => {
    expect(isLearnerAndroidApp('Mozilla/5.0 (Linux; Android 15) Chrome/130.0')).toBe(false);
    expect(isLearnerAndroidApp('OtherZhuodaLearnerAndroid/1.0.0')).toBe(false);
    expect(isLearnerAndroidApp('ZhuodaLearnerAndroid/unknown')).toBe(false);
  });
});
