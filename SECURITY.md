# Security

## Reporting a vulnerability

Please do **not** open a public issue for a security problem. Use GitHub's
[private vulnerability reporting](https://docs.github.com/code-security/security-advisories/guidance-on-reporting-and-writing/privately-reporting-a-security-vulnerability)
on this repository, or email the maintainer listed in the repository profile.

Include what you did, what happened, and what you expected. A proof of concept
helps but is not required.

## What this software handles

Every install stores third-party API keys. They are encrypted at rest with
AES-256-GCM using `APP_SECRET` and are never returned to the browser after
being saved — the settings screens show a masked value only.

That protection is only as good as your `APP_SECRET`. Anyone who obtains both
your database and your `APP_SECRET` can decrypt every stored key.

## Running an install safely

- **Set a long random `APP_SECRET`.** 32+ characters. Never reuse one between
  installs, and never commit it.
- **Set `CRON_SECRET`.** Without it, `/api/cron/tick` is open to anyone who
  finds the URL. They cannot read anything, but they can make your install burn
  its free-tier quota.
- **Use a strong admin password.** There is no rate limiting on `/admin/login`
  yet, and no email-based password reset.
- **Keep the database private.** On Supabase that means not exposing the
  Postgres credentials, and not enabling anonymous access to these tables.
- **`/admin/setup` only works while no account exists.** Complete it
  immediately after deploying; a public deploy with no account is an open door
  until someone claims it.

## Known limitations

These are deliberate scope decisions, not oversights. If they matter to you,
they are reasonable things to contribute.

- Single-tenant. Every account that can sign in is an administrator.
- No login rate limiting or account lockout.
- No password reset flow — recovery is done by deleting the user row.
- The header/footer editor executes whatever HTML an admin pastes. That is its
  purpose; it means admin access is equivalent to code execution on the page.
