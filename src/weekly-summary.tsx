import React,{useEffect,useRef,useState} from 'react';
import './weekly-summary.css';
import {shiftDate} from './lib/reporting';
type Item={text:string;sources:string[]};
type Result={status:'ready'|'no_data';week:string;studentCount:number;excludedCount?:number;generatedAt?:string;cached?:boolean;summary?:Record<string,Item[]>;sources?:{ref:string;checkinId:string;memberId:string}[]};
type Props={week:string;revision?:unknown;onSource?:(id:string)=>void};
const formatDate=(s:string)=>new Date(s+'T12:00:00Z').toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
const headings=[['struggles','Struggles this week'],['questions','Questions for Rileigh'],['wins','Wins worth celebrating'],['notable','Other notable items']];
export default function WeeklySummary(props:Props){
 // Remount on source refresh as well as week change: old results cannot flash in a new view.
 return <SummaryBody key={props.week+JSON.stringify(props.revision??null)} {...props}/>;
}
function SummaryBody({week,onSource}:Props){
 const [result,setResult]=useState<Result|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>{controller.current?.abort()},[]);
 async function generate(){
  if(controller.current)return;
  const request=new AbortController();controller.current=request;setBusy(true);setError('');
  try{
   const r=await fetch('/api/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'weeklySummary',week}),signal:request.signal});
   const data=await r.json();if(!r.ok)throw Error(data.error||'Unable to generate the summary.');
   if(!request.signal.aborted)setResult(data);
  }catch(e){if(!request.signal.aborted)setError((e as Error).message)}finally{if(!request.signal.aborted){setBusy(false);controller.current=null}}
 }
 return <section className="panel weekly-summary" aria-labelledby="weekly-summary-title"><div className="section-heading"><div><div className="eyebrow">THE BIG PICTURE</div><h2 id="weekly-summary-title">Weekly AI summary</h2>{week&&<p className="summary-week">{formatDate(shiftDate(week,-7))} – {formatDate(shiftDate(week,-1))}</p>}</div><button className="primary" disabled={!week||busy||result?.status==='ready'} onClick={generate}>{busy?'Summarizing…':result?.status==='ready'?'Summary ready':'Generate summary'}</button></div><p>One review across all students for this reporting week. Choose a week above, or use All weeks for the latest completed week. Search and Trash filters do not limit the summary; removed check-ins are always excluded.</p><small>Generated only when requested. Check-in answers and metrics are sent to Cloudflare Workers AI; private admin notes and roster names are excluded. Answers may still contain personal details. Review the original check-ins before acting.</small>{!week&&<p className="summary-message">Choose a reporting week above to generate its summary.</p>}{busy&&<p role="status">Reading this week’s check-ins. This may take up to a minute.</p>}{error&&<p className="error" role="alert">{error}</p>}{Boolean(result?.excludedCount)&&<p className="summary-message">{result!.excludedCount} older-format check-in{result!.excludedCount===1?' was':'s were'} excluded because the reporting dates do not match this week.</p>}{result?.status==='no_data'&&<p role="status">No active check-ins match this reporting week.</p>}{result?.status==='ready'&&<><p className="summary-meta">Based on {result.studentCount} student check-in{result.studentCount===1?'':'s'} · {result.cached?'Reused recent summary':'AI-generated'} · {new Date(result.generatedAt!).toLocaleString()}</p><div className="summary-grid">{headings.map(([key,label])=><div key={key}><h3>{label}</h3>{result.summary?.[key]?.length?<ul>{result.summary[key].map((item,i)=><li key={i}><p>{item.text}</p><div className="summary-sources">{item.sources.map(ref=>{const source=result.sources?.find(s=>s.ref===ref);return onSource&&source?<button type="button" key={ref} onClick={()=>onSource(source.checkinId)} aria-label={`Review source check-in ${ref}`}>{ref}</button>:<span key={ref} title={source?`Check-in ${source.checkinId}`:undefined}>{ref}</span>})}</div></li>)}</ul>:<p className="summary-empty">Nothing identified in the submitted answers.</p>}</div>)}</div><p className="summary-message">AI can miss or misinterpret details. Source labels identify the check-ins behind each point.</p></>}</section>;
}
