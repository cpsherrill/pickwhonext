# Deploying pickwhonext

Firebase Hosting, project `pickwhonext`, site `pickwhonext`. Owner
account: `colin@crowable.com` (`firebase login` first if needed).

## Status

Project `pickwhonext` created 2026-09-02 (display name "Pick Who Next").
Domain **pickwhonext.com** registered at GoDaddy 2026-09-02; DNS to be
hosted on Route 53 (GoDaddy nameservers pointed at the Route 53 zone),
Route 53 pointed at Firebase.

## Redeploy (the two commands)

```sh
python3 tools/build_data.py
firebase deploy --only hosting --project pickwhonext
```

Rebuild the data first, every time, during draft week. The build date
shows in the footer and on /how.

## Custom domain

In the Route 53 hosted zone for pickwhonext.com:

- `A` `@` → `199.36.158.100`
- `TXT` `@` → `hosting-site=pickwhonext`
- `CNAME` `www` → `pickwhonext.web.app` (or add www as a second custom
  domain in the console and let it redirect)

Then console → Hosting → Add custom domain → `pickwhonext.com`, or the
REST call from ../jokejudge/DEPLOY.md with the project and site swapped.

## Analytics

`index.html` has `window.GA_ID = ""`. Nothing loads until it is set.
To turn it on: create a GA4 property (analytics.google.com → Admin →
Create property → Web stream for pickwhonext.com), paste the
`G-XXXXXXXXXX` measurement ID into `GA_ID`, deploy. Events sent:
`draft_started`, `pick_recorded`, `draft_completed`, each with format
and league size. Mark `draft_completed` as a key event in GA4, then in
Google Ads link the property and import it as a conversion.
