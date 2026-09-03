const SERVICES={'Exterior Detail':{car:60,large:70,minutes:120},'Interior Detail':{car:60,large:70,minutes:150},'Full Detail':{car:110,large:125,minutes:240},'Deep Clean':{car:150,large:175,minutes:300},'Emerald Maintenance':{car:100,large:115,minutes:210}};
const OPEN=9*60,CLOSE=17*60;
const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const toMin=t=>Number(t.slice(0,2))*60+Number(t.slice(3));
const hm=m=>`${String(Math.floor(m/60)).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;
export async function onRequestPost(context){
 const db=context.env.DB;if(!db)return json({error:'Booking database is not connected yet.'},503);
 let body;try{body=await context.request.json()}catch{return json({error:'Invalid request.'},400)}
 const {name,phone,vehicle,vehicleType,service,date,time,notes=''}=body;
 if(!name||!phone||!vehicle||!vehicleType||!service||!date||!time)return json({error:'Please complete all required booking fields.'},400);
 const svc=SERVICES[service];if(!svc||!['car','large'].includes(vehicleType))return json({error:'Invalid service or vehicle type.'},400);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time))return json({error:'Invalid date or time.'},400);
 const selected=new Date(`${date}T12:00:00`);const now=new Date();const today=new Date(now.toLocaleString('en-US',{timeZone:'America/Chicago'}));const todayOnly=new Date(today.getFullYear(),today.getMonth(),today.getDate());
 if(selected<todayOnly)return json({error:'That date has already passed.'},400);
 if(selected.getDay()===0)return json({error:'Emerald Detailing is closed on Sundays.'},400);
 const startMin=toMin(time);const endMin=startMin+svc.minutes;
 if(startMin<OPEN||endMin>CLOSE||startMin%30!==0)return json({error:'That appointment time is outside the available schedule.'},400);
 const endTime=hm(endMin);
 const conflict=await db.prepare(`SELECT id FROM bookings WHERE service_date=? AND status IN ('pending','confirmed') AND start_time < ? AND end_time > ? LIMIT 1`).bind(date,endTime,time).first();
 if(conflict)return json({error:'That time is no longer available. Please choose another time.'},409);
 const price=svc[vehicleType],id=crypto.randomUUID();
 await db.prepare(`INSERT INTO bookings (id,name,phone,vehicle,vehicle_type,service,service_date,start_time,end_time,price,notes,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,'pending',datetime('now'))`).bind(id,name.trim().slice(0,100),phone.trim().slice(0,30),vehicle.trim().slice(0,100),vehicleType,service,date,time,endTime,price,String(notes).slice(0,1000)).run();
 return json({ok:true,bookingId:id,price,endTime,status:'pending'},201);
}
