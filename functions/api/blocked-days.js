const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
function authorized(request,env){const expected=env.ADMIN_TOKEN;const header=request.headers.get('Authorization')||'';return !!expected&&header===`Bearer ${expected}`;}
async function ensureTable(db){await db.prepare(`CREATE TABLE IF NOT EXISTS blocked_days (service_date TEXT PRIMARY KEY, created_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();}
export async function onRequestGet({request,env}){
 if(!authorized(request,env))return json({error:'Unauthorized'},401); if(!env.DB)return json({error:'Booking database is not connected yet.'},503);
 await ensureTable(env.DB); const result=await env.DB.prepare(`SELECT service_date,created_at FROM blocked_days ORDER BY service_date`).all(); return json({blockedDays:result.results||[]});
}
export async function onRequestPost({request,env}){
 if(!authorized(request,env))return json({error:'Unauthorized'},401); if(!env.DB)return json({error:'Booking database is not connected yet.'},503);
 let body;try{body=await request.json()}catch{return json({error:'Invalid JSON'},400)} const date=String(body.date||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:'A valid date is required.'},400);
 await ensureTable(env.DB); await env.DB.prepare(`INSERT OR IGNORE INTO blocked_days (service_date) VALUES (?)`).bind(date).run(); return json({ok:true,date},201);
}
export async function onRequestDelete({request,env}){
 if(!authorized(request,env))return json({error:'Unauthorized'},401); if(!env.DB)return json({error:'Booking database is not connected yet.'},503);
 const date=new URL(request.url).searchParams.get('date')||''; if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return json({error:'A valid date is required.'},400);
 await ensureTable(env.DB); const result=await env.DB.prepare(`DELETE FROM blocked_days WHERE service_date=?`).bind(date).run(); if(!result.success||!result.meta?.changes)return json({error:'Blocked date not found.'},404); return json({ok:true,date});
}
export function onRequestOptions(){return new Response(null,{status:204});}
