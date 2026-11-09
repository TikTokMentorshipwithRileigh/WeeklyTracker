export const DAY_MS = 24 * 60 * 60 * 1000;
export const FOLLOW_UP_DAYS = 14;
type Member = { id: string; name: string; shop: string };
type Entry = { id: string; memberId: string; updatedAt?: string | null; archivedAt?: string | null };
type Status = 'recent' | 'overdue' | 'noCheckins' | 'unknown';
export type FollowUpRow = Member & {
 lastSavedAt: string | null; lastSavedMemberId: string | null; daysSince: number | null; archivedCount: number;
 members: Member[]; matchReasons: string[]; possibleMatches: Member[]; status: Status;
};
export type FollowUp = {
 overdue: FollowUpRow[]; noCheckins: FollowUpRow[]; unknown: FollowUpRow[]; nameMatches: FollowUpRow[];
 possibleMatches: FollowUpRow[]; recentCount: number; checkedAt: number; cutoff: number;
};
type Match = { automatic: boolean; reason: string };

// These heuristics are for the private follow-up display only, never member access or stored identities.
function words(value: string): string[] {
 return value.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/['']/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim().split(/\s+/).filter(Boolean);
}
function nameWords(value: string): string[] {
 const comma = value.split(',');
 // Support "Last, First" but do not reorder suffixes such as "First Last, Jr".
 if (comma.length === 2 && !/^(jr|sr|ii|iii|iv)\.?$/i.test(comma[1].trim())) return words(comma[1] + ' ' + comma[0]);
 return words(value);
}
function oneEdit(a: string, b: string): boolean {
 if (Math.abs(a.length - b.length) > 1 || a === b) return false;
 if (a.length === b.length) {
  const different = [...a].map((char, i) => char === b[i] ? -1 : i).filter(i => i >= 0);
  return different.length === 1 || (different.length === 2 && different[1] === different[0] + 1 && a[different[0]] === b[different[1]] && a[different[1]] === b[different[0]]);
 }
 const [short, long] = a.length < b.length ? [a, b] : [b, a];
 let i = 0; while (i < short.length && short[i] === long[i]) i++;
 return short.slice(i) === long.slice(i + 1);
}
function middleCompatible(a: string[], b: string[]): boolean {
 if (!a.length || !b.length) return true;
 return a.length === b.length && a.every((part, i) => part === b[i] || (Math.min(part.length, b[i].length) === 1 && part[0] === b[i][0]));
}
function compareNames(a: Member, b: Member): Match | null {
 const left = nameWords(a.name), right = nameWords(b.name);
 if (!left.length || !right.length) return null;
 const shopA = words(a.shop).join(''), shopB = words(b.shop).join('');
 const sameShop = Boolean(shopA && shopA === shopB);
 const fullNames = left.length >= 2 && right.length >= 2;
 if (left.join('') === right.join('') && (fullNames || sameShop)) {
  return { automatic: true, reason: 'Same name after spacing, punctuation and case normalization' };
 }
 // A first name alone is only a candidate with the same shop and a uniquely compatible full name.
 if (left.length === 1 || right.length === 1) {
  const [short, full] = left.length < right.length ? [left, right] : [right, left];
  if (sameShop && short.length === 1 && full.length >= 2 && short[0].length >= 3 && short[0] === full[0]) {
   return { automatic: true, reason: 'First name and shop match' };
  }
  return null;
 }
 const firstA = left[0], firstB = right[0], lastA = left[left.length - 1], lastB = right[right.length - 1];
 const middleA = left.slice(1, -1), middleB = right.slice(1, -1);
 if (!middleCompatible(middleA, middleB)) return null;
 if (firstA === firstB && lastA === lastB) {
  return { automatic: sameShop, reason: sameShop ? 'Name and shop match, with a middle name or initial variation' : 'Similar full name with a different shop; review before matching' };
 }
 if (lastA === lastB && Math.min(firstA.length, firstB.length) === 1 && firstA[0] === firstB[0]) {
  return { automatic: sameShop, reason: sameShop ? 'First initial, last name and shop match' : 'First initial and last name match, but the shop differs' };
 }
 if (firstA === firstB && Math.min(lastA.length, lastB.length) === 1 && lastA[0] === lastB[0]) {
  return { automatic: sameShop, reason: sameShop ? 'First name, last initial and shop match' : 'First name and last initial match, but the shop differs' };
 }
 const firstTypo = lastA === lastB && Math.min(firstA.length, firstB.length) >= 4 && oneEdit(firstA, firstB);
 const lastTypo = firstA === firstB && Math.min(lastA.length, lastB.length) >= 4 && oneEdit(lastA, lastB);
 if (firstTypo || lastTypo) {
  return { automatic: sameShop, reason: sameShop ? 'One-letter name variation with the same shop' : 'One-letter name variation with a different shop; review before matching' };
 }
 return null;
}
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
 const result: FollowUp = { overdue: [], noCheckins: [], unknown: [], nameMatches: [], possibleMatches: [], recentCount: 0, checkedAt: now, cutoff };
 const ordered = [...members].sort((a, b) => a.id.localeCompare(b.id));
 const matches = ordered.map(() => new Map<number, Match>());
 for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
  const match = compareNames(ordered[i], ordered[j]);
  if (match) { matches[i].set(j, match); matches[j].set(i, match); }
 }
 const seen = new Set<number>(), groups: number[][] = [];
 for (let i = 0; i < ordered.length; i++) {
  if (seen.has(i)) continue;
  const component = [i]; seen.add(i);
  for (let cursor = 0; cursor < component.length; cursor++) for (const [other, match] of matches[component[cursor]]) {
   if (match.automatic && !seen.has(other)) { seen.add(other); component.push(other); }
  }
  // Every pair must agree. Never chain John -> J -> Jane, or one typo into a different person.
  const unambiguous = component.every(a => component.every(b => a === b || matches[a].get(b)?.automatic));
  if (unambiguous) groups.push(component);
  else {
   // An ambiguous alias must not split otherwise certain duplicates.
   const exactGroups = new Map<string, number[]>();
   for (const index of component) {
    const member = ordered[index], parts = nameWords(member.name);
    const key = JSON.stringify([parts.join(''), parts.length >= 2 ? null : words(member.shop).join('')]);
    const exact = exactGroups.get(key) || []; exact.push(index); exactGroups.set(key, exact);
   }
   groups.push(...exactGroups.values());
  }
 }
 const byMember = new Map<string, Entry[]>();
 for (const entry of entries) { const rows = byMember.get(entry.memberId) || []; rows.push(entry); byMember.set(entry.memberId, rows); }
 for (const indexes of groups) {
  const groupMembers = indexes.map(index => ordered[index]).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const all = groupMembers.flatMap(member => byMember.get(member.id) || []), active = all.filter(entry => !entry.archivedAt);
  const dated = active.map(entry => ({ entry, time: savedTime(entry.updatedAt, now) }));
  const valid = dated.filter((item): item is { entry: Entry; time: number } => item.time !== null)
   .sort((a, b) => b.time - a.time || a.entry.id.localeCompare(b.entry.id));
  const latest = valid[0]?.time ?? null;
  const representative = groupMembers.find(member => member.id === valid[0]?.entry.memberId) || groupMembers[0];
  const possible = new Set<number>(), reasons = new Set<string>();
  for (const index of indexes) for (const [other, match] of matches[index]) {
   if (!indexes.includes(other)) possible.add(other);
   else reasons.add(match.reason);
  }
  const status: Status = !active.length ? 'noCheckins' : latest !== null && latest >= cutoff ? 'recent' : dated.some(item => item.time === null) ? 'unknown' : 'overdue';
  const row: FollowUpRow = {
   ...representative, members: groupMembers, matchReasons: [...reasons], possibleMatches: [...possible].map(index => ordered[index]),
   lastSavedAt: latest === null ? null : new Date(latest).toISOString(), lastSavedMemberId: valid[0]?.entry.memberId ?? null,
   daysSince: latest === null ? null : Math.floor((now - latest) / DAY_MS), archivedCount: all.length - active.length, status
  };
  if (status === 'recent') result.recentCount++;
  else result[status].push(row);
  if (groupMembers.length > 1) result.nameMatches.push(row);
  if (possible.size) result.possibleMatches.push(row);
 }
 result.overdue.sort((a, b) => (a.lastSavedAt || '').localeCompare(b.lastSavedAt || '') || a.name.localeCompare(b.name));
 for (const rows of [result.noCheckins, result.unknown, result.nameMatches, result.possibleMatches]) rows.sort((a, b) => a.name.localeCompare(b.name));
 return result;
}

