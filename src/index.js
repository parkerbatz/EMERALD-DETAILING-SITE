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

const GALLERY_SOURCES = {
  '/assets/gallery-1.jpg': 'IMG_2778.HEIC',
  '/assets/gallery-2.jpg': 'IMG_3485.HEIC',
  '/assets/gallery-3.jpg': 'IMG_4593.HEIC',
  '/assets/gallery-4.jpg': 'IMG_4902.HEIC',
  '/assets/gallery-5.jpg': 'IMG_1889.HEIC',
  '/assets/gallery-6.jpg': '373C02E5-D2C4-4C9D-BD5F-536D71361954.JPG'
};

const BOOKING_SCHEMA = `
CREATE TABLE IF NOT EXISTS bookings (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  vehicle TEXT NOT NULL,
  vehicle_type TEXT NOT NULL CHECK (vehicle_type IN ('car','large')),
  service TEXT NOT NULL,
  service_date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  price INTEGER NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','confirmed','cancelled','completed')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_bookings_date_status
ON bookings(service_date, status);
CREATE INDEX IF NOT EXISTS idx_bookings_date_time
ON bookings(service_date, start_time);
`;

async function ensureDatabase(env) {
  if (!env.DB) return false;
  await env.DB.prepare(BOOKING_SCHEMA).run();
  return true;
}

async function sendBookingNotification(env, booking) {
  const { RESEND_API_KEY, BOOKING_NOTIFY_EMAIL, RESEND_FROM_EMAIL } = env;
  if (!RESEND_API_KEY || !BOOKING_NOTIFY_EMAIL || !RESEND_FROM_EMAIL) return;

  const text = [
    'NEW EMERALD BOOKING',
    '',
    `${booking.service} — $${booking.price}`,
    `${booking.date} at ${booking.time}`,
    '',
    `Customer: ${booking.name}`,
    `Vehicle: ${booking.vehicle}`,
    `Phone: ${booking.phone}`,
    `Status: Pending confirmation`,
    '',
    'Open your Emerald admin dashboard to review.'
  ].join('\n');

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: RESEND_FROM_EMAIL,
        to: [BOOKING_NOTIFY_EMAIL],
        subject: `New Emerald booking — ${booking.service} on ${booking.date}`,
        text
      })
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error('Booking email failed:', response.status, detail.slice(0, 500));
    }
  } catch (error) {
    console.error('Booking email request failed:', error);
  }
}

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
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

async function galleryImage(request, env, sourceName) {
  const source = `https://raw.githubusercontent.com/parkerbatz/EMERALD-DETAILING-SITE/main/${sourceName}`;
  const proxy = new URL('https://images.weserv.nl/');
  proxy.searchParams.set('url', source);
  proxy.searchParams.set('output', 'jpg');
  proxy.searchParams.set('w', '1200');
  proxy.searchParams.set('q', '82');

  if (sourceName.endsWith('.JPG')) {
    proxy.searchParams.set('crop', '1536,1024,0,0');
    proxy.searchParams.set('fit', 'cover');
  }

  const response = await fetch(proxy.toString(), {
    cf: { cacheTtl: 86400, cacheEverything: true }
  });
  if (!response.ok) return new Response('Gallery image unavailable.', { status: 502 });

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=86400');
  headers.set('Content-Type', 'image/jpeg');
  return new Response(response.body, { status: response.status, headers });
}

