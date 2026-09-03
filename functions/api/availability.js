export async function onRequestGet(context) {
  const db = context.env.DB;
  if (!db) return Response.json({ error: 'Booking database is not connected yet.' }, { status: 503 });

  const url = new URL(context.request.url);
  const date = url.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return Response.json({ error: 'A valid date is required.' }, { status: 400 });
  }

  const result = await db.prepare(`
    SELECT start_time, end_time
    FROM bookings
    WHERE service_date = ?
      AND status IN ('pending','confirmed')
    ORDER BY start_time
  `).bind(date).all();

  return Response.json({ date, booked: result.results || [] });
}
