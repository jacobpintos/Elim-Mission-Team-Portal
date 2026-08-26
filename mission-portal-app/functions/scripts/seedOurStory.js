/**
 * Fill in the Our Story page, once.
 *
 * PageBuilder pages live in Firestore at config/main -> publicPages.<key>, so
 * there is nothing to deploy: run this and the page is there. After that it is
 * edited in the app like any other page, and this file is only worth keeping
 * for rebuilding from scratch.
 *
 *   cd ~/Elim-Mission-Team-Portal/mission-portal-app/functions
 *   node scripts/seedOurStory.js
 *
 * Safe to run twice — it replaces publicPages.ourstory wholesale, so a second
 * run undoes any hand-edits made since the first.
 */
const admin = require('firebase-admin')
admin.initializeApp({ projectId: 'mission-team-portal' })
const db = admin.firestore()

// Served from the existing site. Pointing at them rather than copying into
// Firebase Storage costs nothing and keeps the app in step if they are
// replaced — at the price of depending on that host staying up.
const IMG = {
  couple: 'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/7ac1cebc-769d-44e4-8de6-2fc91dac9173/43DF14B3-F2C7-45B2-828E-D736E6FE41C5_1_102_o.png',
  coupleColour: 'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/edd67c51-5829-44e7-b5a1-7deb5d2afc6e/43DF14B3-F2C7-45B2-828E-D736E6FE41C5_1_102_o.png',
  devotions: 'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/50272690-2a8c-4b64-97fb-3236d1ad2861/Screenshot+2025-08-01+at+10.46.28%E2%80%AFPM.png',
  reviveMe: 'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/8fcc0deb-e899-4a67-99fb-081b41b4eda7/REVIVEME-Bookcover-FRONT.jpg',
  tentmakers: 'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/e91c1abb-6e36-4994-a7a4-1be69faea869/Screenshot+2025-06-29+at+1.05.10%E2%80%AFAM.png',
  inYourHand: 'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/5c4190bb-1d1b-44a2-a3e8-ef0df0f770c7/Screenshot+2025-06-29+at+1.06.34%E2%80%AFAM.png?format=500w',
  revived: 'https://images.squarespace-cdn.com/content/v1/6751456bc7917b1e18a60ac9/2660fa02-2b4d-42fa-bd34-b5ed1133f954/albumidea%3F%3F.png',
}

// Where the REVIVE ME excerpt button goes: the sample chapter, hosted on
// Dropbox. The link carries its own key, so it opens for anyone without a
// Dropbox account — but it dies if the file is moved or the share revoked.
const EXCERPT_URL =
  'https://www.dropbox.com/scl/fi/t74yx2rn3e1y5riy5biu6/ReviveMeBook-WhatTriggersRevival.pdf?rlkey=y62icb5m016no7er4kcefm0ff&st=uruxsdky&e=1&dl=0'

// Block ids are Date.now() in the app; fixed offsets here keep them stable
// and ordered across runs.
const id = (n) => 1756000000000 + n

const blocks = [
  {
    id: id(1),
    type: 'hero',
    data: {
      heading: 'A missionary journey from the Middle East to the Midwest.',
      subheading:
        'In early 2004, Pastor Ajai and Maureena heard the call from God to come to America as missionaries. They left everything and came to this land with two suitcases and a deep passion for REVIVAL.',
      bgImage: IMG.couple,
      overlayColor: 'rgba(0,0,0,0.45)',
      textColor: '#ffffff',
    },
  },
  {
    id: id(2),
    type: 'text',
    data: {
      heading: 'Our Story',
      content:
        'Pastor Ajai and Maureena Prakash were born and raised in North India and served God by pioneering, planting and growing underground churches in the Middle East for 14 years.\n\n' +
        'Towards the end of their time in the Middle East, God ignited the vision of reviving America in their hearts and in 2004, they came to the United States as missionaries.',
    },
  },
  {
    id: id(3),
    type: 'quote',
    data: { text: 'Their greatest hope and desire is to see America come alive for Jesus.' },
  },
  {
    id: id(4),
    type: 'text',
    data: {
      content:
        'Both have given up their lives to be spiritual parents to a lost and broken generation aching for rest, hope and clarity. Hence, most of their time has gone into fostering genuine discipleship as unto Jesus.',
    },
  },
  {
    id: id(5),
    type: 'text',
    data: {
      heading: 'Pastor Ajai',
      content:
        'Pastor Ajai holds an MDIV from Gordon Conwell Theological Seminary (Magna Cum Laude) and has been pastoring The Well of Iowa now for almost 18+ years. He has authored The Underground Tentmakers (2014) and REVIVE ME (A National Call for Personal Revival, 2016). He is a revivalist, pastor, teacher, author, evangelist, missionary, mentor and most importantly a spiritual father for many broken young lives.',
    },
  },
  {
    id: id(6),
    type: 'text',
    data: {
      heading: 'Maureena',
      content:
        'Maureena has been a nurse and nurse educator for almost 35 years and has served as a highly sought after Director of Nursing at long-term health care facilities in the Cedar Rapids/Iowa City region for 15+ years. She has also served as a mental and behavioral health nurse in Iowa City for two years. Alongside her day jobs, she has served as the Director of Counseling & Discipleship alongside Pastor Ajai at The Well of Iowa since 2007, and stepped into the ministry role full time in 2022. She too is a revivalist, missionary, mentor and spiritual mother to so many.',
    },
  },
  { id: id(7), type: 'image', data: { src: IMG.coupleColour, align: 'center' } },
  {
    id: id(8),
    type: 'button',
    data: {
      label: "Read excerpt from 'REVIVE ME: A National Call for Personal Revival'",
      url: EXCERPT_URL,
      align: 'center',
    },
  },
  {
    id: id(9),
    type: 'gallery',
    data: {
      images: [IMG.devotions, IMG.reviveMe, IMG.tentmakers, IMG.inYourHand],
      columns: 2,
    },
  },
  {
    id: id(10),
    type: 'text',
    data: {
      heading: 'Sunny Singh',
      content:
        "Sunny Singh was also born in India and came to the United States in 2004 at the age of 13. God had it so that he would encounter Jesus for the first time, that same year, at Billy Graham's second to last crusade held at the Kansas City Chiefs Stadium.\n\n" +
        "At his core, Sunny is a revivalist with a deep passion and anointing for worship and songwriting. He also considers himself a missionary to the United States. Sunny has been leading worship and serving The Well of Iowa since 2007. He is a product of Pastor Ajai and Maureena's discipleship, and stewards The Well's evangelical arm, The ELIM Arrival.\n\n" +
        'Sunny holds a BBA from the University of Iowa and an MBA from Western Illinois University (Magna Cum Laude), and has worked as an IT Project Manager for the last 10 years serving major companies across the Midwest as a contractor and consultant. He is also the spiritual entrepreneur and visionary behind THE ELIM ARRIVAL, activated in 2012.',
    },
  },
  { id: id(11), type: 'image', data: { src: IMG.revived, align: 'center' } },
]

;(async () => {
  await db.doc('config/main').update({
    'publicPages.ourstory': { blocks, bgImage: null, bgParallax: false },
  })
  console.log(`Our Story seeded: ${blocks.length} blocks`)
  process.exit(0)
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
