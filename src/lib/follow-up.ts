export const DAY_MS = 24 * 60 * 60 * 1000;
export const FOLLOW_UP_DAYS = 14;
type Member = { id: string; name: string; shop: string };
type Entry = { id: string; memberId: string; updatedAt?: string | null; archivedAt?: string | null };
export type FollowUpRow = Member & { lastSavedAt: string | null; daysSince: number | null; archivedCount: number };
export type FollowUp = { overdue: FollowUpRow[]; noCheckins: FollowUpRow[]; unknown: FollowUpRow[]; recentCount: number; checkedAt: number; cutoff: number };
function savedTime(value: unknown, now: number): number | null {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) return null;
 const day = new Date(value.slice(0,10)+'T12:00:00Z');
 if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0,10) !== value.slice(0,10)) return null;
 const parsed = Date.parse(value);
 return Number.isFinite(parsed) && parsed <= now ? parsed : null;
}
export function buildFollowUp(members: Member[], entries: Entry[], now = Date.now()): FollowUp {
 if (!Number.isFinite(now)) throw new Error('A valid current time is required.');
 const cutoff = now - FOLLOW_UP_DAYS * DAY_MS;
 const result: FollowUp = { overdue: [], noCheckins: [], unknown: [], recentCount: 0, checkedAt: now, cutoff };
 const byMember = new Map<string, Entry[]>();
 for (const entry of entries) { const rows = byMember.get(entry.memberId) || []; rows.push(entry); byMember.set(entry.memberId, rows); }
 for (const member of members) {
  const all = byMember.get(member.id) || [], active = all.filter(entry => !entry.archivedAt);
  const dates = active.map(entry => savedTime(entry.updatedAt, now));
  const valid = dates.filter((value): value is number => value !== null);
  const latest = valid.length ? Math.max(...valid) : null;
  const row: FollowUpRow = { ...member, lastSavedAt: latest === null ? null : new Date(latest).toISOString(), daysSince: latest === null ? null : Math.floor((now - latest) / DAY_MS), archivedCount: all.length - active.length };
  if (!active.length) result.noCheckins.push(row);
  else if (latest !== null && latest >= cutoff) result.recentCount++;
  else if (dates.includes(null)) result.unknown.push(row);
  else result.overdue.push(row);
 }
 result.overdue.sort((a, b) => (a.lastSavedAt || '').localeCompare(b.lastSavedAt || '') || a.name.localeCompare(b.name));
 for (const rows of [result.noCheckins, result.unknown]) rows.sort((a, b) => a.name.localeCompare(b.name));
 return result;
}
