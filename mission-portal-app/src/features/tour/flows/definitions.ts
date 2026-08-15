import type { TourFlow } from '../types'
import { ADMIN_SECTIONS } from '@/lib/adminSections'
import { PUBLIC_SURFACE_ENABLED, EMAIL_FEATURES_ENABLED } from '@/lib/featureFlags'

/** The opening card — asks whether to take the tour. */
export const welcomeFlow: TourFlow = {
  id: 'welcome',
  title: 'Welcome',
  steps: [
    {
      id: 'welcome',
      title: 'Welcome to Mission Portal 👋',
      body: 'Want a quick tour of everything you can do here? It takes a couple of minutes, you can stop anytime, and nothing you tap during the tour is ever saved.',
      primaryLabel: 'Yes, show me around',
      secondaryLabel: 'No thanks',
    },
  ],
}

export const eventsFlow: TourFlow = {
  id: 'events',
  tab: 'events',
  title: 'Events',
  steps: [
    {
      id: 'events-intro',
      route: '/events',
      title: 'Events & the Calendar',
      body: 'Every gathering lives here. Switch between a month calendar and a list. Dots mark the days that have something scheduled — tap a day to see it.',
      bullets: ['Purple dot = virtual', 'Solid dot = in-person', 'Tap any event to open its card'],
      showcase: 'calendar',
    },
    {
      id: 'events-create',
      route: '/events',
      title: 'Adding an event',
      body: 'Admins tap “Create Event” to add one to the calendar. Fill in the basics, then flip on only the logistics this event needs.',
      bullets: [
        'One-time or recurring (weekly / biweekly / monthly)',
        'In-person (with address) or virtual (with a link)',
        'Toggles for food, carpool, flights and lodging',
      ],
      showcase: 'eventForm',
      adminOnly: true,
    },
    {
      id: 'events-logistics',
      route: '/events',
      title: 'Food, carpool, flights & hotels',
      body: 'Each toggle opens a builder so the whole trip is organized in one place. You can save even if some people aren’t assigned yet — the app warns you who’s missing.',
      bullets: [
        'Food: list items, people sign up to bring them',
        'Carpool: add cars, assign a driver and riders',
        'Flights: record each person’s outbound & return legs',
        'Lodging: add hotels/rooms and assign who stays where',
      ],
      adminOnly: true,
    },
    {
      id: 'events-teams',
      route: '/events',
      title: 'Teams & lists',
      body: 'When assigning people you can pick whole Groups or build per-event Teams with leaders and members. These lists come from the Admin panel.',
      bullets: [
        'Groups are managed in Admin → Groups',
        'Reusable rosters come from Admin → Common Teams',
        'Per-event teams can also be built on the fly',
      ],
      adminOnly: true,
    },
    {
      id: 'events-detail',
      route: '/events',
      title: 'The event card, filled out',
      body: 'This is what everyone sees once an event is set up. Tap any section to expand it — try the food sign-up and the availability buttons.',
      bullets: [
        'Date/time, weather, location & directions',
        'Dress code, food, carpool, teams, lodging, flights',
        'Export to your phone’s calendar (.ics)',
      ],
      showcase: 'eventDetail',
    },
    {
      id: 'events-availability',
      route: '/events',
      title: 'Availability',
      body: 'Members RSVP Yes / No / Partial / TBD. For recurring events you can answer the whole series or just one date. Admins see a grid of who’s available for which events.',
      showcase: 'availability',
    },
    {
      id: 'events-planning',
      route: '/events',
      title: 'Planning boards',
      body: 'Attach a planning board to an event for collaborative logistics — sticky notes, goals, checklists and connectors that the whole team can work on.',
      showcase: 'planningBoard',
    },
    {
      id: 'events-edit',
      route: '/events',
      title: 'Editing & deleting',
      body: 'Admins can edit any event from its card, or delete it (with a confirmation). Saving changes re-notifies anyone affected.',
      bullets: [
        'Edit re-geocodes the location if it changed',
        'Team / dress-code changes notify those people',
        'Delete keeps past availability as a record',
      ],
      adminOnly: true,
    },
    {
      id: 'events-updates',
      route: '/events',
      title: 'What happens when you save',
      body: 'Saving an event ripples through the app automatically — no extra steps needed.',
      bullets: [
        'It appears on everyone’s calendar and home screen',
        'Assigned people get notified and an RSVP prompt',
        'Tasks generate from the chosen task template',
      ],
    },
  ],
}

