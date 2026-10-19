import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {createApp as workerApp} from '../worker/app.mjs';
export function createApp(config){
 const sqlite=new DatabaseSync(':memory:');sqlite.exec(readFileSync(new URL('../migrations/0001_initial.sql',import.meta.url),'utf8'));
 const database={prepare(sql){return {bind(...args){return {async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}},async run(){return {meta:sqlite.prepare(sql).run(...args)}}}}}},async batch(statements){sqlite.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.run());sqlite.exec('COMMIT');return results}catch(error){sqlite.exec('ROLLBACK');throw error}}};
 return {...workerApp({...config,database}),close:()=>sqlite.close()};
}
