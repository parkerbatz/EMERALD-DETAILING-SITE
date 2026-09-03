const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function authorized(request,env){
  const expected=env.ADMIN_TOKEN;
  const header=request.headers.get('Authorization')||'';
  return !!expected && header===`Bearer ${expected}`;
}

export async function onRequestGet({request,env}){
  if(!authorized(request,env)) return json({error:'Unauthorized'},401);
  if(!env.DB) return json({error:'Booking database is not connected yet.'},503);
  const u=new URL(request.url); const date=u.searchParams.get('date');
  let result;
  if(date){result=await env.DB.prepare(`SELECT * FROM bookings WHERE service_date=? ORDER BY start_time`).bind(date).all();}
  else{result=await env.DB.prepare(`SELECT * FROM bookings WHERE service_date>=date('now','-1 day') ORDER BY service_date,start_time LIMIT 200`).all();}
  return json({bookings:result.results||[]});
}

export async function onRequestPatch({request,env}){
  if(!authorized(request,env)) return json({error:'Unauthorized'},401);
  if(!env.DB) return json({error:'Booking database is not connected yet.'},503);
  let body; try{body=await request.json()}catch{return json({error:'Invalid JSON'},400)}
  const {id,status}=body;
  if(!id || !['pending','confirmed','cancelled','completed'].includes(status)) return json({error:'Booking id and valid status are required.'},400);
  const result=await env.DB.prepare(`UPDATE bookings SET status=? WHERE id=?`).bind(status,id).run();
  if(!result.success || !result.meta?.changes) return json({error:'Booking not found.'},404);
  return json({ok:true,id,status});
}
export function onRequestOptions(){return new Response(null,{status:204});}
