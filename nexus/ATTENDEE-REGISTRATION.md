# NTC attendee registration — development status and historical milestone

> **Current development status (November 18, 2026):** The initial registration/waitlist milestone described below has been extended by [NTC paid inventory](PAID-INVENTORY.md), [magic-link and payment recovery](MAGIC-PAYMENT-RECOVERY.md), and the selected [Docker/Caddy runtime](DOCKER.md). Paid `pending_payment` requests do not reserve Zeffy inventory or confer admission; independently verified payment plus an available confirmed seat is required. Earlier worker-related terminology below is historical. All live paid-event gates remain disabled.

This is an original, Salesforce-free DIG Nexus conference registration implementation.
It is designed for DC27/NTC (April 28–30, 2027), and future events. It is **not
live**. Email delivery and check-in credential issuance are implemented but
disabled by default; Nexus does **not** charge money. Any conference title, fee, program or venue must be
confirmed and published by authorized DIG staff.

## Implemented behavior (requires isolated staging validation)

- Attendees do **not** need a DIG membership. They are kept in separate
  `nexus_conference_attendees` and `nexus_conference_enrollments` tables; no
  `nexus_members`, voting, directory, dues or newsletter record is created.
- Verified Google sessions and separate email magic-link login are implemented.
  Magic login is behind default-off `MAGIC_LINK_ENABLED` and independently
  gated `MAGIC_LINK_EMAIL_ENABLED`; it does not require DIG membership.
  No browser-supplied `memberId`, email, or role is trusted.
- `GET /conference/:slug` shows an accessible self-service enrollment shell.
  Only session-verified users can call attendee APIs. Published agendas remain
  available at `/events/:slug` independently.
- `POST /api/conference/:slug/register` accepts only a display name and uses
  the verified sign-in email. Enrollment is rejected unless the event is both
  published and explicitly `registration_open`. Idempotent retries return the
  same random confirmation reference; changing verified identities with a
  duplicate email fails closed. This is a **reference**, never an auth token,
  ticket or payment receipt.
- `GET /api/conference/:slug/me` returns only the current person's enrollment,
  private request and workshop selections. It cannot list other attendees.
- `POST /api/conference/:slug/workshops` reserves or cancels a *published*
  workshop. Atomic event-row locking ensures no overbooking; full workshops
  offer a time-ordered waitlist. Cancelling a confirmed seat promotes an
  eligible waitlistee. Confirmed overlapping workshops are prohibited.
- `POST /api/conference/:slug/cancel` cancels the conference place, cancels
  workshops and removes the accommodation request for eligible cancellations.
  Free-event cancellations promote the oldest eligible event waitlistee. Paid
  cancellations and waitlist promotions require the review policy described in
  [PAID-INVENTORY.md](PAID-INVENTORY.md); already-paid self-service cancellation
  is rejected pending organizer refund processing. No automatic refund is issued.
- `PUT /api/conference/:slug/accommodations` accepts a private note **only**
  with explicit request-specific consent, or deletes it with `request: null`.
  Never send this field to newsletter, analytics, attendee exports, public
  speaker profiles or the QR/check-in system.
- `GET /coordination/:slug` is a separate, server-authenticated coordinator
  shell. `GET /api/conference/:slug/coordination` returns requests only to
  explicitly assigned event coordinators via
  `nexus_conference_access_coordinators`. Reading this sensitive information
  appends a metadata-only audit entry. Ordinary event managers and editors do
  not automatically gain access.

## Transaction and privacy boundaries

- All attendee writes use one PostgreSQL function per request. Enrollment,
  workshop selection, cancellation and accommodation updates acquire an event
  row lock; organizer changes use the same lock. New events stay unpublished
  and registration-closed by default.
- Read access always uses the *verified issuer and immutable subject*, not a
  client-provided email. An existing email with another verified identity is a
  conflict for staff resolution, never automatic account linking.
- Confirmation references are random opaque identifiers returned only in the
  signed-in user's view. The transactional notification outbox and delivery/retry
  pipeline are implemented but separately gated; no live MailerSend delivery
  is enabled by this implementation.
  Marketing consent is independent and is never inferred from registration.
