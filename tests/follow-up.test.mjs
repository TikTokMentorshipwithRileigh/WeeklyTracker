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

const person=(id,name,shop='Example Shop')=>({id,name,shop});
test('normalizes full-name case, accents, punctuation, spacing and comma order across shops',()=>{
 const members=[
  person('a','  Zoë O’Connell ','Old Shop'),person('b',"ZOE O'CONNELL",'New Shop'),person('c','OConnell, Zoe','Other Shop')
 ];
 const snapshot=JSON.stringify(members),entries=[e('a',30),e('b',1)];
 const result=buildFollowUp(members,entries,now);
 assert.equal(result.overdue.length,0);assert.equal(result.noCheckins.length,0);assert.equal(result.recentCount,1);
 assert.equal(result.nameMatches.length,1);assert.equal(result.nameMatches[0].members.length,3);
 assert.equal(result.nameMatches[0].lastSavedMemberId,'b');assert.equal(result.nameMatches[0].lastSavedAt,entries[1].updatedAt);
 assert.equal(JSON.stringify(members),snapshot);
});
test('hyphen and split-name variants count together but suffixes remain distinct',()=>{
 const result=buildFollowUp([person('a','Anne-Marie Jones'),person('b','Anne Marie Jones'),person('c','Anne-Marie Jones Jr')],[e('b',1),e('c',30)],now);
 assert.equal(result.recentCount,1);assert.deepEqual(result.overdue.map(x=>x.id),['c']);
 assert.deepEqual(result.nameMatches[0].members.map(x=>x.id).sort(),['a','b']);
});
test('same-shop middle names, initials, first-name-only and one-letter typos use the latest check-in',()=>{
 for(const [a,b] of [
  ['Alex Morgan','Alex J Morgan'],['Alex James Morgan','Alex J Morgan'],['Alex Morgan','A Morgan'],
  ['Alex Morgan','Alex'],['Alex Morgan','Alex M'],['Alex Morgan','Aelx Morgan'],['Alex Morgan','Alex Mrogan'],
  ['Alex Morgan','Alex Morgann'],['Alex Morgan','Alex Mogan'],['Alex Morgan','Alix Morgan']
 ]){
  const result=buildFollowUp([person('a',a,'@Example.Shop'),person('b',b,'example shop')],[e('a',30),e('b',1)],now);
  assert.equal(result.overdue.length,0,a+' / '+b);assert.equal(result.noCheckins.length,0,a+' / '+b);
  assert.equal(result.recentCount,1,a+' / '+b);assert.equal(result.nameMatches.length,1,a+' / '+b);
 }
});
test('differing-shop typos and initials are review-only and cannot hide a genuine overdue record',()=>{
 for(const variant of ['Aelx Morgan','Alex Mrogan','Alex J Morgan','A Morgan']){
  const result=buildFollowUp([person('a','Alex Morgan','Shop A'),person('b',variant,'Shop B')],[e('a',30),e('b',1)],now);
  assert.deepEqual(result.overdue.map(x=>x.id),['a']);assert.equal(result.recentCount,1);
  assert.equal(result.nameMatches.length,0);assert.equal(result.possibleMatches.length,2);
 }
});
test('unrelated students sharing a first name, surname, shop or short similar names stay separate',()=>{
 for(const [a,b] of [
  ['Alex Morgan','Alex Miller'],['Alex Morgan','Blair Morgan'],['Ann Wu','Ana Wu'],
  ['Alex James Morgan','Alex Peter Morgan'],['Alex Morgan','Blair Miller'],['Alex Morgan Jr','Alex Morgan Sr']
 ]){
  const result=buildFollowUp([person('a',a),person('b',b)],[e('a',30),e('b',1)],now);
  assert.deepEqual(result.overdue.map(x=>x.id),['a'],a+' / '+b);assert.equal(result.recentCount,1);
  assert.equal(result.nameMatches.length,0);
 }
 const result=buildFollowUp([person('a','Alex','Shop A'),person('b','Alex','Shop B')],[e('a',30),e('b',1)],now);
 assert.equal(result.overdue.length,1);assert.equal(result.nameMatches.length,0);
});
test('ambiguous initials never chain distinct full names, regardless of input order',()=>{
 const members=[person('a','John Smith'),person('b','J Smith'),person('c','Jane Smith')];
 for(const input of [members,[...members].reverse(),[members[1],members[0],members[2]]]){
  const result=buildFollowUp(input,[e('a',30),e('b',1)],now);
  assert.deepEqual(result.overdue.map(x=>x.id),['a']);assert.deepEqual(result.noCheckins.map(x=>x.id),['c']);
  assert.equal(result.recentCount,1);assert.equal(result.nameMatches.length,0);assert.equal(result.possibleMatches.length,3);
 }
});
test('ambiguous first-name-only records and typo chains stay separate',()=>{
 for(const names of [['Alex Morgan','Alex','Alex Miller'],['Clara Stone','Clare Stone','Clere Stone']]){
  const result=buildFollowUp(names.map((name,i)=>person(String(i),name)),[e('0',30),e('1',1)],now);
  assert.deepEqual(result.overdue.map(x=>x.id),['0']);assert.equal(result.nameMatches.length,0);
  assert.equal(result.noCheckins.length,1);assert.equal(result.possibleMatches.length,3);
 }
});
test('grouped overdue records count once and use the most recent active timestamp',()=>{
 const result=buildFollowUp([person('a','Alex Morgan'),person('b','Alex Mrogan')],[e('a',40),e('b',20),e('a',1,{archivedAt:'2026-11-09'})],now);
 assert.equal(result.overdue.length,1);assert.equal(result.overdue[0].daysSince,20);
 assert.equal(result.overdue[0].lastSavedMemberId,'b');assert.equal(result.overdue[0].archivedCount,1);
 assert.equal(result.nameMatches[0].status,'overdue');
});
test('grouped missing, invalid and future dates remain conservative, while recent activity wins',()=>{
 const members=[person('a','Alex Morgan'),person('b','Alex Mrogan')];
 for(const entries of [[e('a',30),{id:'bad',memberId:'b',updatedAt:'bad'}],[e('a',30),e('b',-1)]]){
  const result=buildFollowUp(members,entries,now);
  assert.equal(result.unknown.length,1);assert.equal(result.overdue.length,0);
 }
 const result=buildFollowUp(members,[e('a',1),{id:'bad',memberId:'b'}],now);
 assert.equal(result.recentCount,1);assert.equal(result.unknown.length,0);
});
test('matched empty and Trash-only records do not become recent check-ins',()=>{
 const result=buildFollowUp([person('a','Alex Morgan'),person('b','Alex Mrogan')],[e('a',1,{archivedAt:'2026-11-09'})],now);
 assert.equal(result.noCheckins.length,1);assert.equal(result.recentCount,0);assert.equal(result.noCheckins[0].archivedCount,1);
});
test('blank names or shops cannot act as identity evidence',()=>{
 for(const members of [[person('a','',''),person('b','','')],[person('a','Alex Morgan',''),person('b','Alex Mrogan','')]]){
  const result=buildFollowUp(members,[e('a',30),e('b',1)],now);
  assert.equal(result.overdue.length,1);assert.equal(result.nameMatches.length,0);
 }
});
test('admin-only matching does not alter member lookup or import data',async()=>{
 const {readFile}=await import('node:fs/promises');
 for(const file of ['server/app.mjs','worker/app.mjs','src/main.tsx']){
  const source=await readFile(new URL('../'+file,import.meta.url),'utf8');
  assert.doesNotMatch(source,/buildFollowUp|compareNames/);
 }
});


