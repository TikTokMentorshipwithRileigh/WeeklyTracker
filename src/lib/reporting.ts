export function chicagoToday(now=new Date()):string {
 return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
}
export function shiftDate(value:string,days:number):string {
 const date=new Date(value+'T12:00:00Z');date.setUTCDate(date.getUTCDate()+days);return date.toISOString().slice(0,10);
}
export function lastSunday(value=chicagoToday()):string {
 return shiftDate(value,-new Date(value+'T12:00:00Z').getUTCDay());
}
export function isCompletedSunday(value:string,now=chicagoToday()):boolean {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T12:00:00Z');
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===value&&date.getUTCDay()===0&&value<=now&&value>='2020-01-05';
}
