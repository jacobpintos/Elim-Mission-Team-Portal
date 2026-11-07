# Roadmap

Where the app is going, in five stages, and what each one means for the code.

**Where we are:** Stage 0, working towards Stage 1. Nothing past Stage 1 is
built. What *is* built is the groundwork that keeps the later stages from
needing a rewrite (see [Groundwork already in the code](#groundwork-already-in-the-code)).

| Stage | What it is | Who uses it |
|---|---|---|
| **1** | One operational platform: planning, procedures and equipment connected, Miriam running all of it in plain language | The Well and its network |
| 2 | Multi-tenant: partner churches on their own accounts, free or reduced cost, feeding back | The Well + partner churches |
| 3 | Subscriptions: a pay gate, about $100/month for small and medium churches | Paying churches |
| 4 | Traveling pastors, worship bands, touring artists; fan outreach; ticket links; an approval process | Churches, ministries, bands |
| 5 | Discovery: the public find events near them that match what they like, across every organization | The public |

---

## Stage 1: one operational platform

**Done means:** The Well's planning systems, operational procedures and
physical equipment all talk to each other, and Miriam can work any of them by
being asked.

### What's already there

- **Planning:**
  - events, with availability, teams, carpools, lodging, flights, food, a schedule and report times;
  - set lists and chord sheets;
  - input lists (Sunday, Event, WH2);
  - planning boards, tasks, task templates, meetings and reminders.
- **Procedures:**
  - task templates put on events;
  - Issues (five whys, root cause, corrective actions) and Kaizen;
  - reimbursements and outside bills, from request to paid;
  - security reports;
  - the Production Checklist, a member's own site shown under Operations.
- **Equipment:**
  - the sound desk (Behringer X32): levels and mutes in the house and in people's ears, plus pack and mic swaps;
  - the video switcher (ATEM): preview, cut, auto and fade to black, with the Video screen and its multiview;
  - vehicles and the carpool planner;
  - inventory and reordering.
- **Miriam:** plain-language requests for nearly all of the above, and a daily briefing.

### What Stage 1 still needs

- [ ] **The equipment, tried at church.** The sound desk, switcher and
      encoder code has only run against test stand-ins. It needs a Sunday on
      the real X32, the real ATEM and a real encoder.
- [ ] **Procedures that can run equipment.** Run sheets kept in the app,
      such as *Service start* or *Teardown*, each a list of steps. Some steps
      are things to check; others are equipment actions written as Miriam
      would be asked ("fade up from black", "camera 1", "unmute the
      pastor's mic in the house"). Each is attached to an event, worked through by tapping,
      or started by asking Miriam to run it. The Production Checklist is a
      member's own site, so whether it moves in is their decision.
- [ ] **Input lists ↔ the sound desk.** Compare the input list with the
      desk's channel names, and send the names to the desk. This needs
      deciding which row is which desk channel.
- [ ] **Events ↔ rooms and equipment.** An event says which input list and
      setup it uses, so Miriam and the procedures know which one applies.
- [ ] **Issues ↔ inventory.** An equipment issue linked to the inventory
      item it's about.
- [ ] **"Our network" defined.** If it means other ministries or campuses,
      they are groups inside The Well at Stage 1, not separate organizations.
      Separate organizations are Stage 2.

---

## Groundwork already in the code

These parts of the code are where the later stages plug in. Use them for new
work, so the later stages don't need to find and change every place that
assumes The Well.

| Groundwork | Where | What it's for |
|---|---|---|
| **One organization profile:** names, kind, time zone, home, mailing address, the app's address | `src/custom` (`ORG.profile`), and `functions/src/org.ts` on the server; `src/lib/orgProfile.test.ts` keeps them the same | Nothing else in the code hard-codes "The Well of Iowa", Central time or North Liberty. At Stage 2 this becomes each organization's record |
| **Plan and equipment:** `ORG.plan`, `ORG.equipment`, and `orgCan(feature)` | `src/lib/entitlements.ts` | The one question "may this organization use this?" The Sound Engineer and Video Operator jobs, their Settings sections, the Video tab, and Miriam's desk and camera requests all ask it. At Stage 2 partner churches get only what they have; at Stage 3 a plan decides it |
| **Organization-specific features** | `src/custom` (The Well's vehicles, Elim Van, carpool rules) | Anything only one organization has stays there, switched on per organization |

**Rules for new work until Stage 2:**
- Name the organization through `ORG.profile` (`ORG_NAME` and `APP_URL` in `src/lib/orgInfo.ts`; `ORG` and `todayInOrg()` on the server), never as text.
- A new feature that needs equipment or could be a paid extra gets an `AppFeature` and is checked with `orgCan`.
- Something only The Well has goes in `src/custom/theWell`.
- Don't build multi-organization data, billing, ticketing or discovery yet.

---

## Stage 2: partner churches (multi-tenant)

**The decision: one app and one backend, with each organization's data kept
apart by an organization id.** Not a separate build for each church, because:
- Apple turns down apps made from a template unless the content's owner
  submits them (App Review Guideline 4.2.6), so each church would need its
  own developer account;
- Stage 5 needs every organization's public events in one place;
- one app is one thing to keep running.

What it takes:
- **Data:** each organization's records under `orgs/{orgId}/…`. That's about
  50 collections, read and written in about 320 places in the app and 120 in
  the functions, with 57 rule blocks. A one-off migration copies The Well's
  data into `orgs/thewell`.
- **People:** an account can belong to more than one organization, with its
  role kept per organization (Firebase Auth custom claims). Picking an
  organization comes after sign-in.
- **Rules:** every rule checks that the person is in that organization.
- **Functions:** the nightly jobs run for each organization at its own
  midnight (`functions/src/org.ts` holds today's single time zone).
- **The profile and features:** they move from the build (`src/custom`) to
  each organization's record, read when someone signs in. The Well's custom
  features become switches other organizations can have too.
- **Equipment:** other desks and switchers. A Midas M32 already works like
  the X32; Allen & Heath, Yamaha and others go behind the same
  sound-desk interface (`src/lib/mixer`).
- **Costs per organization:** Miriam's AI, storage and messages are counted
  per organization from the start, so Stage 3's price is based on real
  numbers.
- **Onboarding:** set up an organization, invite its first admins, its own
  look (Admin → Theme), its own privacy and terms details, and data export
  and deletion per organization.

## Stage 3: subscriptions

- **Plans:** `OrgPlan` gains `partner` and paid plans. `PLAN_FEATURES` in
  `src/lib/entitlements.ts` says what each includes. Each organization's
  record holds its subscription status, kept current by the payment
  provider.
- **Where it's sold:** on the website to the church as an organization,
  rather than inside the app. Check Apple's and Google's payment rules first:
  App Review Guideline 3.1 covers this, including organizations buying for
  their own people.
- **Price:** $100/month needs to cover what one church costs to run,
  including Miriam's AI, and Stage 2's per-organization numbers will show
  that.

## Stage 4: ministries, bands and artists

- **More kinds of organization:** `OrgKind` gains `ministry` and `band`.
  Trips already cover lodging, flights, carpools and vehicles, which is
  touring.
- **Fan outreach:** the public side already has public accounts, posts,
  announcements, the store, livestream notices and invites.
- **Approval:** an organization is reviewed before it can publish publicly,
  so the app can turn away anything it doesn't want to promote. The tools
  for reporting objectionable content already exist.
- **Tickets:** first a ticket link on an event, then a ticketing service
  such as Ticketmaster's, which has its own terms to meet.
- **Bringing on a developer:** the README, these docs, the tests and CI are
  what they'll work from. Keep them current.

## Stage 5: discovery

- **What's there:**
  - public users already give their city and a travel radius ("When is Elim coming to my area?");
  - public events have a city, state and map position, a description, a cover photo and a Facebook link.
- **What's needed:**
  - event types and people's preferences;
  - one public index of events across all organizations, kept up to date by a function whenever an event is published, and searchable by distance;
  - ticket links.
- **Boosted events:** any event moved up the list, including The Well's
  own, is marked as promoted.