export const operationsFlow: TourFlow = {
  id: 'issues',
  tab: 'issues',
  title: 'Operations',
  steps: [
    {
      id: 'ops-intro',
      route: '/issues',
      title: 'Operations & Issues',
      body: 'Track anything that needs fixing or following up. Issues are color-coded by category and filtered by status so nothing falls through the cracks.',
      bullets: [
        'Report a new issue',
        'Filter by pending / in-progress / resolved',
        'Open one for full detail',
      ],
    },
    {
      id: 'ops-workflow',
      route: '/issues',
      title: 'From issue to resolution',
      body: 'Each issue moves through a clear workflow, and corrective actions can become tasks assigned to people.',
      bullets: [
        'Pending → Root cause → Corrective actions → Resolved',
        'Corrective actions can spin off assignments',
        'Admins can delete or reassign',
      ],
    },
    {
      id: 'ops-kaizen',
      route: '/issues/kaizen',
      title: 'Continuous Improvement (Kaizen)',
      body: 'Ideas for doing things better live on a Kanban board. Upvote them, move them across columns, and admins verify the result before it’s marked done.',
      showcase: 'kanban',
    },
    {
      id: 'ops-planning',
      route: '/issues/planning',
      title: 'Planning boards',
      body: 'Admins get free-form planning boards — a canvas of notes, goals, checklists and connectors that can be linked to a specific event.',
      showcase: 'planningBoard',
      adminOnly: true,
    },
  ],
}

export const worshipFlow: TourFlow = {
  id: 'worship',
  tab: 'worship',
  title: 'Worship',
  steps: [
    {
      id: 'worship-intro',
      route: '/worship',
      title: 'Worship',
      body: 'Everything the worship team needs lives under three tabs: Set Lists, Chord Sheets, and the Input List.',
      bullets: [
        'Plan set lists per service',
        'Store transposable chord charts',
        'Track stage inputs/channels',
      ],
    },
    {
      id: 'worship-setlist',
      route: '/worship',
      title: 'Building a set list',
      body: 'Add songs in order, attach details, and link the set list to an event. Try adding a song and previewing its chords below.',
      showcase: 'setlist',
    },
    {
      id: 'worship-chords',
      route: '/worship',
      title: 'Chord sheets',
      body: 'Charts are written once in the Nashville Number System and transpose to any key instantly. A “Chords Only” mode collapses repeats for quick reference.',
      bullets: [
        'Transpose to any key',
        'Chords-Only collapses repeated sections',
        'Supports imported PDFs & images',
      ],
    },
    {
      id: 'worship-notify',
      route: '/worship',
      title: 'Linking to an event',
      body: 'When you attach a set list to an event, the whole worship team is notified automatically so everyone’s practicing the same songs.',
    },
  ],
}

export const securityFlow: TourFlow = {
  id: 'security',
  tab: 'security',
  title: 'Security',
  steps: [
    {
      id: 'security-intro',
      route: '/security',
      title: 'Security & Incident Reports',
      body: 'Security staff see active reports with location, photos and witness info. Walk a report through its lifecycle below.',
      showcase: 'securityReport',
    },
    {
      id: 'security-respond',
      route: '/security',
      title: 'Responding to a report',
      body: 'Tap “On my way” so others know it’s covered, then “Resolve” when it’s handled. Resolved reports move to an archive you can reopen.',
      bullets: [
        '“On my way” broadcasts your status',
        'Resolve archives the report',
        'New reports notify all security staff',
      ],
    },
    {
      id: 'security-report-anyone',
      title: 'Reporting a concern',
      body: 'Anyone can file a report from the “Report a Concern” button in the side menu — add a description, location, witnesses and a photo.',
    },
  ],
}

export const inventoryFlow: TourFlow = {
  id: 'inventory',
  tab: 'inventory',
  title: 'Inventory',
  steps: [
    {
      id: 'inv-intro',
      route: '/issues/inventory',
      title: 'Inventory',
      body: 'Track merch and supplies across two tabs: Production (current stock) and Reorder (low-stock alerts). Adjust a count below.',
      showcase: 'inventory',
    },
    {
      id: 'inv-reorder',
      route: '/issues/inventory',
      title: 'Reorder alerts',
      body: 'Each item has a reorder threshold. When stock drops to or below it, the item automatically surfaces on the Reorder tab.',
    },
    {
      id: 'inv-admin',
      route: '/issues/inventory',
      title: 'Managing items',
      body: 'Admins can add, edit and delete items and organize them into categories.',
      adminOnly: true,
    },
  ],
}

export const messagesFlow: TourFlow = {
  id: 'messages',
  tab: 'messages',
  title: 'Messages',
  steps: [
    {
      id: 'msg-intro',
      route: '/messages',
      title: 'Messages',
      body: 'Team chat organized into rooms. Open a room to see its history and send a message.',
      showcase: 'messages',
    },
    {
      id: 'msg-rooms',
      route: '/messages',
      title: 'Creating rooms',
      body: 'Admins create rooms and choose who’s in them — for a team, an event, or a one-off conversation.',
      adminOnly: true,
    },
    {
      id: 'msg-review',
      route: '/messages',
      title: 'Flagged conversations',
      body: 'Admins can review rooms that have been flagged, keeping conversations safe and on-track.',
      adminOnly: true,
    },
  ],
}

