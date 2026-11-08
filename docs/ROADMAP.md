# Roadmap

Where the app is going, in five stages, and what each one means for the code.

**Where we are:** Stage 0, working towards Stage 1. Nothing past Stage 1 is
built. What _is_ built is the groundwork that keeps the later stages from
needing a rewrite (see [Groundwork already in the code](#groundwork-already-in-the-code)).

| Stage | What it is                                                                                                                 | Who uses it                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| **1** | One operational platform: planning, procedures and equipment connected, Miriam running all of it in plain language         | The Well                    |
| 2     | Multi-tenant: our network, the outside churches we partner with, on their own accounts, free or reduced cost, feeding back | The Well + partner churches |
| 3     | Subscriptions: a pay gate, about $100/month for small and medium churches                                                  | Paying churches             |
| 4     | Traveling pastors, worship bands, touring artists; fan outreach; ticket links; an approval process                         | Churches, ministries, bands |
| 5     | Discovery: the public find events near them that match what they like, across every organization                           | The public                  |

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
    It is The Well's alone (`src/custom/theWell/production`); other
    churches get the Pre-service Checklist in its place (see Stage 2).
- **Equipment:**
  - the sound desk (Behringer WING): levels and mutes in the house and in
    people's ears, pack and mic swaps, moving or swapping channels with every
    setting (direct outs and side-chains follow), and loading scenes from the
    open show (next, previous, by number; saving stays on the desk);
  - the input lists and the sound desk: rows line up with the board, so a
    Sound Engineer can compare a list with the desk's names and send either
    side's names to the other (Worship → Input List), or ask Miriam to
    "send the Sunday input list to the desk";
  - the video switcher (ATEM): preview, cut, auto and fade to black, with the Video screen and its multiview;
  - vehicles and the carpool planner;
  - inventory and reordering.
- **Miriam:** plain-language requests for nearly all of the above, and a daily briefing.

### What Stage 1 still needs

- [ ] **The equipment, tried at church.** The sound desk, switcher and
      encoder code has only run against test stand-ins. It needs a Sunday on
      the real WING, the real ATEM and a real encoder. On the WING, Setup →
      Remote must have OSC on and its Remote Lock off.
- [ ] **The input lists on the real desk.** Rows line up with the board
      in its own order: inputs 1–40 are channels and 41–48 the aux inputs;
      outputs 1–16 are the 16 buses. That needs checking against the real
      WING.
- [ ] **Events ↔ rooms and equipment.** An event says which input list and
      setup it uses, so Miriam and the procedures know which one applies.
- [ ] **Issues ↔ inventory.** An equipment issue linked to the inventory
      item it's about.

**Decided:** The Well's procedures stay in its Production Checklist, a
member's own site. "Our network" means the outside churches we partner
with, which is Stage 2.

---

## Groundwork already in the code

These parts of the code are where the later stages plug in. Use them for new
work, so the later stages don't need to find and change every place that
assumes The Well.

| Groundwork                                                                                     | Where                                                                                                                    | What it's for                                                                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **One organization profile:** names, kind, time zone, home, mailing address, the app's address | `src/custom` (`ORG.profile`), and `functions/src/org.ts` on the server; `src/lib/orgProfile.test.ts` keeps them the same | Nothing else in the code hard-codes "The Well of Iowa", Central time or North Liberty. At Stage 2 this becomes each organization's record                                                                                                                                                                                                                                      |
| **Plan and equipment:** `ORG.plan`, `ORG.equipment`, and `orgCan(feature)`                     | `src/lib/entitlements.ts`                                                                                                | The one question "may this organization use this?" The Sound Engineer and Video Operator jobs, their Settings sections, the Video tab, and Miriam's desk and camera requests all ask it. At Stage 2 partner churches get only what they have; at Stage 3 a plan decides it                                                                                                     |
| **Organization-specific features**                                                             | `src/custom` (The Well's vehicles, Elim Van, carpool rules, Production Checklist)                                        | Anything only one organization has stays there, switched on per organization                                                                                                                                                                                                                                                                                                   |
| **Pre-service Checklist**                                                                      | `src/features/preservice`                                                                                                | What a church without its own checklist gets on Operations' first tab, built now so partner churches have it at Stage 2. Admins build the list and give each item to people; each person checks off their own and sees how far along everyone is; admins see and can check the whole list. It starts fresh for each service day. The Well doesn't see it, since it has its own |

**Rules for new work until Stage 2:**

- Name the organization through `ORG.profile` (`ORG_NAME` and `APP_URL` in `src/lib/orgInfo.ts`; `ORG` and `todayInOrg()` on the server), never as text.
- A new feature that needs equipment or could be a paid extra gets an `AppFeature` and is checked with `orgCan`.
- Something only The Well has goes in `src/custom/theWell`.
- Don't build multi-organization data, billing, ticketing or discovery yet.

---

## Stage 2: partner churches (multi-tenant)

Our network: the outside churches we partner with, trying the app free or
for a reduced price and telling us what to improve. What they get that The
Well doesn't have is already built: the Pre-service Checklist, in place of
The Well's Production Checklist.

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
- **Equipment:** other desks and switchers. The WING and the X32 both
  work already (a Midas M32 works like the X32), each behind the same
  sound-desk interface (`src/lib/mixer`: `deskModel`, `wing`, `x32`);
  Allen & Heath, Yamaha and others would go behind it too.
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
