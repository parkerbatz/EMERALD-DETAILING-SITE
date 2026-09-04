const SERVICES = {
  'Exterior Detail': { car: 60, large: 70, minutes: 120 },
  'Interior Detail': { car: 60, large: 70, minutes: 150 },
  'Full Detail': { car: 110, large: 125, minutes: 240 },
  'Deep Clean': { car: 150, large: 175, minutes: 300 },
  'Emerald Maintenance': { car: 100, large: 115, minutes: 210 }
};

const OPEN = 10 * 60;
const CLOSE = 20 * 60;
const STEP = 30;

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    }
  });
}

function hm(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value || '');
}

function isValidTime(value) {
  return /^\d{2}:\d{2}$/.test(value || '');
}

function localToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date());
}

function weekday(date) {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function isWeekend(date) {
  const day = weekday(date);
  return day === 0 || day === 6;
}

async function availability(request, env) {
  if (!env.DB) return json({ error: 'Booking database is not connected yet.' }, 503);

  const u = new URL(request.url);
  const date = u.searchParams.get('date');
  const service = u.searchParams.get('service');
  if (!isValidDate(date) || !SERVICES[service]) return json({ error: 'Valid date and service are required.' }, 400);
  if (!isWeekend(date) || date < localToday()) return json({ date, service, slots: [] });

  const result = await env.DB.prepare(`
    SELECT start_time, end_time
    FROM bookings
    WHERE service_date = ?
      AND status IN ('pending','confirmed')
    ORDER BY start_time
  `).bind(date).all();

  const busy = result.results || [];
  const duration = SERVICES[service].minutes;
  const slots = [];

  for (let start = OPEN; start + duration <= CLOSE; start += STEP) {
    const end = start + duration;
    const startTime = hm(start);
    const endTime = hm(end);
    const conflict = busy.some(b => startTime < b.end_time && endTime > b.start_time);
    if (!conflict) {
      slots.push({
        start: startTime,
        end: endTime,
        label: new Date(`2000-01-01T${startTime}:00`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      });
    }
  }

  return json({ date, service, duration_minutes: duration, slots });
}

async function createBooking(request, env) {
  if (!env.DB) return json({ error: 'Booking database is not connected yet.' }, 503);

  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }

  const { name, phone, vehicle, vehicleType, service, date, time, notes = '' } = body || {};
  if (!name || !phone || !vehicle || !vehicleType || !service || !date || !time) {
    return json({ error: 'Please complete all required booking fields.' }, 400);
  }

  const svc = SERVICES[service];
  if (!svc || !['car', 'large'].includes(vehicleType)) return json({ error: 'Invalid service or vehicle type.' }, 400);
  if (!isValidDate(date) || !isValidTime(time)) return json({ error: 'Invalid date or time.' }, 400);
  if (date < localToday() || !isWeekend(date)) return json({ error: 'That date is not available.' }, 400);

  const [hour, minute] = time.split(':').map(Number);
  const startMinutes = hour * 60 + minute;
  const endMinutes = startMinutes + svc.minutes;
  if (startMinutes < OPEN || endMinutes > CLOSE || minute % 30 !== 0) {
    return json({ error: 'That appointment time is outside available hours.' }, 400);
  }

  const endTime = hm(endMinutes);
  const conflict = await env.DB.prepare(`
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
  await env.DB.prepare(`
    INSERT INTO bookings
      (id, name, phone, vehicle, vehicle_type, service, service_date, start_time, end_time, price, notes, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
  `).bind(
    id,
    String(name).trim().slice(0, 100),
    String(phone).trim().slice(0, 30),
    String(vehicle).trim().slice(0, 100),
    vehicleType,
    service,
    date,
    time,
    endTime,
    price,
    String(notes).slice(0, 1000)
  ).run();

  return json({ ok: true, bookingId: id, price, endTime, status: 'pending' }, 201);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });
    if (url.pathname === '/api/availability' && request.method === 'GET') return availability(request, env);
    if (url.pathname === '/api/bookings' && request.method === 'POST') return createBooking(request, env);
    return env.ASSETS.fetch(request);
  }
};
