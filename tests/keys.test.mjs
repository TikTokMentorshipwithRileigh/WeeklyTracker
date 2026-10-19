import {test} from 'node:test';import assert from 'node:assert/strict';import {DatabaseSync} from 'node:sqlite';import {internalKeys} from '../worker/keys.mjs';
test('Generated keys persist across parallel initialization and password changes',async()=>{
 const db=new DatabaseSync(':memory:');db.exec('CREATE TABLE internal_keys(name TEXT PRIMARY KEY,value TEXT NOT NULL)');
 const DB={prepare(sql){return {async all(){return {results:db.prepare(sql).all()}},bind(...args){return {async run(){return db.prepare(sql).run(...args)}}}}},async batch(statements){return Promise.all(statements.map(s=>s.run()))}};
 try{const [a,b]=await Promise.all([internalKeys({DB}),internalKeys({DB})]);assert.deepEqual(a,b);assert.equal(a.recordSecret.length,64);assert.notEqual(a.recordSecret,a.sessionSecret);assert.deepEqual(await internalKeys({DB,ADMIN_PASSWORD:'changed'}),a);assert.equal(db.prepare('SELECT count(*) AS n FROM internal_keys').get().n,2)}finally{db.close()}
});
