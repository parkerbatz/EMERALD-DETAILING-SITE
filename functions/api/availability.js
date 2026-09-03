const SERVICES = {
  'Exterior Detail': 120,
  'Interior Detail': 150,
  'Full Detail': 240,
  'Deep Clean': 300,
  'Emerald Maintenance': 210
};
const OPEN = 9 * 60;
const CLOSE = 17 * 60;
const STEP = 30;
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});

export async function onRequestGet({request,env}) {
  if (!env.DB) return json({error:'Booking database is not connected yet.'},503);
  const u = new URL(request.url);
  const date = u.searchParams.get('date');
  const service = u.searchParams.get('service');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date||'') || !SERVICES[service]) return json({error:'Valid date and service are required.'},400);
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay();
  if (weekday === 0) return json({date,service,slots:[]});
  const today = new Date();
  const localToday = new Date(today.toLocaleString('en-US',{timeZone:'America/Chicago'}));
  const selected = new Date(`${date}T12:00:00`);
  const todayDate = new Date(localToday.getFullYear(),localToday.getMonth(),localToday.getDate());
  if (selected < todayDate) return json({date,service,slots:[]});
  const result = await env.DB.prepare(`SELECT start_time,end_time FROM bookings WHERE service_date=? AND status IN ('pending','confirmed') ORDER BY start_time`).bind(date).all();
  const busy=result.results||[];
  const duration=SERVICES[service];
  const slots=[];
  for(let start=OPEN;start+duration<=CLOSE;start+=STEP){
    const end=start+duration;
    const hm=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
    const startTime=hm(start),endTime=hm(end);
    const conflict=busy.some(b=>startTime < b.end_time && endTime > b.start_time);
    if(!conflict) slots.push({start:startTime,end:endTime,label:new Date(`2000-01-01T${startTime}:00`).toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'})});
  }
  return json({date,service,duration_minutes:duration,slots});
}
export function onRequestOptions(){return new Response(null,{status:204});}
