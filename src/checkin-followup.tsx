import React, { useMemo, useState } from 'react';
import { buildFollowUp, type FollowUpRow } from './lib/follow-up';
type Props = { members: { id:string; name:string; shop:string }[]; entries: { id:string; memberId:string; updatedAt?:string|null; archivedAt?:string|null }[]; now:number; onOpen:(id:string)=>void };
const date = (value:string|number) => new Date(value).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', timeZone:'America/Chicago' });
function status(row: FollowUpRow) {
 return row.status === 'recent' ? 'Checked in within 14 days' : row.status === 'overdue' ? row.daysSince + ' days ago' : row.status === 'unknown' ? 'Review check-in dates' : row.archivedCount ? 'All check-ins are in Trash' : 'No check-ins yet';
}
export default function CheckinFollowUp({members,entries,now,onOpen}:Props) {
 const [view,setView] = useState<'overdue'|'noCheckins'|'unknown'|'nameMatches'|'possibleMatches'>('overdue');
 const followUp = useMemo(() => buildFollowUp(members,entries,now), [members,entries,now]), rows = followUp[view];
 const tabs = [['overdue','Over 14 days'],['noCheckins','No recorded check-in'],['unknown','Date needs review'],['nameMatches','Matched names'],['possibleMatches','Possible matches']] as const;
 return <section className="panel followup-panel" aria-labelledby="followup-title">
  <div className="section-heading"><div><div className="eyebrow">KEEP EVERYONE CONNECTED</div><h2 id="followup-title">Check-in follow-up</h2></div><span className="followup-count">{followUp.overdue.length} overdue</span></div>
  <p>No active check-in saved in the last 14 days. Looks across all weeks and members, independent of the filters below.</p>
  <p className="admin-table-help">Clear name variants count as one person here, using the newest saved check-in across those records. Exact names ignore case, accents, spacing and punctuation; abbreviations or small typos also need a matching shop. Ambiguous matches stay separate for review. This does not merge records or change member access.</p>
  <p className="admin-table-help">Based on when a check-in was saved, including edits, not the week being reported. Trash is excluded. Dates are shown in Central time.</p>
  <div className="followup-tabs" role="group" aria-label="Follow-up categories">
   {tabs.map(([key,label]) => <button key={key} type="button" className={view===key?'admin-tab active':'admin-tab'} aria-pressed={view===key} onClick={()=>setView(key)}>{label} ({followUp[key].length})</button>)}
  </div>
  {view==='noCheckins'&&<p>Listed separately, not counted as overdue: these people have no active check-in on any matched record. Enrollment dates are not used to assume they are late.</p>}
  {view==='unknown'&&<p>A saved date is missing, invalid, or in the future, so these people are not automatically counted as overdue.</p>}
  {view==='nameMatches'&&<p>These name variants are counted together for follow-up only. A recent check-in under any listed name prevents a false missing flag. Open any name to review its original records.</p>}
  {view==='possibleMatches'&&<p>These similarities are not strong enough to count together. Their follow-up status still uses only their own matched records, so an unrelated person cannot hide an overdue check-in.</p>}
  {rows.length>0?<div className="admin-table-wrap followup-table-wrap"><table className="admin-table"><thead><tr><th>Member / shop</th><th>Last saved check-in</th><th>Status</th></tr></thead><tbody>{rows.map(member=><tr key={member.members.map(m=>m.id).join('|')}><td>
   {member.members.map(m=><div key={m.id}><button type="button" className="member-open" onClick={()=>onOpen(m.id)}>{m.name}</button><small>{m.shop}</small></div>)}
   {member.members.length>1&&<small><strong>{member.members.length} records counted together.</strong> {member.matchReasons.join('. ')}.</small>}
   {member.possibleMatches.length>0&&<div><small><strong>Possible matches, not counted together:</strong></small>{member.possibleMatches.map(m=><div key={m.id}><button type="button" className="member-open" onClick={()=>onOpen(m.id)}>{m.name}</button><small>{m.shop}</small></div>)}</div>}
  </td><td>{member.lastSavedAt?<button type="button" className="member-open" onClick={()=>onOpen(member.lastSavedMemberId!)} aria-label={'Open latest check-in record for '+member.name}>{date(member.lastSavedAt)}</button>:'None on record'}</td><td>{status(member)}{member.possibleMatches.length>0&&<small>Name match needs review</small>}</td></tr>)}</tbody></table></div>:<p className="followup-empty" role="status">{view==='overdue'?'No people with dated check-ins are overdue.':view==='noCheckins'?'Every person has an active check-in on record.':view==='unknown'?'No check-in dates need review.':view==='nameMatches'?'No clear name variants found.':'No uncertain name matches need review.'}</p>}
  <small className="followup-footer">{followUp.recentCount} people checked in within 14 days � Matched name variants count once � Checked {date(now)} � Refresh to fetch new submissions.</small>
 </section>;
}

