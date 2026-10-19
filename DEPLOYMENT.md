# Standalone mentorship dashboard — deployment handoff

This branch is prepared for independent hosting. It does not change the current live tracker until deployment and migration are completed.

## Behavior
- `/`: member tracker; shared member password, then exact first/last name and shop matching.
- `/admin`: shared admin password with server-validated, HttpOnly, Secure, SameSite cookie sessions lasting 8 hours. No ChatGPT account required.
- Admin roster names open individual history. All six metrics, wins, whines, and questions are broken out per submission.
- Notes on each check-in, each member, and each Sunday–Saturday reporting week. Admin-only. Concurrent stale note saves are rejected rather than overwriting another admin's edit.
- Move submissions to Trash / restore. Trashed results disappear from member results and active totals. Members cannot recreate a trashed week without admin restoration.
- Shared admin credentials do not identify who edited a note. All holders of the admin password have the same access.

## Hosting
`render.yaml` prepares a Node 24 web service and a 1 GB persistent disk. This is BILLABLE infrastructure; confirm current price and owner approval before creating it. Never run this service using ephemeral storage.

Set private runtime environment variables (never GitHub source):
- `ADMIN_PASSWORD`: a distinct password of at least 12 characters chosen for the admin team.
- `MEMBER_PASSWORD`: the existing shared member password.
- `RECORD_KEY_SECRET`: cryptographically random, at least 32 bytes recommended.
- `SESSION_SECRET`: cryptographically random; Render can generate it.
- `DATABASE_PATH`: `/var/data/tracker.sqlite`.
- `APP_ORIGIN`: public HTTPS origin if not using Render's automatic `RENDER_EXTERNAL_URL`.

The standalone build requires `VITE_STANDALONE=true` and `npm run build:standalone`. The existing GitHub Pages build continues using its existing remote backend unless explicitly migrated.

## Data migration and cutover (not completed)
1. Choose a short cutover window; keep the old tracker authoritative until the new host is configured.
2. Securely export ALL old `members` and `checkins` rows, with pagination; save privately outside GitHub.
3. Pause old submissions during final export/import so none are lost. Do not delete the old database.
4. With the new service stopped and empty database, run `node server/import.mjs /private/path/export.json` with runtime secrets loaded securely. The importer recomputes identity keys and keeps member/check-in IDs, reporting dates, and answers.
5. Compare member counts, entry counts, and representative totals against the old database. Verify member unlock, save/edit/read, admin login, notes, Trash and restore in production.
6. Give the admin team the new `/admin` link. Update or redirect the old GitHub member link only after verification. Keep a rollback backup and retain the old service until the migration is confirmed.

Do not include exported records, passwords, database files or secrets in the repository.

## Validation
`npm test` exercises the real SQLite-backed API in memory, including password boundaries, session forgery, member isolation, note privacy, stale-save conflicts, Trash/restore, blocked resubmission of archived records, origin checks, period/metric validation, and idempotent saves. `npm run build:standalone` verifies the frontend compilation.

## Operations
Back up the SQLite database using a consistent SQLite backup mechanism, not a live file copy that omits WAL data. Render disk snapshots are an additional recovery mechanism. Rate limits are currently conservative per application-visible socket address; validate the trusted proxy/IP configuration before growing traffic.
