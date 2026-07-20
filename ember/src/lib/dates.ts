/** Local-timezone date keys — a "day" is a day where the phone is. */

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** YYYY-MM-DD for a Date in local time. */
export function dateKey(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(): string {
  return dateKey(new Date());
}

export function daysAgoKey(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return dateKey(d);
}

/** YYYY-MM in local time. */
export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}

/** Keys for the last `n` days, oldest first, ending today. */
export function lastNDayKeys(n: number): string[] {
  const keys: string[] = [];
  for (let i = n - 1; i >= 0; i--) keys.push(daysAgoKey(i));
  return keys;
}

/** Short label like "Mo 12" for a YYYY-MM-DD key. */
export function shortDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const names = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  return `${names[date.getDay()]} ${d}`;
}

/** Fuller label like "Thu, Jul 17" for a YYYY-MM-DD key — the year is
 * added ("Thu, Jul 17 2024") only once it isn't this year's. */
export function prettyDayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const base = `${days[date.getDay()]}, ${months[m - 1]} ${d}`;
  return y === new Date().getFullYear() ? base : `${base} ${y}`;
}

/** Deterministic non-negative hash — both phones pick the same daily item. */
export function stableHash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}
