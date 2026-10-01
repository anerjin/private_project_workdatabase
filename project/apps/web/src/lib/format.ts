const relative = new Intl.RelativeTimeFormat('ko', { numeric: 'auto' });

export function timeAgo(iso: string, now = Date.now()): string {
  const seconds = Math.round((new Date(iso).getTime() - now) / 1000);
  const abs = Math.abs(seconds);
  if (abs < 45) return '방금';
  if (abs < 60 * 45) return relative.format(Math.round(seconds / 60), 'minute');
  if (abs < 60 * 60 * 20) return relative.format(Math.round(seconds / 3600), 'hour');
  if (abs < 60 * 60 * 24 * 6) return relative.format(Math.round(seconds / 86400), 'day');
  // 좁은 메뉴에서도 제목이 보이도록 짧게: 올해면 "9월 25일", 아니면 "25. 3. 15."
  const date = new Date(iso);
  const sameYear = date.getFullYear() === new Date(now).getFullYear();
  return date.toLocaleDateString('ko-KR', sameYear ? { month: 'short', day: 'numeric' } : { year: '2-digit', month: 'numeric', day: 'numeric' });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function formatDate(isoOrDay: string): string {
  return new Date(isoOrDay).toLocaleDateString('ko-KR', { year: 'numeric', month: 'short', day: 'numeric' });
}

/** 한 주(7일) 안인가 */
export function withinDays(iso: string, days: number, now = Date.now()): boolean {
  return now - new Date(iso).getTime() <= days * 86_400_000;
}

export function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function safeFileName(name: string): string {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim().slice(0, 80) || 'knowledge';
}

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function isWebUrl(url: string | undefined): url is string {
  return !!url && /^https?:\/\//i.test(url);
}

/** 점수(0~1)를 퍼센트 문자열로 */
export function percent(score: number): string {
  return `${Math.round(score * 100)}%`;
}
