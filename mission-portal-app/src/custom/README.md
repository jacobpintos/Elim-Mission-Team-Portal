# Custom code

What one organization's build has that another's wouldn't.

The app is one codebase today, built for The Well of Iowa. The plan is for it
to serve other churches and teams later, each with its own account and its own
people. Everything here is specific to one of them, so it can be switched on
for that organization and left out of everyone else's build.

- `index.ts` names the organization this build is for (`ORG`) and what its
  module adds: who it is (`profile`: names, time zone, home, addresses),
  its plan, the equipment it has, and its own features. Core code names the
  organization through `profile` and asks `orgCan` (`src/lib/entitlements`)
  whether it may use something, so the next organization changes only its
  manifest (docs/ROADMAP.md). Core code asks `ORG` whether a custom feature is on and never
  imports from an organization's folder directly, only through these:
  - `index.ts`: the manifest — data only, so the app's logic and its tests can
    read it without loading a screen.
  - `ui.tsx`: its screens, for core screens to show (null without them).
  - `miriam.ts`: what Miriam may look up and change for it (empty without).
  - `carpool.ts`: seating rules it keeps for the app's Auto-assign (none without).
- One folder per organization (`theWell/`), with its manifest in `index.ts`.

## The Well (`theWell/`)

Turning an event's carpool on opens Auto-fill (`carpool/VehiclePlanner.tsx`):
the carpool planned from the vehicles, done, with its questions (trailers,
"Bring the Elim Van?") answered None and No above it. Every part of it can be
changed there, and then: Use this plan, Pick cars & drivers (the builder's
Auto-assign, with the plan's vehicles and drivers to change and the riders
filled again), or Start over manually (the builder, with no cars). Anyone
can be dragged (or tapped, then sent) to another vehicle, onto someone to swap
places, or into a driver's seat; from the first move on nobody else moves on
their own, and Re-plan arranges everyone again in the same vehicles. A vehicle
may sit with no driver, or too many in it, while people are moved — it says
so, and the plan can't be used (nor the builder's cars saved) until it's fixed.

| Feature             | Where                                                                                                                | What it keeps                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Vehicles            | Admin → Vehicles (`vehicles/`)                                                                                       | `vehicles/{id}` in Firestore, admins only (`firestore.rules`)  |
| Carpool planner     | An event's carpool: Plan from vehicles (`carpool/`)                                                                  | Nothing of its own: the cars it plans are saved as the event's |
| Miriam and vehicles | `add_vehicle`, `update_vehicle`, `remove_vehicle`, `read_vehicles` (`miriam.ts`, and `functions/src/miriam/plan.ts`) | The same `vehicles` documents                                  |

Special rules for people (`people/`) sit under the vehicles, in Admin → Vehicles,
kept in `carpoolPeople/{uid}` (admins only): doesn't drive, can't pull a
trailer, can ride with the other sex, keep with, keep apart, and a note shown
on the plan. The planner follows all of them; the app's own Auto-assign and
Miriam's carpools follow the seating ones, through `carpool.ts`. They are for
the app's own choosing only: whatever is arranged by hand is left as it was
put — anyone going can be picked to drive any vehicle in Auto-fill, or put in
any car in Auto-assign, which fills the rest around them. People who
share a last name may ride together whatever their sex, and a car with a man
and a woman of one family in it is open to anyone — that one is the app's own
(features/events/carpoolAssign), for everyone.

The Elim Van (`vehicles/elimVan.ts`) is the church's own: 15 seats, driven by
anyone who may drive another of the vehicles, carrying men and women together,
and filled first when it goes so fewer cars are needed. It is asked about each
time a carpool is planned ("Bring the Elim Van?"), and never brought in another
vehicle's place when a driver can't drive.

The texting list's texts come from (319) 249-0049 (`textingNumber` in
`theWell/index.ts`): what the Connect tab and Miriam tell people to text STOP
to. An admin can set another in Admin → Leadership Team.

## Adding an organization

1. Add a folder beside `theWell/` with an `index.ts` exporting its `OrgModule`.
2. Point `ORG` in `index.ts` at it for that organization's build.
3. Its Firestore collections and rules go in `firestore.rules`, marked with the
   organization's name, as the Well's are.