async function availability(request, env) {
  if (!await ensureDatabase(env)) return json({ error: 'Booking database is not connected yet.' }, 503);

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

async function createBooking(request, env, ctx) {
  if (!await ensureDatabase(env)) return json({ error: 'Booking database is not connected yet.' }, 503);

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
  const booking = {
    id,
    name: String(name).trim().slice(0, 100),
    phone: String(phone).trim().slice(0, 30),
    vehicle: String(vehicle).trim().slice(0, 100),
    vehicleType,
    service,
    date,
    time,
    endTime,
    price,
    notes: String(notes).slice(0, 1000)
  };

  await env.DB.prepare(`
    INSERT INTO bookings
      (id, name, phone, vehicle, vehicle_type, service, service_date, start_time, end_time, price, notes, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'))
  `).bind(
    booking.id,
    booking.name,
    booking.phone,
    booking.vehicle,
    booking.vehicleType,
    booking.service,
    booking.date,
    booking.time,
    booking.endTime,
    booking.price,
    booking.notes
  ).run();

  if (ctx?.waitUntil) {
    ctx.waitUntil(sendBookingNotification(env, booking));
  } else {
    await sendBookingNotification(env, booking);
  }

  return json({ ok: true, bookingId: id, price, endTime, status: 'pending' }, 201);
}

function authorized(request, env) {
  const key = env.ADMIN_KEY;
  if (!key) return false;
  return request.headers.get('Authorization') === `Bearer ${key}`;
}

async function adminBookings(request, env) {
  if (!await ensureDatabase(env)) return json({ error: 'Booking database is not connected yet.' }, 503);
  if (!authorized(request, env)) return json({ error: 'Unauthorized.' }, 401);
  const u = new URL(request.url);
  const status = u.searchParams.get('status');
  const date = u.searchParams.get('date');
  let query = `SELECT id,name,phone,vehicle,vehicle_type,service,service_date,start_time,end_time,price,notes,status,created_at FROM bookings`;
  const clauses = [];
  const binds = [];
  if (status && ['pending','confirmed','cancelled','completed'].includes(status)) { clauses.push('status = ?'); binds.push(status); }
  if (date && isValidDate(date)) { clauses.push('service_date = ?'); binds.push(date); }
  if (clauses.length) query += ` WHERE ${clauses.join(' AND ')}`;
  query += ` ORDER BY service_date ASC, start_time ASC, created_at ASC LIMIT 500`;
  const result = await env.DB.prepare(query).bind(...binds).all();
  return json({ bookings: result.results || [] });
}

async function updateBooking(request, env) {
  if (!await ensureDatabase(env)) return json({ error: 'Booking database is not connected yet.' }, 503);
  if (!authorized(request, env)) return json({ error: 'Unauthorized.' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'Booking ID is required.' }, 400);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'Invalid request.' }, 400); }
  const status = body?.status;
  if (!['pending','confirmed','cancelled','completed'].includes(status)) return json({ error: 'Invalid booking status.' }, 400);
  const result = await env.DB.prepare('UPDATE bookings SET status = ? WHERE id = ?').bind(status, id).run();
  if (!result.meta?.changes) return json({ error: 'Booking not found.' }, 404);
  return json({ ok: true, id, status });
}

async function deleteBooking(request, env) {
  if (!await ensureDatabase(env)) return json({ error: 'Booking database is not connected yet.' }, 503);
  if (!authorized(request, env)) return json({ error: 'Unauthorized.' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (!id) return json({ error: 'Booking ID is required.' }, 400);
  const result = await env.DB.prepare("DELETE FROM bookings WHERE id = ? AND status = 'cancelled'").bind(id).run();
  if (!result.meta?.changes) return json({ error: 'Only cancelled bookings can be deleted.' }, 409);
  return json({ ok: true, id, deleted: true });
}

async function serveSite(request, env) {
  const response = await env.ASSETS.fetch(request);
  const url = new URL(request.url);
  const isHome = request.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html');
  const type = response.headers.get('Content-Type') || '';
  if (!isHome || !type.includes('text/html')) return response;

  const html = await response.text();
  const polished = html.replace('</head>', '<link rel="stylesheet" href="/mobile-polish.css"><meta name="format-detection" content="telephone=no"></head>');
  const headers = new Headers(response.headers);
  headers.delete('Content-Length');
  headers.set('Content-Type', 'text/html; charset=UTF-8');
  headers.set('Cache-Control', 'no-cache');
  return new Response(polished, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type, Authorization' } });

    if (url.pathname in GALLERY_SOURCES && request.method === 'GET') {
      return galleryImage(request, env, GALLERY_SOURCES[url.pathname]);
    }

    if (url.pathname === '/api/availability' && request.method === 'GET') return availability(request, env);
    if (url.pathname === '/api/bookings' && request.method === 'POST') return createBooking(request, env, ctx);
    if (url.pathname === '/api/admin/bookings' && request.method === 'GET') return adminBookings(request, env);
    if (url.pathname === '/api/admin/bookings' && request.method === 'PATCH') return updateBooking(request, env);
    if (url.pathname === '/api/admin/bookings' && request.method === 'DELETE') return deleteBooking(request, env);
    return serveSite(request, env);
  }
};
