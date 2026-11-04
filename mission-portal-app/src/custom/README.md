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
- One folder per organization (`theWell/`), with its manifest in `index.ts`.

## The Well (`theWell/`)

| Feature             | Where                                                                                                                | What it keeps                                                  |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Vehicles            | Admin → Vehicles (`vehicles/`)                                                                                       | `vehicles/{id}` in Firestore, admins only (`firestore.rules`)  |
| Carpool planner     | An event's carpool: Plan from vehicles (`carpool/`)                                                                  | Nothing of its own: the cars it plans are saved as the event's |
| Miriam and vehicles | `add_vehicle`, `update_vehicle`, `remove_vehicle`, `read_vehicles` (`miriam.ts`, and `functions/src/miriam/plan.ts`) | The same `vehicles` documents                                  |

The Elim Van (`vehicles/elimVan.ts`) is the church's own: 15 seats, driven by
anyone who may drive another of the vehicles, and asked about each time a
carpool is planned ("Bring the Elim Van?").

## Adding an organization

1. Add a folder beside `theWell/` with an `index.ts` exporting its `OrgModule`.
2. Point `ORG` in `index.ts` at it for that organization's build.
3. Its Firestore collections and rules go in `firestore.rules`, marked with the
   organization's name, as the Well's are.