export const announceFlow: TourFlow = {
  id: 'announce',
  tab: 'announce',
  title: 'Announcements',
  steps: [
    {
      id: 'ann-intro',
      route: '/announce',
      title: 'Announcements',
      body: 'Broadcasts to the team (or the public). You only see the announcements meant for you, sorted newest first.',
    },
    {
      id: 'ann-create',
      route: '/announce',
      title: 'Sending an announcement',
      body: 'Admins write a title and message, pick an audience, and optionally post it publicly. Try it below.',
      showcase: 'announce',
      adminOnly: true,
    },
    {
      id: 'ann-public',
      route: '/announce',
      title: 'Public announcements',
      body: 'Marking an announcement public also shows it on the public-facing home page for visitors.',
    },
  ],
}

export const assignmentsFlow: TourFlow = {
  id: 'assignments',
  tab: 'assignments',
  title: 'Assignments',
  steps: [
    {
      id: 'asg-intro',
      route: '/assignments',
      title: 'Assignments',
      body: 'Your personal to-do list across every event and team. Check one off below.',
      showcase: 'tasks',
    },
    {
      id: 'asg-status',
      route: '/assignments',
      title: 'Statuses & due dates',
      body: 'Tasks are color-coded so the urgent ones stand out.',
      bullets: ['Overdue (red)', 'Due today / behind (orange)', 'Due this week (green)'],
    },
    {
      id: 'asg-source',
      route: '/assignments',
      title: 'Where tasks come from',
      body: 'Most tasks are generated automatically from an event’s task template, with due dates calculated from the event date.',
    },
  ],
}

export const dashboardFlow: TourFlow = {
  id: 'dashboard',
  tab: 'dashboard',
  title: 'Dashboard',
  steps: [
    {
      id: 'dash-intro',
      route: '/dashboard',
      title: 'Dashboard',
      body: 'Your command center: upcoming events for the next 60 days, their readiness, and your latest notifications.',
    },
    {
      id: 'dash-health',
      route: '/dashboard',
      title: 'Event readiness',
      body: 'Each upcoming event shows a health status so you can spot trouble early.',
      bullets: ['On-track', 'Behind on tasks', 'No tasks yet'],
    },
    {
      id: 'dash-kanban',
      route: '/dashboard',
      title: 'Task board',
      body: 'Open any event to see its tasks laid out in columns — a quick way to see what’s left before the day arrives.',
    },
  ],
}

export const homeFlow: TourFlow = {
  id: 'home',
  tab: 'home',
  title: 'Home',
  steps: [
    {
      id: 'home-intro',
      route: '/home',
      title: 'Your Home',
      body: 'A personalized landing page. Team members see their next events, tasks and announcements; public users see what’s happening near them.',
      bullets: [
        'Team: my upcoming events, my tasks, recent announcements',
        'Public: events near me, new releases, posts',
        'Set your location to find nearby events',
      ],
    },
  ],
}

export const adminFlow: TourFlow = {
  id: 'admin',
  tab: 'admin',
  title: 'Admin',
  steps: [
    {
      id: 'admin-intro',
      route: '/admin/users',
      title: 'Admin Panel',
      body: `Everything that powers the rest of the app is configured here, across ${ADMIN_SECTIONS.length} sections.`,
      bullets: ADMIN_SECTIONS.map((s) => s.label),
      adminOnly: true,
    },
    {
      id: 'admin-users',
      route: '/admin/users',
      title: 'Users & roles',
      body: 'Create accounts, assign roles, and approve account deletions. A user’s roles decide exactly which tabs and features they see.',
      adminOnly: true,
    },
    {
      id: 'admin-avail',
      route: '/admin/avail',
      title: 'Availability matrix',
      body: 'See who’s available for which events at a glance, filtered by role.',
      showcase: 'availability',
      adminOnly: true,
    },
    {
      id: 'admin-groups',
      route: '/admin/groups',
      title: 'Groups & Common Teams',
      body: 'Groups and Common Teams defined here are exactly the lists that feed the event creator when you assign people.',
      adminOnly: true,
    },
    {
      id: 'admin-templates',
      route: '/admin/templates',
      title: 'Task templates',
      body: 'Build reusable checklists of tasks with relative due dates. Attach one to an event and the tasks generate automatically.',
      adminOnly: true,
    },
    {
      id: 'admin-leadership',
      route: '/admin/leadership',
      title: 'Leadership',
      body: 'Configure the leadership team that’s surfaced around the app.',
      adminOnly: true,
    },
    {
      id: 'admin-theme',
      route: '/admin/theme',
      title: 'Theme & branding',
      body: 'Upload your logo and set the color palette — the whole app re-skins instantly for everyone.',
      adminOnly: true,
    },
    {
      id: 'admin-audit',
      route: '/admin/audit',
      title: 'Audit trail',
      body: 'Review a record of who did what across the portal.',
      adminOnly: true,
    },
    // Both of these walk to a screen that is currently hidden, so they are
    // included only while the section they describe is reachable.
    ...(PUBLIC_SURFACE_ENABLED
      ? [
          {
            id: 'admin-analytics',
            route: '/admin/analytics',
            title: 'Analytics',
            body: 'Track engagement from public users of the app.',
            adminOnly: true,
          },
        ]
      : []),
    ...(EMAIL_FEATURES_ENABLED
      ? [
          {
            id: 'admin-digests',
            route: '/admin/digests',
            title: 'Email digests',
            body: 'Configure the weekly and monthly email digests that go out to members.',
            adminOnly: true,
          },
        ]
      : []),
  ],
}

