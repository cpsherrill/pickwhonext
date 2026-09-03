# Google Ads: the 2026 campaign

> Status 2026-09-03: the Analytics route below did not work this year.
> Neither GA4 property processed a hit in its first day, so the
> conversion is measured with the Ads tag directly (`AW_ID` and
> `AW_LABEL` in index.html). Ads had to be unlinked from Analytics for
> the manual conversion path to appear. Everything else here held up.

The experiment: does a paid click turn into a finished draft, and what
does one cost. Small budget, one Search campaign, five days. Written
2026-09-02; reuse next August with the dates moved.

## Account setup (once)

1. ads.google.com, same Google account as Analytics. The signup flow
   pushes a Smart campaign. Find "Switch to Expert Mode" or "Create an
   account without a campaign" and take it.
2. Billing country, time zone (America/New_York), currency USD. Card.
3. Advertiser verification may be requested at any point. Do it when
   asked; ads can pause until it clears.
4. Link Analytics: Analytics Admin, Product links, Google Ads links,
   choose the Ads account. Or Ads Tools, Data manager. Same login.
5. Conversion: Ads Goals, Conversions, New conversion action, Import,
   Google Analytics 4 properties, Web, choose draft_completed. Only
   works once GA4 lists the event as a key event.

## Campaign settings

- Type: Search. Objective: skip, or "Website traffic".
- Networks: Google Search only. Uncheck Display Network and Search
  partners.
- Location: United States. Target "Presence: people in or regularly
  in" (not "interested in").
- Language: English.
- Bidding: Maximize clicks, with a maximum CPC bid limit of $2.00.
  Switch to Maximize conversions only after 15+ conversions exist.
- Daily budget: $30 to $50. Google may spend up to 2x on a given day.
- Dates: start now, end 2026-09-10 (kickoff). Nothing converts after.
- Ad schedule: all hours. Drafts happen evenings and weekends.
- Auto-tagging: on (default). GA4 attribution needs it. No UTMs.
- Final URL: https://pickwhonext.com/
- Sitelink asset: "How it works" -> https://pickwhonext.com/how

## Ad group: draft helper

Phrase match keywords (type them with quotes):

    "fantasy football draft tool"
    "fantasy football draft helper"
    "fantasy football draft assistant"
    "who should i draft fantasy football"
    "fantasy draft cheat sheet ppr"
    "fantasy draft cheat sheet half ppr"
    "snake draft helper"
    "best available fantasy football"
    "fantasy football draft advice"
    "live draft assistant fantasy football"
    "fantasy football draft pick helper"

Negative keywords (campaign level):

    auction
    dynasty
    best ball
    mock
    simulator
    nfl draft
    basketball
    baseball
    hockey
    soccer
    login
    app
    jobs

## Responsive search ad

Headlines (30 characters max each):

    Who Should You Draft Next?
    Fantasy Draft Second Screen
    Snake Draft Pick Helper
    PPR, Half PPR, or Standard
    No Account. No Install.
    Built for Your Roster
    Free Fantasy Draft Tool
    Fresh ADP and Projections
    Works on Your Phone
    See Position Runs Coming

Descriptions (90 characters max each):

    Mark picks as they happen. It names your next pick, adjusted for your roster.
    Real ADP and projections for PPR, half PPR, and standard. Free, no account needed.
    Sees the position runs coming and tells you what you lose by waiting a round.
    Explains every recommendation. Read the method before you trust it.

Display path: pickwhonext.com / draft / helper

## Policy

Fantasy content sits near Google's gambling policy. This is a free
informational tool; no entry fees, no prizes, no money changes hands.
If an ad is disapproved, appeal with that sentence.

## What to read afterward

- Cost per click, by keyword. Kill anything over $3 after 20 clicks.
- Search terms report: which real queries triggered ads. Add the junk
  as negatives, add the good surprises as keywords.
- In GA4: draft_started vs draft_completed by source. The ratio is the
  product question. The cost per draft_completed is the money question.
