const SERVICES = {'Exterior Detail':120,'Interior Detail':150,'Full Detail':240,'Deep Clean':300,'Emerald Maintenance':210};
const OPEN=9*60,CLOSE=17*60,STEP=30;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
export async function onRequestGet({request,env}){
 if(!env.DB)return json({error:'Booking database is not connected yet.'},503);
 const u=new URL(request.url),date=u.searchParams.get('date'),service=u.searchParams.get('service');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!SERVICES[service])return json({error:'Valid date and service are required.'},400);
 const weekday=new Date(`${date}T12:00:00Z`).getUTCDay();if(weekday===0)return json({date,service,slots:[]});
 const today=new Date(),localToday=new Date(today.toLocaleString('en-US',{timeZone:'America/Chicago'})),selected=new Date(`${date}T12:00:00`),todayDate=new Date(localToday.getFullYear(),localToday.getMonth(),localToday.getDate());
 if(selected<todayDate)return json({date,service,slots:[]});
 try{await env.DB.prepare(`CREATE TABLE IF NOT EXISTS blocked_days (service_date TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')) )`).run();const blocked=await env.DB.prepare(`SELECT service_date FROM blocked_days WHERE service_date=?`).bind(date).first();if(blocked)return json({date,service,slots:[],blocked:true});}catch(e){return json({error:'We could not verify availability. Please try again.'},503)}
 const result=await env.DB.prepare(`SELECT start_time,end_time FROM bookings WHERE service_date=? AND status IN ('pending','confirmed') ORDER BY start_time`).bind(date).all(),busy=result.results||[],duration=SERVICES[service],slots=[];
 for(let start=OPEN;start+duration<=CLOSE;start+=STEP){const end=start+duration,hm=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`,startTime=hm(start),endTime=hm(end),conflict=busy.some(b=>startTime<b.end_time&&endTime>b.start_time);if(!conflict)slots.push({start:startTime,end:endTime,label:new Date(`2000-01-01T${startTime}:00`).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})})}
 return json({date,service,duration_minutes:duration,slots});
}
export function onRequestOptions(){return new Response(null,{status:204});}
