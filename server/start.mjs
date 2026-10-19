import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {mkdirSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {createApp} from './app.mjs';
const path=process.env.DATABASE_PATH;if(!path)throw Error('DATABASE_PATH must point to persistent storage');mkdirSync(dirname(path),{recursive:true});
const origin=process.env.APP_ORIGIN||process.env.RENDER_EXTERNAL_URL;if(!origin||!origin.startsWith('https://'))throw Error('Set the public HTTPS origin');
const app=createApp({dbPath:path,adminPassword:process.env.ADMIN_PASSWORD,memberPassword:process.env.MEMBER_PASSWORD,recordSecret:process.env.RECORD_KEY_SECRET,sessionSecret:process.env.SESSION_SECRET,origin});
const root=resolve('dist');const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
createServer(async(req,res)=>{try{
 if(req.url==='/health'){res.writeHead(200);res.end('ok');return}
 if(req.url.startsWith('/api/')){const chunks=[];let size=0;for await(const chunk of req){size+=chunk.length;if(size>40000){res.writeHead(413);res.end();return}chunks.push(chunk)}const request=new Request(new URL(req.url,origin),{method:req.method,headers:req.headers,body:['GET','HEAD'].includes(req.method)?undefined:Buffer.concat(chunks)});const result=await app.handle(request,req.socket.remoteAddress||'unknown');res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));return}
 if(!['GET','HEAD'].includes(req.method)){res.writeHead(405);res.end();return}
 const url=new URL(req.url,origin);let pathname=decodeURIComponent(url.pathname);if(pathname==='/'||pathname==='/admin')pathname='/index.html';const file=resolve(root,'.'+pathname);if(!file.startsWith(root+'/')){res.writeHead(404);res.end();return}const content=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Cache-Control':pathname==='/index.html'?'no-cache':'public, max-age=3600','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'DENY'});res.end(req.method==='HEAD'?undefined:content);
 }catch(e){res.writeHead(e.code==='ENOENT'?404:500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:e.code==='ENOENT'?'Not found':'Unable to complete request.'}));}}).listen(Number(process.env.PORT||10000),'0.0.0.0');