export const publicFlow: TourFlow = {
  id: 'public',
  tab: 'public',
  title: 'Public-Facing',
  steps: [
    {
      id: 'pub-intro',
      route: '/public',
      title: 'The public-facing site',
      body: 'This is what visitors and public users see — Posts, Connect, Giving, Our Story, Content and Photos. Members can preview it anytime from the side menu.',
      bullets: [
        'Preview Public View toggle in the menu',
        'Six public sections',
        'Great for checking what guests experience',
      ],
    },
  ],
}

export const contentFlow: TourFlow = {
  id: 'music',
  tab: 'music',
  title: 'Content',
  steps: [
    {
      id: 'content-intro',
      route: '/music',
      title: 'Content Library',
      body: 'Music, podcasts and sermons in one place. Filter by type; new and featured items get badges and surface on the home page.',
      bullets: [
        'Filter by music / podcast / sermon',
        'NEW and ★ Featured badges',
        'Admins add and curate items',
      ],
    },
  ],
}

export const postsFlow: TourFlow = {
  id: 'posts',
  tab: 'posts',
  title: 'Posts',
  steps: [
    {
      id: 'posts-intro',
      route: '/posts',
      title: 'Posts',
      body: 'Browse post directories pulled from your social pages. A “new” indicator shows directories with posts you haven’t seen yet.',
    },
  ],
}

export const givingFlow: TourFlow = {
  id: 'giving',
  tab: 'giving',
  title: 'Giving',
  steps: [
    {
      id: 'giving-intro',
      route: '/giving',
      title: 'Giving',
      body: 'The giving page makes it easy for people to support the mission. Content here is managed by admins.',
    },
  ],
}

export const storyFlow: TourFlow = {
  id: 'story',
  tab: 'story',
  title: 'Our Story',
  steps: [
    {
      id: 'story-intro',
      route: '/story',
      title: 'Our Story',
      body: 'Shares who you are and what you’re about — an editable page for newcomers to get to know the mission.',
    },
  ],
}

export const connectFlow: TourFlow = {
  id: 'connect',
  tab: 'connect',
  title: 'Connect',
  steps: [
    {
      id: 'connect-intro',
      route: '/connect',
      title: 'Connect',
      body: 'How people get involved and reach out — the front door for new volunteers and guests.',
    },
  ],
}

export const settingsFlow: TourFlow = {
  id: 'settings',
  tab: 'settings',
  title: 'Profile & Settings',
  steps: [
    {
      id: 'settings-intro',
      route: '/settings',
      title: 'Profile & Settings',
      body: 'Manage your account and how the app looks and reaches you.',
      bullets: ['Display name & photo', 'Change email or password', 'Light / dark theme'],
    },
    {
      id: 'settings-notifs',
      route: '/settings',
      title: 'Notifications & location',
      body: EMAIL_FEATURES_ENABLED
        ? 'Choose exactly which notifications you get by push and email, opt into digests, and set your location for nearby events.'
        : 'Choose exactly which notifications you get, and set your location so events near you are flagged.',
    },
  ],
}

/** All flows except the welcome card, keyed for lookup. */
export const TAB_FLOWS: TourFlow[] = [
  dashboardFlow,
  homeFlow,
  eventsFlow,
  assignmentsFlow,
  messagesFlow,
  operationsFlow,
  securityFlow,
  inventoryFlow,
  announceFlow,
  worshipFlow,
  adminFlow,
  publicFlow,
  contentFlow,
  postsFlow,
  givingFlow,
  storyFlow,
  connectFlow,
  settingsFlow,
]