- Accommodation requests are sensitive personal information. Minimize notes,
  do not log request bodies, define retention and staff access review, and
  test with Deaf, DeafBlind, captioning and keyboard/screen-reader participants
  before production. Database encryption/access controls and backups need an
  independent privacy review.
- Registration is not payment authorization. Capacity allocation does not
  guarantee a paid ticket. Signed webhooks and independent payment retrieval
  are implemented behind disabled gates; validate them and the manual refund
  and seat-release policy before selling admissions.
- The attendee page clearly discloses that requests do not guarantee specific
  services until organizers confirm them.

## Deployment gates and operator controls

1. Use the selected Docker + Caddy + Neon runtime. Apply migrations 001–014
   in order on an explicitly authorized isolated staging database. Migration
   014 is being integrated separately for auth/payment recovery; require that
   migration and its tests after merge before validating the integrated release.
   Never apply to production simply to test functionality.
2. Create the NTC event, review agenda and published workshop capacities, and
   obtain organizer approval for publication. A privileged administrator may
   enable `nexus_events.registration_open=true` only for that reviewed event;
   there is deliberately no public API to open registrations.
3. Verify real Google sign-in, session revocation, same-origin policy, rate
   limiting on the chosen Docker/Caddy staging origin. Worker/Cloudflare
   bindings are historical alternatives, not deployment requirements. Keep
   `CONFERENCE_REGISTRATION_ENABLED=false` until the release gate is approved.
4. Explicitly assign coordinator members using audited administrative database
   procedure to `nexus_conference_access_coordinators`. There is no HTTP
   endpoint for coordinator self-assignment.
5. Test guest/workshop concurrency, refunds and the cancellation policy,
   translated/ASL/captioned instructions, accessible validation, coordinated
   follow-ups and confidential-data retention. The system currently supports
   **individual attendees only**, not dependent/guest registration.
6. Validate the implemented, independently gated transactional email, payment
   reconciliation and QR/check-in paths before any public NTC launch.
   `/checkin/:slug` and its script require both `NTC_TICKETING_ENABLED=true`
   and `NTC_CHECKIN_ENABLED=true` plus a verified Google session. The shell
   contains no attendee data; each API check-in additionally requires explicit
   event staff assignment in the database. `NTC_TICKETS_ENABLED` separately
   controls credential issuance. All flags remain disabled by default.

## Local verification

- `node --test nexus/api/conference-*.test.mjs`
- Historical milestone CI: the DIG Nexus unit workflow validated a Worker
  `wrangler deploy --dry-run` bundle (not a deployment).
- Historical milestone CI: the PostgreSQL 17 workflow applied schema 007 and ran
  `nexus/tests/conference-integration.sql` (always ROLLBACK), and ran
  `nexus/tests/conference-concurrency.sh` against a **disposable local** service,
  where two independent DB connections race for one event place and one
  workshop seat. The shell script refuses remote or non-explicit databases.

Local Node tests use synthetic stubs and require no Neon or provider calls.
SQL/concurrency checks require a separately prepared disposable local database;
they are not covered by Node tests. Synthetic tests do not establish live readiness.
No real member or attendee data was created by the historical milestone.

## Payment, notifications, and check-in extension

Migration 009 adds Zeffy payment reconciliation, queued transactional email,
opaque QR credentials, and staff check-in. See [DOCKER.md](DOCKER.md) for the
current Docker/Neon deployment target and every live-enablement gate. Zeffy
collects money on its own hosted campaign: returning to Nexus does not prove
payment, and a receipt reference cannot be presented as a QR credential.

## Paid admission lifecycle (migration 013)

**The original immediate `registered` result now applies to free events only.**
For a paid Zeffy-configured event, attendee registration creates a
`pending_payment` request with no held seat. Only a verified settled Zeffy
payment can atomically confirm admission. The optional existing Docker jobs
worker can close expired intents; refunds, late charges, capacity mismatches
and paid cancellations are reviewed manually. Read
[PAID-INVENTORY.md](PAID-INVENTORY.md) before enabling ticket sales.
