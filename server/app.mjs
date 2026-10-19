import {DatabaseSync} from 'node:sqlite';
import {createHmac,randomUUID,randomBytes,timingSafeEqual,createHash} from 'node:crypto';
const hash=s=>createHash('sha256').update(String(s)).digest();
const same=(a,b)=>timingSafeEqual(hash(a),hash(b));
export function createApp({dbPath,adminPassword,memberPassword,recordSecret,sessionSecret,origin,secure=true}){
 if(!adminPassword||adminPassword.length<12||!memberPassword||!recordSecret||!sessionSecret||sessionSecret.length<32||same(adminPassword,memberPassword))throw Error('Configure distinct admin/member passwords, record key, and session secret. Admin password must be at least 12 characters.');
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL;PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY,access_key TEXT UNIQUE NOT NULL,name TEXT NOT NULL,shop TEXT NOT NULL,created_at TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS checkins(id TEXT PRIMARY KEY,member_id TEXT NOT NULL REFERENCES members(id),end_date TEXT NOT NULL,data TEXT NOT NULL,archived_at TEXT,UNIQUE(member_id,end_date));
 CREATE TABLE IF NOT EXISTS notes(scope TEXT NOT NULL,target TEXT NOT NULL,text TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(scope,target));
 CREATE TABLE IF NOT EXISTS attempts(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY,expires INTEGER NOT NULL);
 `);
 const sign=s=>createHmac('sha256',sessionSecret).update(s).digest('base64url');
 function session(req){try{const raw=(req.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith('tracker_admin='))?.slice(14);if(!raw)return false;const [token,sig]=raw.split('.');return same(sign(token),sig)&&Boolean(db.prepare('SELECT 1 FROM sessions WHERE token=? AND expires>?').get(token,Date.now()));}catch{return false}}
 const cookie=value=>`tracker_admin=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value?28800:0}${secure?'; Secure':''}`;
 const response=(data,status=200,headers={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
 const key=(name,shop)=>createHmac('sha256',recordSecret).update(JSON.stringify([name,shop])).digest('hex');
 const safeMember=m=>({id:m.id,name:m.name,shop:m.shop});
 const entry=r=>({...JSON.parse(r.data),id:r.id,memberId:r.member_id,endDate:r.end_date,archivedAt:r.archived_at});
 const empty={admin:false,needsIdentity:true,name:'',members:[],entries:[]};
 function validWeek(s){if(typeof s!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T12:00:00Z');const today=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());return !isNaN(d)&&d.toISOString().slice(0,10)===s&&d.getUTCDay()===0&&s<=today&&s>='2020-01-05'}
 function limit(ip,scope='member'){const now=Date.now();db.prepare('DELETE FROM attempts WHERE expires<?').run(now);const k=sign(scope+':'+ip);const a=db.prepare('SELECT count FROM attempts WHERE key=?').get(k);if(a?.count>=20)return false;db.prepare('INSERT INTO attempts VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1').run(k,now+900000);return true;}
 async function handle(req,ip='unknown'){
 const url=new URL(req.url);const adminRoute=url.pathname==='/api/admin';
 if(!['/api/admin','/api/tracker'].includes(url.pathname))return response({error:'Not found'},404);
 if(!['GET','POST'].includes(req.method))return response({error:'Method not allowed'},405);
 if(req.method==='POST'&&req.headers.get('origin')!==origin)return response({error:'Request origin not allowed'},403);
 let b={};if(req.method==='POST'){if(!req.headers.get('content-type')?.includes('application/json'))return response({error:'JSON required'},400);const raw=await req.text();if(raw.length>40000)return response({error:'Request too large'},413);try{b=JSON.parse(raw)}catch{return response({error:'Invalid JSON'},400)}if(!b||typeof b!=='object'||Array.isArray(b))return response({error:'Invalid request'},400)}
 if(adminRoute){
  if(b.action==='login'){
   if(!limit(ip,'admin'))return response({error:'Too many attempts. Try again in 15 minutes.'},429);
   if(typeof b.password!=='string'||!same(b.password,adminPassword))return response({error:'Incorrect admin password.'},401);
   db.prepare('DELETE FROM attempts WHERE key=?').run(sign('admin:'+ip));
   db.prepare('DELETE FROM sessions WHERE expires<?').run(Date.now());const token=randomBytes(32).toString('base64url');db.prepare('INSERT INTO sessions VALUES(?,?)').run(token,Date.now()+28800000);
   return response({ok:true},200,{'Set-Cookie':cookie(token+'.'+sign(token))});
  }
  if(!session(req))return response({error:'Admin sign-in required.'},401);
  if(req.method==='GET')return response({members:db.prepare('SELECT * FROM members ORDER BY name').all().map(safeMember),entries:db.prepare('SELECT * FROM checkins ORDER BY end_date DESC').all().map(entry),notes:db.prepare('SELECT scope,target,text,updated_at AS updatedAt FROM notes').all()});
  if(b.action==='logout'){const raw=(req.headers.get('cookie')||'').match(/tracker_admin=([^;.]+)/)?.[1];if(raw)db.prepare('DELETE FROM sessions WHERE token=?').run(raw);return response({ok:true},200,{'Set-Cookie':cookie('')})}
  if(b.action==='note'){
   if(!['checkin','member','week'].includes(b.scope)||typeof b.target!=='string'||typeof b.text!=='string'||b.text.length>10000)return response({error:'Invalid note'},400);
   const exists=b.scope==='week'?validWeek(b.target):db.prepare(`SELECT 1 FROM ${b.scope==='member'?'members':'checkins'} WHERE id=?`).get(b.target);
   if(!exists)return response({error:'Note target not found'},404);
   const old=db.prepare('SELECT updated_at FROM notes WHERE scope=? AND target=?').get(b.scope,b.target);
   if((b.expectedUpdatedAt||null)!==(old?.updated_at||null))return response({error:'Another admin updated this note. Reload to review their changes before saving.'},409);
   const updatedAt=new Date().toISOString();db.prepare('INSERT INTO notes VALUES(?,?,?,?) ON CONFLICT(scope,target) DO UPDATE SET text=excluded.text,updated_at=excluded.updated_at').run(b.scope,b.target,b.text,updatedAt);return response({ok:true,updatedAt});
  }
  if(['archive','restore'].includes(b.action)){if(typeof b.id!=='string')return response({error:'Check-in required'},400);const r=db.prepare('UPDATE checkins SET archived_at=? WHERE id=?').run(b.action==='archive'?new Date().toISOString():null,b.id);return r.changes?response({ok:true}):response({error:'Check-in not found'},404)}
  return response({error:'Unknown action'},400);
 }
 const password=req.headers.get('x-member-password')||'';
 if(!same(password,memberPassword)){
  if(req.method==='GET')return response({...empty,needsPassword:true});
  if(!limit(ip))return response({error:'Too many attempts. Try again in 15 minutes.'},429);
  return response({error:'Incorrect member password.'},401);
 }
 if(req.method==='GET'||b.action==='unlock')return response(empty);
 if(!['lookup','checkin'].includes(b.action))return response({error:'Unknown action'},400);
 const name=typeof b.name==='string'?b.name.trim():'',shop=typeof b.shop==='string'?b.shop.trim():'';
 if(name.split(/\s+/).length<2||name.length>120||!shop||shop.length>120)return response({error:'Enter your first and last name and shop name.'},400);
 const accessKey=key(name,shop);let member=db.prepare('SELECT * FROM members WHERE access_key=?').get(accessKey);
 if(b.action==='lookup')return response({admin:false,needsIdentity:false,name,members:member?[safeMember(member)]:[],entries:member?db.prepare('SELECT * FROM checkins WHERE member_id=? AND archived_at IS NULL ORDER BY end_date DESC').all(member.id).map(entry).map(({archivedAt,...e})=>e):[]});
 if(b.memberId&&b.memberId!==member?.id)return response({error:'The name and shop do not match this record.'},403);
 const previous=member?db.prepare('SELECT * FROM checkins WHERE member_id=? AND end_date=?').get(member.id,String(b.endDate)):null;
 if(previous?.archived_at)return response({error:'This submission was removed by an admin. Contact Rileigh to restore it.'},403);
 const legacy=previous&&JSON.parse(previous.data).reportingCycle!=='sunday';
 if(!legacy&&!validWeek(b.endDate))return response({error:'Choose a completed Sunday–Saturday week.'},400);
 const data={reportingCycle:legacy?null:'sunday',updatedAt:new Date().toISOString()};
 for(const k of ['videos','samples','products','lives','gmv7','gmv28']){const n=b[k];if(typeof n!=='number'||!Number.isFinite(n)||n<0||n>(k.startsWith('gmv')?1e9:1e6)||(!k.startsWith('gmv')&&!Number.isInteger(n)))return response({error:'Complete all six metrics with nonnegative numbers.'},400);data[k]=n;}
 for(const k of ['wins','whines','questions']){if(typeof b[k]!=='string'||b[k].length>5000)return response({error:'Comments must be at most 5,000 characters.'},400);data[k]=b[k]}
 db.exec('BEGIN');try{if(!member){member={id:randomUUID(),name,shop};db.prepare('INSERT INTO members VALUES(?,?,?,?,?)').run(member.id,accessKey,name,shop,new Date().toISOString());}db.prepare('INSERT INTO checkins(id,member_id,end_date,data) VALUES(?,?,?,?) ON CONFLICT(member_id,end_date) DO UPDATE SET data=excluded.data').run(randomUUID(),member.id,b.endDate,JSON.stringify(data));db.exec('COMMIT')}catch(e){db.exec('ROLLBACK');throw e}return response({ok:true});
 }
 return {handle,db,close:()=>db.close()};
}
