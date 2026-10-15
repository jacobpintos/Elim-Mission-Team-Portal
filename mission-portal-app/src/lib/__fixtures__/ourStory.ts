/** An Our Story page as the page builder saves it. */
export const STORY_BLOCKS = [
  { id: 1, type: 'hero', data: { heading: 'Our Story', subheading: 'A place of rest' } },
  {
    id: 2,
    type: 'text',
    data: {
      heading: 'How it began',
      content:
        'The Well was planted in 2015 by Daniel and Ruth Okafor in North Liberty. They started with twelve people in a living room. Today the church gathers every Sunday.',
    },
  },
  {
    id: 3,
    type: 'twocol',
    data: {
      leftHead: 'Our Pastor',
      leftContent:
        'Pastor Amy Lee has led The Well since 2019. She grew up in Cedar Rapids and studied at Moody. *Amy* loves teaching through whole books of the Bible.',
    },
  },
  {
    id: 4,
    type: 'timeline',
    data: {
      entries: [
        {
          year: '2021',
          title: 'Elders appointed',
          desc: 'Mark Chen and Tom Reyes became our first elders.',
        },
      ],
    },
  },
  {
    id: 5,
    type: 'text',
    data: { heading: 'Our team', content: 'Our leadership team serves together.' },
  },
]
