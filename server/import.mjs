// Run with the standalone service stopped, against an empty persistent database.
// Input JSON: {members:[...],checkins:[...]} exported securely from the old server.
import {readFileSync} from 'node:fs';
import {createHmac} from 'node:crypto';
import {createApp} from './app.mjs';
const input=process.argv[2];if(!input)throw Error('Provide a private export JSON path');
const source=JSON.parse(readFileSync(input,'utf8'));if(!Array.isArray(source.members)||!Array.isArray(source.checkins))throw Error('Expected members and checkins arrays');
const secret=process.env.RECORD_KEY_SECRET;
const app=createApp({dbPath:process.env.DATABASE_PATH,adminPassword:process.env.ADMIN_PASSWORD,memberPassword:process.env.MEMBER_PASSWORD,recordSecret:secret,sessionSecret:process.env.SESSION_SECRET,origin:'https://migration.invalid'});
const {db}=app;if(db.prepare('SELECT count(*) AS n FROM members').get().n)throw Error('Import only into an empty database');
const get=(r,a,b)=>r[a]??r[b];
db.exec('BEGIN');try{for(const m of source.members){if(!m.id||!m.name||!m.shop)throw Error('Invalid member');const key=createHmac('sha256',secret).update(JSON.stringify([m.name,m.shop])).digest('hex');db.prepare('INSERT INTO members VALUES(?,?,?,?,?)').run(m.id,key,m.name,m.shop,get(m,'createdAt','created_at')||new Date().toISOString())}
for(const e of source.checkins){const data={};for(const k of ['videos','samples','products','lives','gmv7','gmv28','wins','whines','questions'])data[k]=e[k];data.reportingCycle=get(e,'reportingCycle','reporting_cycle')??null;data.updatedAt=get(e,'updatedAt','updated_at');db.prepare('INSERT INTO checkins(id,member_id,end_date,data) VALUES(?,?,?,?)').run(e.id,get(e,'memberId','member_id'),get(e,'endDate','end_date'),JSON.stringify(data))}db.exec('COMMIT');console.log(`Imported ${source.members.length} members and ${source.checkins.length} check-ins.`)}catch(e){db.exec('ROLLBACK');throw e}finally{app.close()}
