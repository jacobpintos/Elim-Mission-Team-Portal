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
      bullets: ['Purple dot = virtual', 'Solid dot = in-person', 'Tap an event to open its card'],
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
      teamOnly: true,
    },
    {
      id: 'events-availability',
      route: '/events',
      title: 'Availability',
      body: 'Answer Yes / No / Partial / TBD for the events you’re on. For recurring events you can answer the whole series or just one date.',
      showcase: 'availability',
      teamOnly: true,
    },
    {
      id: 'events-planning',
      route: '/events',
      title: 'Planning boards',
      body: 'Attach a planning board to an event for collaborative logistics — sticky notes, goals, checklists and connectors that the whole team can work on.',
      showcase: 'planningBoard',
      adminOnly: true,
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
      adminOnly: true,
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
      title: 'Using a set list',
      body: 'Open a set list to see its songs in order. Each song’s card has what you need to learn it.',
      bullets: [
        'Open chord sheet — in the key the song is set in',
        '▶ Play video — watch the YouTube recording right here',
        'YouTube ↗ — open it in YouTube, to cast to a TV or keep it playing',
        'Other links (Spotify and the like) open in their own app',
        '✓ Acknowledge Set List — when it’s given to you as a task',
      ],
    },
    {
      id: 'worship-tracks',
      route: '/worship',
      title: 'Practice tracks',
      body: 'A song with a practice track plays right on its card — and under its chord sheet, so you can play along.',
      bullets: [
        '▶ Play / pause; ↺10 and 10↻ jump back or ahead',
        'Drag the bar to any point in the song',
        'Start loop, then End loop: a part repeats until you have it',
        '1× → 0.75× → 0.5×: slower, in the same key',
        'Keeps playing with the screen locked, controls on the lock screen',
      ],
    },
    {
      id: 'worship-build',
      route: '/worship',
      title: 'Building a set list',
      body: 'Add songs in order, attach details, and link the set list to an event. Try adding a song and previewing its chords below.',
      bullets: [
        'Each song: its name, key and chord sheet',
        'A link (YouTube, Spotify…) and notes for the team',
        'Upload a practice track for everyone to play',
      ],
      showcase: 'setlist',
      roles: ['admin', 'worship'],
    },
    {
      id: 'worship-chords',
      route: '/worship',
      title: 'Chord sheets',
      body: 'Charts are written once in the Nashville Number System and transpose to any key instantly. A “Chords Only” mode collapses repeats for quick reference.',
      bullets: [
        'Transpose to any key, major or minor, or show the numbers',
        'Chords-Only collapses repeated sections',
        'Supports imported PDFs & images',
      ],
    },
    {
      id: 'worship-play',
      route: '/worship',
      title: 'Playing from a sheet',
      body: 'Open a sheet on a music stand and keep your hands on your instrument.',
      bullets: [
        '▶ Autoscroll, faster or slower to suit the song',
        'Jump to a section with its button (V1, C, B…)',
        'Size − / +, your own ✎ Notes, and Export PDF',
        'In a set list, swipe or use ‹ › for the next song',
      ],
    },
    {
      id: 'worship-voice',
      route: '/worship',
      title: 'Voice control',
      body: 'Tap 🎤 on a sheet and say what you need — no hands.',
      bullets: [
        '“Next song”, “back”, “chorus two”, “key of G”, “chords only”',
        '“Start autoscroll on five”, “faster”, “stop”',
        '“Queue Way Maker in D” lines songs up; “open Above All” switches now',
        'With “Hey Miriam” on, the sheet listens for her name by itself',
      ],
    },
    {
      id: 'worship-notify',
      route: '/worship',
      title: 'Linking to an event',
      body: 'When you attach a set list to an event, the whole worship team is notified automatically so everyone’s practicing the same songs.',
      roles: ['admin', 'worship'],
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
      bullets: [
        'A reorder item can carry a link to buy it',
        'Or ask Miriam: “buy triple A batteries”',
      ],
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
      bullets: ['Mute a room to stop its notifications', 'Block someone from Settings'],
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
      teamOnly: true,
    },
    {
      id: 'ann-intro-public',
      route: '/announce',
      title: 'Announcements',
      body: 'News from the church, newest first — what’s coming up, what’s changed and what’s new. The latest also show on your Home page.',
      publicOnly: true,
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
      adminOnly: true,
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
      body: 'A personalized landing page: your next events, your tasks and recent announcements.',
      teamOnly: true,
    },
    {
      id: 'home-intro-public',
      route: '/home',
      title: 'Your Home',
      body: 'What’s happening, at a glance.',
      bullets: [
        'The latest announcements',
        'Events near you — tap “Edit Location” to set where you are',
        'New and featured releases from Content',
        'Events farther away, beyond your radius',
      ],
      publicOnly: true,
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
      body: 'This is what visitors and public users see — Connect, Giving, the Elim Store, Our Story and Content. It is a tab like any other, so you can look at it whenever you want and leave by opening anything else.',
      bullets: [
        'Five public sections',
        'Content also has its own tab, since members use it most',
        'Good for checking what visitors experience',
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
        'Or ask Miriam: “play the latest sermon”',
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
      body: 'How to give and support the mission. Giving itself happens on the church’s giving site, which opens from here.',
    },
  ],
}

