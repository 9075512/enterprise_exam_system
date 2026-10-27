/** Native App adds this marker; no bridge or URL parameter can grant API permissions. */
export function isLearnerAndroidApp(userAgent = navigator.userAgent): boolean {
  return /(?:^|\s)ZhuodaLearnerAndroid\/\d+(?:\.\d+)*(?:\s|$)/.test(userAgent);
}

export function installedAppVersion(userAgent = navigator.userAgent): { name: string; code?: number } | null {
  const version = userAgent.match(/(?:^|\s)ZhuodaLearnerAndroid\/(\d+(?:\.\d+)*)(?:\s|$)/);
  if (!version) return null;
  const build = userAgent.match(/(?:^|\s)ZhuodaLearnerBuild\/(\d+)(?:\s|$)/);
  return { name: version[1]!, ...(build && Number.isSafeInteger(Number(build[1])) ? { code: Number(build[1]) } : {}) };
}
export function newerAppVersion(release: { versionName: string; versionCode: number }, installed: { name: string; code?: number }): boolean {
  if (installed.code !== undefined) return release.versionCode > installed.code;
  // Old shells provide only versionName; historical distribution metadata used a different versionCode scheme.
  const next = release.versionName.match(/^\d+(?:\.\d+)*$/) ? release.versionName.split('.').map(Number) : [];
  if (!next.length) return false;
  const current = installed.name.split('.').map(Number);
  for (let i = 0; i < Math.max(next.length, current.length); i++) {
    if ((next[i] ?? 0) !== (current[i] ?? 0)) return (next[i] ?? 0) > (current[i] ?? 0);
  }
  return false;
}
export function validAppDownloadPath(path: string): boolean {
  return /^\/api\/apps\/releases\/[a-f0-9-]{36}\/download$/.test(path);
}