test('ambiguous aliases cannot split exact full-name duplicates',()=>{
 const members=[person('a','John Smith'),person('b','JOHN SMITH'),person('c','J Smith'),person('d','Jane Smith')];
 const result=buildFollowUp(members,[e('a',30),e('b',1)],now);
 assert.equal(result.overdue.length,0);assert.equal(result.recentCount,1);
 assert.equal(result.nameMatches.length,1);assert.deepEqual(result.nameMatches[0].members.map(x=>x.id).sort(),['a','b']);
 assert.deepEqual(result.noCheckins.map(x=>x.id).sort(),['c','d']);
 assert.equal(result.nameMatches[0].possibleMatches[0].id,'c');
});

test('ambiguous last initials do not join students with different surnames',()=>{
 const result=buildFollowUp([person('a','Alex Morgan'),person('b','Alex M'),person('c','Alex Miller')],[e('a',30),e('b',1)],now);
 assert.equal(result.nameMatches.length,0);assert.deepEqual(result.overdue.map(x=>x.id),['a']);
 assert.equal(result.possibleMatches.length,3);
});

test('identical initials at different shops do not count as the same full name',()=>{
 for(const name of ['J Smith','Alex M','J S']){
  const result=buildFollowUp([person('a',name,'Shop A'),person('b',name,'Shop B')],[e('a',30),e('b',1)],now);
  assert.equal(result.overdue.length,1);assert.equal(result.nameMatches.length,0);assert.equal(result.possibleMatches.length,2);
 }
 const members=[person('a','J Smith','Shop A'),person('b','John Smith','Shop A'),person('c','J Smith','Shop B'),person('d','John Smith','Shop B')];
 const result=buildFollowUp(members,[e('a',30),e('c',1)],now);
 assert.deepEqual(result.overdue.map(x=>x.id),['a']);assert.equal(result.nameMatches.length,1);
 assert.deepEqual(result.nameMatches[0].members.map(x=>x.id).sort(),['b','d']);
});