export const storeFlow: TourFlow = {
  id: 'store',
  tab: 'store',
  title: 'Elim Store',
  steps: [
    {
      id: 'store-intro',
      route: '/store',
      title: 'Elim Store',
      body: 'Featured clothing and books from the Elim Store. Tap anything to see it at theelimstore.com, and ask to be notified when a sale starts.',
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
      body: 'Who we are and what we’re about — the story of the mission and the people behind it.',
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
      body: 'Get in touch and get involved — and ask to meet with someone from our leadership, right from the page.',
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

/** Miriam, the assistant at the top of every screen — not a tab, so not filed under one. */
export const miriamFlow: TourFlow = {
  id: 'miriam',
  title: 'Miriam',
  steps: [
    {
      id: 'miriam-intro',
      title: 'Meet Miriam',
      body: 'Tap Miriam at the top of any screen and ask, typed or spoken. She answers from the app — only what you are allowed to see — and takes you to where the answer is.',
      bullets: [
        '“What do I need to know today?” — your daily briefing',
        '“Remind me to go to Costco at 5 PM tomorrow”',
        '“When is Sunday service?”',
        '“What’s the dress code for the retreat?”',
        '“Give me a tour of Worship”',
      ],
      teamOnly: true,
    },
    {
      id: 'miriam-intro-public',
      title: 'Meet Miriam',
      body: 'Tap Miriam at the top of any screen and ask, typed or spoken. She answers from the app and takes you to where the answer is.',
      bullets: [
        '“When is Elim coming to my area?”',
        '“What’s happening this weekend?”',
        '“When is Sunday service?”',
        '“Play the latest sermon”',
        '“Is anything on sale at the Elim Store?”',
        '“I’d like to meet with a pastor”',
        '“Switch to light mode”, “Turn off announcement notifications”',
        '“Give me a tour of Events”',
      ],
      publicOnly: true,
    },
    {
      id: 'miriam-hey',
      title: '“Hey Miriam”',
      body: 'Switch on “Hey Miriam” in her panel and call her by name, hands free. Listening for her name happens on your device; nothing is sent until she is called. “Hey Miriam, stop listening” switches it off.',
    },
    {
      id: 'miriam-talk',
      title: 'Talking it through',
      body: 'She remembers the last few things you asked, so you can follow on — “what time is it?”, “move it to Friday”. If something she needs is missing, she says what she thinks you want and asks for it, then listens for your answer.',
      teamOnly: true,
    },
    {
      id: 'miriam-talk-public',
      title: 'Talking it through',
      body: 'She remembers what you just asked, so you can follow on. Ask where an event is on the day it happens and she offers to open maps — say “yes” and she does.',
      publicOnly: true,
    },
    {
      id: 'miriam-actions',
      title: 'Asking her to do things',
      body: 'Tell her plainly and she shows you exactly what she will do, for you to confirm — nothing changes until you do.',
      bullets: [
        'Answer your availability, mark a task done',
        'Send a message, sign up to bring food',
        'Report an issue, put forward or vote for a kaizen idea, or report a concern to security',
        'Answer availability for a stretch of dates — “I’m out all of November”',
        'Set reminders, even repeating ones — “every Sunday at 8” — they show in your tasks',
        'Turn a notification on or off',
      ],
      roles: ['admin', 'regular', 'worship', 'security', 'intern'],
    },
    {
      id: 'miriam-songs',
      title: 'Songs by name',
      body: 'Ask for a chord sheet in any key — “Above All in E” — and it opens, straight from your phone. Ask what’s on a set list; the worship team can add songs to one, or make a new one, by asking.',
      roles: ['admin', 'worship', 'guest'],
    },
    {
      id: 'miriam-admin',
      title: 'Forms and admin work',
      body: 'She fills in a new event, an event’s changes, a task or a new account for you to check and save; assigns several tasks at once, changes, reassigns or deletes tasks; makes task templates with their sections; sets an event’s cars; and manages people, groups and common teams — each confirmed first. Ask for several things at once and she takes them one at a time.',
      adminOnly: true,
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
  storeFlow,
  storyFlow,
  connectFlow,
  settingsFlow,
]
