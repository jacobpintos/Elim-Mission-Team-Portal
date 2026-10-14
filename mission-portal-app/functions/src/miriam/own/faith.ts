import { embed, similarity } from './encoder'
import { taughtAnswers, type OwnDb } from './learn'
import { CHURCH_SITE, siteAnswer, siteKnowledge } from './site'
import { storedMeaning } from './understand'

/**
 * Questions of faith, as the church asked Miriam to answer them:
 *
 *  1. An answer an admin has taught her (Admin → Miriam), if the question
 *     means the same.
 *  2. What the church's own website says (./site), in its words, saying
 *     where.
 *  3. The few things virtually all Christians agree on — that God is good,
 *     that Jesus rose from the dead (CORE) — plainly, with where the Bible
 *     says so.
 *  4. Anything else — what Christians differ on, or what she hasn't been
 *     told: a pastor's, and the website.
 *
 * She never answers a question of faith from anything else.
 */

export interface CoreTruth {
  id: string
  /** Ways the question is asked: what a question is matched with. */
  asked: string[]
  answer: string
}

/**
 * What virtually all Christians — all traditional Protestant churches among
 * them — agree on, as the historic creeds say it. Nothing here is a matter
 * Christians differ on (how to baptize, communion, the end times, gifts of
 * the Spirit, whether salvation can be lost): those go to a pastor unless the
 * church's site says, or an admin teaches her. An admin's own answer to the
 * same question is said instead of these.
 */
export const CORE: CoreTruth[] = [
  {
    id: 'god-good',
    asked: ['Is God good?', 'Is God really good?', 'Does God care about us?'],
    answer:
      'Yes. Scripture says God is good and his love endures forever (Psalm 100:5), and that he cares for each of us (1 Peter 5:7).',
  },
  {
    id: 'god-loves',
    asked: ['Does God love me?', 'Does God love everyone?', 'How much does God love us?'],
    answer:
      'Yes — God loves you. “For God so loved the world that he gave his one and only Son” (John 3:16), and nothing can separate us from his love (Romans 8:38–39).',
  },
  {
    id: 'god-real',
    asked: ['Is God real?', 'Does God exist?', 'How do we know God is real?'],
    answer:
      'Christians believe God is real and has made himself known — in creation, in the Bible, and most clearly in Jesus (Romans 1:20; Hebrews 1:1–2).',
  },
  {
    id: 'creator',
    asked: ['Who created the world?', 'Did God create everything?', 'Who made the universe?'],
    answer:
      'God created the heavens and the earth and everything in them (Genesis 1:1; Colossians 1:16).',
  },
  {
    id: 'trinity',
    asked: [
      'What is the Trinity?',
      'Is God three persons?',
      'Who are the Father, Son and Holy Spirit?',
    ],
    answer:
      'There is one God in three persons — the Father, the Son and the Holy Spirit (Matthew 28:19; 2 Corinthians 13:14).',
  },
  {
    id: 'jesus',
    asked: ['Who is Jesus?', 'Who is Jesus Christ?', 'Is Jesus God?', 'Is Jesus the Son of God?'],
    answer:
      'Jesus is the Son of God — fully God and fully human — who lived without sin, died on the cross for our sins, and rose again (John 1:1, 14; Hebrews 4:15).',
  },
  {
    id: 'jesus-died',
    asked: [
      'Why did Jesus die?',
      'Why did Jesus have to die on the cross?',
      'What did Jesus do on the cross?',
    ],
    answer:
      'Jesus died in our place, to pay for our sins and bring us back to God (Romans 5:8; 1 Peter 3:18).',
  },
  {
    id: 'resurrection',
    asked: ['Did Jesus rise from the dead?', 'Is the resurrection real?', 'What is Easter about?'],
    answer:
      'Yes — Jesus rose bodily from the dead on the third day. It is the heart of the good news (1 Corinthians 15:3–4, 20).',
  },
  {
    id: 'gospel',
    asked: ['What is the gospel?', 'What is the good news?', 'What do Christians believe?'],
    answer:
      'The good news is that Jesus died for our sins, was buried, and rose again, so that everyone who trusts in him is forgiven and has eternal life (1 Corinthians 15:3–4; John 3:16).',
  },
  {
    id: 'saved',
    asked: [
      'How can I be saved?',
      'How do I become a Christian?',
      'How do I get to heaven?',
      'What must I do to be saved?',
    ],
    answer:
      'By God’s grace, through faith in Jesus — trusting that he died for your sins and rose again — not by anything we earn (Ephesians 2:8–9; Romans 10:9). One of our pastors would love to talk with you about it.',
  },
  {
    id: 'grace',
    asked: ['What is grace?', 'What does grace mean?', 'What is God’s grace?'],
    answer:
      'Grace is God’s undeserved kindness — his love and forgiveness given freely, not earned (Ephesians 2:8–9).',
  },
  {
    id: 'forgive',
    asked: [
      'Can God forgive me?',
      'Will God forgive me?',
      'Will God forgive my sins?',
      'Is anything too bad for God to forgive?',
    ],
    answer:
      'Yes. “If we confess our sins, he is faithful and just to forgive us” (1 John 1:9) — no sin is too great for Jesus’ forgiveness.',
  },
  {
    id: 'sin',
    asked: ['What is sin?', 'What does sin mean?', 'Has everyone sinned?'],
    answer:
      'Sin is anything we think, say or do that goes against God’s good will — and all of us have sinned (Romans 3:23). Jesus came to forgive us and set us free (1 John 1:9).',
  },
  {
    id: 'bible',
    asked: ['Is the Bible true?', 'Is the Bible God’s word?', 'Can I trust the Bible?'],
    answer:
      'Christians believe the Bible is God’s inspired word, true and trustworthy, given to teach and guide us (2 Timothy 3:16–17).',
  },
  {
    id: 'spirit',
    asked: ['Who is the Holy Spirit?', 'What does the Holy Spirit do?'],
    answer:
      'The Holy Spirit is God — the third person of the Trinity — who lives in those who follow Jesus, comforts them and guides them into truth (John 14:16–17, 26).',
  },
  {
    id: 'return',
    asked: ['Will Jesus come back?', 'Is Jesus coming again?'],
    answer:
      'Yes. Jesus promised to return, and Christians look forward to that day (John 14:3; Acts 1:11).',
  },
  {
    id: 'eternal-life',
    asked: [
      'Is there life after death?',
      'What happens to Christians when they die?',
      'Is heaven real?',
    ],
    answer:
      'Jesus said, “I am the resurrection and the life” — those who trust in him will live with God forever (John 11:25–26; John 14:2–3).',
  },
  {
    id: 'greatest',
    asked: [
      'What is the greatest commandment?',
      'What does God want from us?',
      'What is the most important commandment?',
    ],
    answer:
      'Jesus said: love the Lord your God with all your heart, soul and mind, and love your neighbor as yourself (Matthew 22:37–39).',
  },
  {
    id: 'prayer',
    asked: ['Does God hear our prayers?', 'Does God answer prayer?', 'How should I pray?'],
    answer:
      'God hears his people when they pray (1 John 5:14). Jesus taught us how in the Lord’s Prayer — “Our Father in heaven…” (Matthew 6:9–13).',
  },
  {
    id: 'church',
    asked: [
      'Why should I go to church?',
      'What is the church?',
      'Why do Christians meet together?',
    ],
    answer:
      'The church is God’s family — the body of Christ — gathered to worship him, grow in faith and encourage one another (Hebrews 10:24–25; 1 Corinthians 12:27).',
  },
]

