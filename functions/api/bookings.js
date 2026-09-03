const SERVICES = {
  'Exterior Detail': { car: 60, large: 70, minutes: 120 },
  'Interior Detail': { car: 60, large: 70, minutes: 150 },
  'Full Detail': { car: 110, large: 125, minutes: 240 },
  'Deep Clean': { car: 150, large: 175, minutes: 300 },
  'Emerald Maintenance': { car: 100, large: 115, minutes: 210 }
};

function json(data, status = 200) {
  return Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
}

export async function onRequestPost(context) {
  const db = context.env.DB;
  if (!db) return json({ error: 'Booking database is not connected yet.' }, 503);

  let body;
  try { body = await context.request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const { name, phone, vehicle, vehicleType, service, date, time, notes = '' } = body;
  if (!name || !phone || !vehicle || !vehicleType || !service || !date || !time) {
    return json({ error: 'Please complete all required booking fields.' }, 400);
  }
  const svc = SERVICES[service];
  if (!svc || !['car','large'].includes(vehicleType)) return json({ error: 'Invalid service or vehicle type.' }, 400);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return json({ error: 'Invalid date or time.' }, 400);

  const start = `${date}T${time}:00`;
  const end = new Date(`${start}-05:00`);
  end.setMinutes(end.getMinutes() + svc.minutes);
  const endTime = end.toISOString().slice(11, 16);

  const conflict = await db.prepare(`
    SELECT id FROM bookings
    WHERE service_date = ?
      AND status IN ('pending','confirmed')
      AND start_time < ?
      AND end_time > ?
    LIMIT 1
  `).bind(date, endTime, time).first();

  if (conflict) return json({ error: 'That time is no longer available. Please choose another time.' }, 409);

  const price = svc[vehicleType];
  const id = crypto.randomUUID();
  await db.prepare(`
    INSERT INTO bookings
      (id, name, phone, vehicle, vehicle_type, service, service_date, start_time, end_time, price, notes, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
  `).bind(id, name.trim().slice(0,100), phone.trim().slice(0,30), vehicle.trim().slice(0,100), vehicleType, service, date, time, endTime, price, String(notes).slice(0,1000)).run();

  return json({ ok: true, bookingId: id, price, endTime, status: 'pending' }, 201);
}
