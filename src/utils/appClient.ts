/** Native App adds this marker; no bridge or URL parameter can grant API permissions. */
export function isLearnerAndroidApp(userAgent = navigator.userAgent): boolean {
  return /(?:^|\s)ZhuodaLearnerAndroid\/\d+(?:\.\d+)*(?:\s|$)/.test(userAgent);
}
