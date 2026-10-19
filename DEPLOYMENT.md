# Cloudflare deployment (free plan)

The GitHub Pages member URL remains active on its existing backend until migration is verified.
Cloudflare hosts the standalone member view and `/admin` dashboard, backed by D1.

## Cloudflare Git build settings

- Repository: TikTokMentorshipwithRileigh/WeeklyTracker
- Branch: main
- Project name: weeklytracker
- Build command: npm run build:cloudflare
- Deploy command: npm run deploy:cloudflare
- D1 database: tiktokcore-tracker (binding DB, configured in wrangler.json)

Deploy applies only additive schema migrations. Existing records are not deleted.
Stay on the Workers Free plan; no paid disk, Render service, or domain is required.

## Runtime secrets

In the Worker's Settings → Variables and Secrets, add these as Secret values:

- ADMIN_PASSWORD: a unique password of at least 12 characters, shared only with admins.
- MEMBER_PASSWORD: the existing shared member password.
- RECORD_KEY_SECRET: a random value of at least 32 characters; keep stable.
- SESSION_SECRET: a separate random value of at least 32 characters.

Do not commit these values to GitHub. Before secrets are configured the API returns a setup error and exposes no records.
Admin sessions use secure HttpOnly cookies, expire after eight hours, and can be logged out.
Members never receive admin notes or other members' records. Existing name/shop matching remains case-sensitive, trimming surrounding whitespace.

## Cutover checklist

1. Deploy and configure secrets.
2. Test the new /admin login, member form, notes, and Trash/restore using disposable records.
3. Export the existing private member/check-in records securely from the current backend. Never commit records or exports to this public repository.
4. Convert/import records to D1, preserving member/check-in IDs, historical reportingCycle and endDate values. Derive access_key with HMAC-SHA256 of JSON.stringify([name,shop]) using RECORD_KEY_SECRET.
5. Verify member/check-in counts and sample histories against the source. Reconcile submissions received during migration before switching.
6. Update src/main.tsx's GitHub Pages API and mentor links to the verified Cloudflare address, then deploy GitHub Pages. Its member URL stays the same.
7. Retain the previous backend until migration and rollback checks pass.

The Cloudflare admin route uses same-origin cookies. The member API permits only the existing GitHub Pages origin through CORS. Preview deployments must use a separate test database and secrets.

## Validation

npm test runs both the Node prototype and asynchronous D1 adapter tests against real SQLite.
npm run build:cloudflare builds the independent dashboard.
npx wrangler deploy --dry-run bundles the Worker without publishing it.
