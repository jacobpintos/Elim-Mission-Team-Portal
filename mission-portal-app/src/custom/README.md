# Custom code

What one organization's build has that another's wouldn't.

The app is one codebase today, built for The Well of Iowa. The plan is for it
to serve other churches and teams later, each with its own account and its own
people. Everything here is specific to one of them, so it can be switched on
for that organization and left out of everyone else's build.

- `index.ts` names the organization this build is for (`ORG`) and what its
  module adds. Core code asks `ORG` whether a custom feature is on and never
  imports from an organization's folder directly, only through these:
  - `index.ts`: the manifest — data only, so the app's logic and its tests can
    read it without loading a screen.
  - `ui.tsx`: its screens, for core screens to show (null without them).
  - `miriam.ts`: what Miriam may look up and change for it (empty without).
  - `carpool.ts`: seating rules it keeps for the app's Auto-assign (none without).
- One folder per organization (`theWell/`), with its manifest in `index.ts`.

## The Well (`theWell/`)

| Feature             | Where                                                                                                                | What it keeps                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Vehicles            | Admin → Vehicles (`vehicles/`)                                                                                       | `vehicles/{id}` in Firestore, admins only (`firestore.rules`)  |
| Carpool planner     | An event's carpool: Plan from vehicles (`carpool/`)                                                                  | Nothing of its own: the cars it plans are saved as the event's |
| Miriam and vehicles | `add_vehicle`, `update_vehicle`, `remove_vehicle`, `read_vehicles` (`miriam.ts`, and `functions/src/miriam/plan.ts`) | The same `vehicles` documents                                  |

Special rules for people (`people/`) sit under the vehicles, in Admin → Vehicles,
kept in `carpoolPeople/{uid}` (admins only): doesn't drive, can't pull a
trailer, can ride with the other sex, keep with, keep apart, and a note shown
on the plan. The planner follows all of them; the app's own Auto-assign and
Miriam's carpools follow the seating ones, through `carpool.ts`. People who
share a last name may ride together whatever their sex — that one is the
app's own (features/events/carpoolAssign), for everyone.

The Elim Van (`vehicles/elimVan.ts`) is the church's own: 15 seats, driven by
anyone who may drive another of the vehicles, carrying men and women together,
and filled first when it goes so fewer cars are needed. It is asked about each
time a carpool is planned ("Bring the Elim Van?"), and never brought in another
vehicle's place when a driver can't drive.

## Adding an organization

1. Add a folder beside `theWell/` with an `index.ts` exporting its `OrgModule`.
2. Point `ORG` in `index.ts` at it for that organization's build.
3. Its Firestore collections and rules go in `firestore.rules`, marked with the
   organization's name, as the Well's are.
