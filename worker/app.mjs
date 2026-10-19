import {createHmac,randomUUID,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(String(s)).digest();
const same=(a,b)=>timingSafeEqual(hash(a),hash(b));
export function createApp({database,adminPassword,memberPassword,recordSecret,sessionSecret,origin,secure=true}){
 if(!adminPassword||adminPassword.length<12||!memberPassword||!recordSecret||!sessionSecret||sessionSecret.length<32||same(adminPassword,memberPassword))throw Error('Configure distinct admin/member passwords, record key, and session secret. Admin password must be at least 12 characters.');
 const db={prepare(sql){return {async get(...args){return database.prepare(sql).bind(...args).first()},async all(...args){return (await database.prepare(sql).bind(...args).all()).results},async run(...args){return (await database.prepare(sql).bind(...args).run()).meta}}}};
 const sign=s=>createHmac('sha256',sessionSecret).update(s).digest('base64url');
 async function session(req){try{const raw=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('tracker_admin='))?.slice(14);if(!raw)return false;const [token,sig]=raw.split('.');return same(sign(token),sig)&&Boolean((await db.prepare('SELECT 1 FROM sessions WHERE token=? AND expires>?').get(token,Date.now())));}catch{return false}}
 const cookie=value=>`tracker_admin=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value?28800:0}${secure?'; Secure':''}`;
 const response=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
 const key=(name,shop)=>createHmac('sha256',recordSecret).update(JSON.stringify([name,shop])).digest('hex');
 const safeMember=m=>({id:m.id,name:m.name,shop:m.shop});
 const entry=r=>({...JSON.parse(r.data),id:r.id,memberId:r.member_id,endDate:r.end_date,archivedAt:r.archived_at});
 const empty={admin:false,needsIdentity:true,name:'',members:[],entries:[]};
 function validWeek(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return !isNaN(d)&&d.toISOString().slice(0,10)===s&&d.getUTCDay()===0&&s<=today&&s>='2020-01-05'}
 async function limit(ip,scope='member'){
 const now=Date.now(),k=sign(scope+':'+ip);
 const a=await database.prepare('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<=? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<=? THEN excluded.expires ELSE expires END RETURNING count').bind(k,now+900000,now,now).first();
 return a.count<=20;
 }
 async function handle(req,ip='unknown'){
 const url=new URL(req.url);const adminRoute=url.pathname==='/api/admin';
 if(!['/api/admin','/api/tracker'].includes(url.pathname))return response({error:'Not found'},404);
 if(!['GET','POST'].includes(req.method))return response({error:'Method not allowed'},405);
 if(req.method==='POST'&&req.headers.get('origin')!==origin&&!(url.pathname==='/api/tracker'&&req.headers.get('origin')==='https://tiktokmentorshipwithrileigh.github.io'))return response({error:'Request origin not allowed'},403);
 let b={};if(req.method==='POST'){if(!req.headers.get('content-type')?.includes('application/json'))return response({error:'JSON required'},400);const raw=await req.text();if(raw.length>40000)return response({error:'Request too large'},413);try{b=JSON.parse(raw)}catch{return response({error:'Invalid JSON'},400)}if(!b||typeof b!=='object'||Array.isArray(b))return response({error:'Invalid request'},400)}
 if(adminRoute){
  if(b.action==='login'){
   if(!(await limit(ip,'admin')))return response({error:'Too many attempts. Try again in 15 minutes.'},429);
   if(typeof b.password!=='string'||!same(b.password,adminPassword))return response({error:'Incorrect admin password.'},401);
   (await db.prepare('DELETE FROM attempts WHERE key=?').run(sign('admin:'+ip)));
   (await db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now()));const token=randomBytes(32).toString('base64url');(await db.prepare('INSERT INTO sessions VALUES(?,?)').run(token,Date.now()+28800000));
   return response({ok:true},200,{'Set-Cookie':cookie(token+'.'+sign(token))});
  }
  if(!(await session(req)))return response({error:'Admin sign-in required.'},401);
  if(req.method==='GET')return response({members:(await db.prepare('SELECT * FROM members ORDER BY name').all()).map(safeMember),entries:(await db.prepare('SELECT * FROM checkins ORDER BY end_date DESC').all()).map(entry),notes:(await db.prepare('SELECT scope,target,text,updated_at AS updatedAt FROM notes').all())});
  if(b.action==='logout'){const raw=(req.headers.get('cookie')||'').match(/tracker_admin=([^;.]+)/)?.[1];if(raw)(await db.prepare('DELETE FROM sessions WHERE token=?').run(raw));return response({ok:true},200,{'Set-Cookie':cookie('')})}
  if(b.action==='note'){
   if(!['checkin','member','week'].includes(b.scope)||typeof b.target!=='string'||typeof b.text!=='string'||b.text.length>10000)return response({error:'Invalid note'},400);
   const exists=b.scope==='week'?validWeek(b.target):(await db.prepare(`SELECT 1 FROM ${b.scope==='member'?'members':'checkins'} WHERE id=?`).get(b.target));
   if(!exists)return response({error:'Note target not found'},404);
   const updatedAt=new Date().toISOString();
   const result=b.expectedUpdatedAt
    ?await db.prepare('UPDATE notes SET text=?,updated_at=? WHERE scope=? AND target=? AND updated_at=?').run(b.text,updatedAt,b.scope,b.target,b.expectedUpdatedAt)
    :await db.prepare('INSERT INTO notes VALUES(?,?,?,?) ON CONFLICT(scope,target) DO NOTHING').run(b.scope,b.target,b.text,updatedAt);
   if(!result.changes)return response({error:'Another admin updated this note. Reload to review their changes before saving.'},409);
   return response({ok:true,updatedAt});
  }
  if(['archive','restore'].includes(b.action)){if(typeof b.id!=='string')return response({error:'Check-in required'},400);const r=(await db.prepare('UPDATE checkins SET archived_at=? WHERE id=?').run(b.action==='archive'?new Date().toISOString():null,b.id));return r.changes?response({ok:true}):response({error:'Check-in not found'},404)}
  return response({error:'Unknown action'},400);
 }
 const password=req.headers.get('x-member-password')||'';
 if(!same(password,memberPassword)){
  if(req.method==='GET')return response({...empty,needsPassword:true});
  if(!(await limit(ip)))return response({error:'Too many attempts. Try again in 15 minutes.'},429);
  return response({error:'Incorrect member password.'},401);
 }
 if(req.method==='GET'||b.action==='unlock')return response(empty);
 if(!['lookup','checkin'].includes(b.action))return response({error:'Unknown action'},400);
 const name=typeof b.name==='string'?b.name.trim():'',shop=typeof b.shop==='string'?b.shop.trim():'';
 if(name.split(/\s+/).length<2||name.length>120||!shop||shop.length>120)return response({error:'Enter your first and last name and shop name.'},400);
 if(!(await limit(ip,'identity')))return response({error:'Too many attempts. Try again in 15 minutes.'},429);
 const accessKey=key(name,shop);let member=(await db.prepare('SELECT * FROM members WHERE access_key=?').get(accessKey));
 if(b.action==='lookup')return response({admin:false,needsIdentity:false,name,members:member?[safeMember(member)]:[],entries:member?(await db.prepare('SELECT * FROM checkins WHERE member_id=? AND archived_at IS NULL ORDER BY end_date DESC').all(member.id)).map(entry).map(({archivedAt,...e})=>e):[]});
 if(b.memberId&&b.memberId!==member?.id)return response({error:'The name and shop do not match this record.'},403);
 const previous=member?(await db.prepare('SELECT * FROM checkins WHERE member_id=? AND end_date=?').get(member.id,String(b.endDate))):null;
 if(previous?.archived_at)return response({error:'This submission was removed by an admin. Contact Rileigh to restore it.'},403);
 const legacy=previous&&JSON.parse(previous.data).reportingCycle!=='sunday';
 if(!legacy&&!validWeek(b.endDate))return response({error:'Choose a completed Sunday–Saturday week.'},400);
 const data={reportingCycle:legacy?null:'sunday',updatedAt:new Date().toISOString()};
 for(const k of ['videos','samples','products','lives','gmv7','gmv28']){const n=b[k];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>(k.startsWith('gmv')?1e9:1e6)||(!k.startsWith('gmv')&&!Number.isInteger(n)))return response({error:'Complete all six metrics with nonnegative numbers.'},400);data[k]=n;}
 for(const k of ['wins','whines','questions']){if(typeof b[k]!=='string'||b[k].length>5000)return response({error:'Comments must be at most 5,000 characters.'},400);data[k]=b[k]}
 const memberId=member?.id||randomUUID();
 await database.batch([
 database.prepare('INSERT INTO members VALUES(?,?,?,?,?) ON CONFLICT(access_key) DO NOTHING').bind(memberId,accessKey,name,shop,new Date().toISOString()),
 database.prepare('INSERT INTO checkins(id,member_id,end_date,data) SELECT ?,id,?,? FROM members WHERE access_key=? ON CONFLICT(member_id,end_date) DO UPDATE SET data=excluded.data WHERE checkins.archived_at IS NULL').bind(randomUUID(),b.endDate,JSON.stringify(data),accessKey)
 ]);return response({ok:true});
 }
 return {handle};
}