/** A taught answer, known to be about faith: near enough, but not so loose as to answer communion with baptism. */
export const FAITH_TAUGHT_NEAR = 0.7
/**
 * One of the core truths: the question must be as good as one of its own —
 * "Is God good?" — not a harder one near it ("Is God good when bad things
 * happen?"), which is a pastor's.
 */
export const CORE_NEAR = 0.85

/** The core truths' questions, with their meanings, worked out ahead of time (./understand: storedMeaning). */
let coreVecs: { truth: CoreTruth; vec: Float32Array }[] | null = null
export function coreMeanings(): { truth: CoreTruth; vec: Float32Array }[] {
  coreVecs ??= CORE.flatMap((truth) =>
    truth.asked.map((q) => ({ truth, vec: storedMeaning(q) ?? embed(q) }))
  )
  return coreVecs
}

export interface FaithAnswer {
  text: string
  /** A page to read it on: the church's site. */
  link: { url: string; label: string } | null
  /** Where it came from, for the logs. */
  from: 'taught' | 'site' | 'core' | 'pastor'
}

export const PASTOR =
  'That’s a good question for one of our pastors — I’d rather they answer it than me. You can also read what The Well believes at thewellofiowa.com.'

const siteLabel = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return 'thewellofiowa.com'
  }
}

/** Her answer to a question of faith, from the church, the core of the faith, or a pastor. */
export async function faithAnswer(
  text: string,
  db: OwnDb,
  v: Float32Array = embed(text)
): Promise<FaithAnswer> {
  // 1. Taught.
  const taught = await taughtAnswers(db).catch(() => [])
  let best: { a: string; sim: number } | null = null
  for (const t of taught) {
    const sim = similarity(v, t.vec)
    if (!best || sim > best.sim) best = { a: t.a, sim }
  }
  if (best && best.sim >= FAITH_TAUGHT_NEAR) return { text: best.a, link: null, from: 'taught' }

  // 2. The church's website.
  const site = siteAnswer(text, v, await siteKnowledge(db).catch(() => []))
  if (site) {
    return {
      text: `${site.text} (from ${siteLabel(site.url)})`,
      link: { url: site.url, label: siteLabel(site.url) },
      from: 'site',
    }
  }

  // 3. What virtually all Christians agree on.
  let core: { truth: CoreTruth; sim: number } | null = null
  for (const c of coreMeanings()) {
    const sim = similarity(v, c.vec)
    if (!core || sim > core.sim) core = { truth: c.truth, sim }
  }
  if (core && core.sim >= CORE_NEAR) return { text: core.truth.answer, link: null, from: 'core' }

  // 4. A pastor's, and the website.
  return { text: PASTOR, link: { url: CHURCH_SITE, label: 'thewellofiowa.com' }, from: 'pastor' }
}
