import {createApp} from './app.mjs';
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(!url.pathname.startsWith('/api/'))return env.ASSETS.fetch(request);
  const cors=url.pathname==='/api/tracker'&&request.headers.get('Origin')==='https://tiktokmentorshipwithrileigh.github.io';
  const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Vary':'Origin'};
  if(cors)Object.assign(headers,{'Access-Control-Allow-Origin':'https://tiktokmentorshipwithrileigh.github.io','Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, X-Member-Password'});
  if(request.method==='OPTIONS')return new Response(null,{status:cors?204:403,headers});
  let response;
  try{
   if(!env.ADMIN_PASSWORD||!env.MEMBER_PASSWORD||!env.RECORD_KEY_SECRET||!env.SESSION_SECRET)return Response.json({error:'Dashboard setup is not complete. Please contact Rileigh.'},{status:503,headers});
   const app=createApp({database:env.DB,adminPassword:env.ADMIN_PASSWORD,memberPassword:env.MEMBER_PASSWORD,recordSecret:env.RECORD_KEY_SECRET,sessionSecret:env.SESSION_SECRET,origin:url.origin});
   response=await app.handle(request,request.headers.get('CF-Connecting-IP')||'unknown');
  }catch{response=Response.json({error:'Unable to complete this request. Please try again.'},{status:500});}
  const out=new Response(response.body,response);for(const [key,value] of Object.entries(headers))out.headers.set(key,value);return out;
 }
};
