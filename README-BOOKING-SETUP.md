# Emerald Detailing Co. — Booking System Setup

The repository now contains the server-side booking foundation:

- `functions/api/availability.js` — returns booked time ranges for a date.
- `functions/api/bookings.js` — validates and creates booking requests while checking for conflicts.
- `schema.sql` — D1 database schema for bookings.

## Required deployment step

GitHub Pages is static hosting, so these `/functions` endpoints will not execute there. Deploy the site through Cloudflare Pages/Workers and connect a Cloudflare D1 database named/bound as `DB`.

Cloudflare Pages Functions can provide server-side functionality, and D1 can be bound to the function through the `DB` binding.

After creating the D1 database, apply `schema.sql` to it. Then configure the Cloudflare project to build/deploy from this GitHub repository.

## Remaining frontend connection

The existing `booking.html` is the branded booking interface. It should be connected to `/api/availability` and `/api/bookings` once the Cloudflare deployment is configured. The current GitHub Pages site should remain usable while this backend is being connected.

## Security

Do not put an admin password, API token, or Cloudflare secret directly in frontend JavaScript. Admin authentication should be implemented server-side using Cloudflare secrets/access controls before exposing an admin dashboard.
