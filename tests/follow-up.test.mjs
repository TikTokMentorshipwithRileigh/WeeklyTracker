import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildFollowUp,DAY_MS} from '../src/lib/follow-up.ts';
const now=Date.parse('2026-11-09T16:00:00.000Z');
const m=id=>({id,name:id,shop:id+' Shop'});
const e=(memberId,days,other={})=>({id:memberId+'-'+days,memberId,updatedAt:new Date(now-days*DAY_MS).toISOString(),...other});
test('14 day rolling threshold is inclusive and uses latest saved check-in, not reporting week',()=>{
 const result=buildFollowUp([m('old'),m('boundary'),m('recent')],[e('old',14+1/86400000),e('boundary',14),e('recent',20),e('recent',1,{endDate:'2020-01-05'})],now);
 assert.deepEqual(result.overdue.map(x=>x.id),['old']);assert.equal(result.recentCount,2);
});
test('never checked in and Trash-only members are separate from overdue',()=>{
 const result=buildFollowUp([m('never'),m('trashed'),m('old')],[e('trashed',1,{archivedAt:'2026-11-09'}),e('old',20),e('old',1,{archivedAt:'2026-11-09'})],now);
 assert.deepEqual(result.overdue.map(x=>x.id),['old']);assert.deepEqual(result.noCheckins.map(x=>x.id),['never','trashed']);assert.equal(result.noCheckins[1].archivedCount,1);
});
test('missing, malformed and future saved dates require review rather than false overdue flags',()=>{
 for(const updatedAt of [undefined,null,'not a date','2026-02-30T12:00:00Z','2026-11-08','2026-11-10T16:00:00Z']){
  const result=buildFollowUp([m('unknown')],[e('unknown',20),{id:'u',memberId:'unknown',updatedAt}],now);
  assert.equal(result.overdue.length,0);assert.equal(result.unknown.length,1);
 }
 const result=buildFollowUp([m('recent')],[e('recent',1),{id:'u',memberId:'recent'}],now);assert.equal(result.recentCount,1);
});
test('handles empty data, equal names, orphan entries and oldest-first sorting without mutation',()=>{
 const members=[m('newer'),m('oldest')],entries=[e('newer',20),e('oldest',40),e('orphan',60)],snapshot=JSON.stringify({members,entries});
 assert.deepEqual(buildFollowUp(members,entries,now).overdue.map(x=>x.id),['oldest','newer']);
 assert.equal(JSON.stringify({members,entries}),snapshot);assert.equal(buildFollowUp([],[],now).recentCount,0);
 assert.throws(()=>buildFollowUp([],[],NaN),/valid current time/);
});
test('offset timestamps compare as instants across daylight-saving changes',()=>{
 const result=buildFollowUp([m('recent')],[{id:'r',memberId:'recent',updatedAt:'2026-10-26T11:00:00-05:00'}],now);
 assert.equal(result.recentCount,1);assert.equal(result.overdue.length,0);
});
