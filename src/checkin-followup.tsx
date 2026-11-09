import React, { useState } from 'react';
import { buildFollowUp } from './lib/follow-up';
type Props = { members: { id:string; name:string; shop:string }[]; entries: { id:string; memberId:string; updatedAt?:string|null; archivedAt?:string|null }[]; now:number; onOpen:(id:string)=>void };
const date = (value:string|number) => new Date(value).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric', timeZone:'America/Chicago' });
export default function CheckinFollowUp({members,entries,now,onOpen}:Props) {
 const [view,setView] = useState<'overdue'|'noCheckins'|'unknown'>('overdue');
 const followUp = buildFollowUp(members,entries,now), rows = followUp[view];
 return <section className="panel followup-panel" aria-labelledby="followup-title">
  <div className="section-heading"><div><div className="eyebrow">KEEP EVERYONE CONNECTED</div><h2 id="followup-title">Check-in follow-up</h2></div><span className="followup-count">{followUp.overdue.length} overdue</span></div>
  <p>No active check-in saved in the last 14 days. Looks across all weeks and members, independent of the filters below.</p>
  <p className="admin-table-help">Based on the last time a check-in was saved, including edits, not the week being reported. Trash is excluded. Dates are shown in Central time.</p>
  <div className="followup-tabs" role="group" aria-label="Follow-up categories">
   <button type="button" className={view==='overdue'?'admin-tab active':'admin-tab'} aria-pressed={view==='overdue'} onClick={()=>setView('overdue')}>Over 14 days ({followUp.overdue.length})</button>
   <button type="button" className={view==='noCheckins'?'admin-tab active':'admin-tab'} aria-pressed={view==='noCheckins'} onClick={()=>setView('noCheckins')}>No recorded check-in ({followUp.noCheckins.length})</button>
   {followUp.unknown.length>0&&<button type="button" className={view==='unknown'?'admin-tab active':'admin-tab'} aria-pressed={view==='unknown'} onClick={()=>setView('unknown')}>Date needs review ({followUp.unknown.length})</button>}
  </div>
  {view==='noCheckins'&&<p>Listed separately, not counted as overdue: these members have no active check-in on record. Their enrollment date is not used to assume they are late.</p>}
  {view==='unknown'&&<p>A saved date is missing, invalid, or in the future, so these members are not automatically counted as overdue.</p>}
  {rows.length>0?<div className="admin-table-wrap followup-table-wrap"><table className="admin-table"><thead><tr><th>Member / shop</th><th>Last saved check-in</th><th>Status</th></tr></thead><tbody>{rows.map(member=><tr key={member.id}><td><button type="button" className="member-open" onClick={()=>onOpen(member.id)}>{member.name}</button><small>{member.shop}</small></td><td>{member.lastSavedAt?date(member.lastSavedAt):'None on record'}</td><td>{view==='overdue'?member.daysSince+' days ago':view==='unknown'?'Review check-in dates':member.archivedCount?'All check-ins are in Trash':'No check-ins yet'}</td></tr>)}</tbody></table></div>:<p className="followup-empty" role="status">{view==='overdue'?'No members with dated check-ins are overdue.':view==='noCheckins'?'Every member has an active check-in on record.':'No check-in dates need review.'}</p>}
  <small className="followup-footer">{followUp.recentCount} checked in within 14 days · Checked {date(now)} · Refresh to fetch new submissions.</small>
 </section>;
}
