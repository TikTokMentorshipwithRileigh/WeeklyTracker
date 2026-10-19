import {randomBytes} from 'node:crypto';
// Persistent keys survive deployments and admin-password changes.
// Existing explicitly configured keys are preserved for compatibility.
export async function internalKeys(env){
 const names=['RECORD_KEY_SECRET','SESSION_SECRET'];
 let rows=(await env.DB.prepare('SELECT name,value FROM internal_keys').all()).results;
 const existing=new Map(rows.map(r=>[r.name,r.value]));
 const missing=names.filter(name=>!existing.has(name));
 if(missing.length){
  await env.DB.batch(missing.map(name=>env.DB.prepare('INSERT INTO internal_keys(name,value) VALUES(?,?) ON CONFLICT(name) DO NOTHING').bind(name,env[name]||randomBytes(32).toString('hex'))));
  rows=(await env.DB.prepare('SELECT name,value FROM internal_keys').all()).results;
 }
 const keys=Object.fromEntries(rows.map(r=>[r.name,r.value]));
 return {recordSecret:keys.RECORD_KEY_SECRET,sessionSecret:keys.SESSION_SECRET};
}
