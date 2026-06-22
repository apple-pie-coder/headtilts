import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function slug(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

const events = [
  {
    title: 'Indie Music Night: Monsoon Edition',
    slug: slug('Indie Music Night Monsoon Edition'),
    excerpt: 'An intimate evening of original indie music from Bangalore\'s best emerging artists.',
    description: '<p>Join us for a cozy evening of original indie music as some of Bangalore\'s most exciting emerging artists perform live sets. Expect everything from folk-pop to alt-rock, all under one roof with drinks and good vibes.</p><p>Doors open 30 minutes before the show. Seating is limited — register early!</p>',
    startAt: new Date('2026-07-12T19:00:00+05:30'),
    endAt:   new Date('2026-07-12T22:30:00+05:30'),
    timezone: 'Asia/Kolkata',
    type: 'in_person',
    status: 'published',
    venueName: 'The Humming Tree',
    venueAddress: 'Wood Street, Ashok Nagar',
    venueCity: 'Bangalore',
    venueState: 'Karnataka',
    venueCountry: 'India',
    maxAttendees: 120,
    isRegistrationRequired: true,
    showAttendeesCount: true,
    isFeatured: true,
    ticketTiers: {
      create: [
        { name: 'Early Bird', price: 29900, currency: 'INR', quantity: 40, soldCount: 0, isVisible: true, perOrderMin: 1, perOrderMax: 4, position: 0 },
        { name: 'General Admission', price: 49900, currency: 'INR', quantity: 80, soldCount: 0, isVisible: true, perOrderMin: 1, perOrderMax: 4, position: 1 },
      ],
    },
    speakers: {
      create: [
        { name: 'Meera Krishnan', designation: 'Singer-Songwriter', bio: 'Meera blends Tamil folk melodies with modern indie-pop production.', position: 0 },
        { name: 'Arjun Shetty', designation: 'Multi-instrumentalist', bio: 'Known for his intricate guitar work and dreamy soundscapes.', position: 1 },
      ],
    },
    agendaItems: {
      create: [
        { title: 'Doors Open & Welcome Drinks', startsAt: new Date('2026-07-12T18:30:00+05:30'), endsAt: new Date('2026-07-12T19:00:00+05:30'), type: 'break', position: 0 },
        { title: 'Meera Krishnan — Opening Set', startsAt: new Date('2026-07-12T19:00:00+05:30'), endsAt: new Date('2026-07-12T20:00:00+05:30'), type: 'session', position: 1 },
        { title: 'Intermission', startsAt: new Date('2026-07-12T20:00:00+05:30'), endsAt: new Date('2026-07-12T20:20:00+05:30'), type: 'break', position: 2 },
        { title: 'Arjun Shetty — Headliner', startsAt: new Date('2026-07-12T20:20:00+05:30'), endsAt: new Date('2026-07-12T21:30:00+05:30'), type: 'keynote', position: 3 },
      ],
    },
  },
  {
    title: 'React & Beyond: Frontend Dev Meetup',
    slug: slug('React and Beyond Frontend Dev Meetup'),
    excerpt: 'Monthly meetup for frontend developers — talks, demos, and networking over chai.',
    description: '<p>Our monthly frontend meetup is back! This month we\'re covering the latest in React 19, server components in production, and a lightning talk on CSS animations that don\'t kill performance.</p><p>Snacks and chai will be provided. Bring your laptops!</p>',
    startAt: new Date('2026-07-19T10:00:00+05:30'),
    endAt:   new Date('2026-07-19T13:00:00+05:30'),
    timezone: 'Asia/Kolkata',
    type: 'hybrid',
    status: 'published',
    venueName: 'Headtilts HQ',
    venueAddress: '14, Koramangala 5th Block',
    venueCity: 'Bangalore',
    venueState: 'Karnataka',
    venueCountry: 'India',
    onlineUrl: 'https://meet.google.com/example',
    maxAttendees: 60,
    isRegistrationRequired: true,
    showAttendeesCount: true,
    isFeatured: false,
    ticketTiers: {
      create: [
        { name: 'In-Person', price: 0, currency: 'INR', quantity: 40, soldCount: 0, isVisible: true, perOrderMin: 1, perOrderMax: 1, position: 0 },
        { name: 'Online (Free)', price: 0, currency: 'INR', quantity: null, soldCount: 0, isVisible: true, perOrderMin: 1, perOrderMax: 1, position: 1 },
      ],
    },
    speakers: {
      create: [
        { name: 'Priya Nair', designation: 'Senior Frontend Engineer', company: 'Razorpay', bio: 'React contributor and open source enthusiast.', position: 0 },
        { name: 'Karan Mehta', designation: 'UI Engineer', company: 'Swiggy', bio: 'Obsessed with CSS animations and micro-interactions.', position: 1 },
      ],
    },
    agendaItems: {
      create: [
        { title: 'Welcome & Introductions', startsAt: new Date('2026-07-19T10:00:00+05:30'), endsAt: new Date('2026-07-19T10:15:00+05:30'), type: 'networking', position: 0 },
        { title: 'React 19 & Server Components in Production', startsAt: new Date('2026-07-19T10:15:00+05:30'), endsAt: new Date('2026-07-19T11:00:00+05:30'), type: 'keynote', position: 1 },
        { title: 'Lightning: CSS Animations Without the Jank', startsAt: new Date('2026-07-19T11:00:00+05:30'), endsAt: new Date('2026-07-19T11:20:00+05:30'), type: 'session', position: 2 },
        { title: 'Open Q&A + Networking', startsAt: new Date('2026-07-19T11:20:00+05:30'), endsAt: new Date('2026-07-19T13:00:00+05:30'), type: 'networking', position: 3 },
      ],
    },
  },
  {
    title: 'Mindful Photography Walk — Cubbon Park',
    slug: slug('Mindful Photography Walk Cubbon Park'),
    excerpt: 'Slow down, look closer. A guided photography walk through Cubbon Park at golden hour.',
    description: '<p>This isn\'t about getting the perfect shot. It\'s about learning to see again. Join photographer and educator Nandita Rao for a two-hour walk through Cubbon Park at golden hour, exploring how mindfulness transforms the way we frame the world.</p><p>All skill levels welcome. Bring any camera — even your phone.</p>',
    startAt: new Date('2026-07-26T17:00:00+05:30'),
    endAt:   new Date('2026-07-26T19:00:00+05:30'),
    timezone: 'Asia/Kolkata',
    type: 'in_person',
    status: 'published',
    venueName: 'Cubbon Park Main Gate',
    venueAddress: 'Kasturba Road',
    venueCity: 'Bangalore',
    venueState: 'Karnataka',
    venueCountry: 'India',
    maxAttendees: 20,
    isRegistrationRequired: true,
    registrationDeadline: new Date('2026-07-25T23:59:00+05:30'),
    showAttendeesCount: true,
    isFeatured: false,
    ticketTiers: {
      create: [
        { name: 'Participant', price: 59900, currency: 'INR', quantity: 20, soldCount: 0, isVisible: true, perOrderMin: 1, perOrderMax: 2, position: 0 },
      ],
    },
    speakers: {
      create: [
        { name: 'Nandita Rao', designation: 'Photographer & Educator', bio: 'Nandita\'s work has been published in National Geographic Traveller India. She teaches photography as a mindfulness practice.', position: 0 },
      ],
    },
    agendaItems: {
      create: [
        { title: 'Meet & Gear Check', startsAt: new Date('2026-07-26T17:00:00+05:30'), endsAt: new Date('2026-07-26T17:15:00+05:30'), type: 'networking', position: 0 },
        { title: 'Walk: North Trail', startsAt: new Date('2026-07-26T17:15:00+05:30'), endsAt: new Date('2026-07-26T18:15:00+05:30'), type: 'session', position: 1 },
        { title: 'Group Share & Debrief', startsAt: new Date('2026-07-26T18:15:00+05:30'), endsAt: new Date('2026-07-26T19:00:00+05:30'), type: 'session', position: 2 },
      ],
    },
  },
  {
    title: 'Design Systems at Scale — Online Workshop',
    slug: slug('Design Systems at Scale Online Workshop'),
    excerpt: 'A half-day online workshop on building and maintaining design systems that actually stick.',
    description: '<p>Design systems fail not because of bad components, but because of bad processes. In this hands-on half-day workshop, we\'ll cover how to build a design system your engineering and design teams will actually use — from token architecture to contribution workflows.</p><p>You\'ll leave with a practical playbook you can apply to your team on Monday.</p>',
    startAt: new Date('2026-08-02T10:00:00+05:30'),
    endAt:   new Date('2026-08-02T14:00:00+05:30'),
    timezone: 'Asia/Kolkata',
    type: 'online',
    status: 'published',
    onlineUrl: 'https://zoom.us/j/example',
    maxAttendees: 50,
    isRegistrationRequired: true,
    showAttendeesCount: true,
    isFeatured: true,
    ticketTiers: {
      create: [
        { name: 'Standard', price: 199900, currency: 'INR', quantity: 30, soldCount: 0, isVisible: true, perOrderMin: 1, perOrderMax: 2, position: 0 },
        { name: 'Team (3 seats)', price: 499900, currency: 'INR', quantity: 10, soldCount: 0, isVisible: true, perOrderMin: 1, perOrderMax: 1, position: 1 },
      ],
    },
    speakers: {
      create: [
        { name: 'Rohan Verma', designation: 'Design Systems Lead', company: 'Atlassian', bio: 'Rohan has built design systems at scale for three unicorn startups. He\'s a regular speaker at Config and React India.', position: 0 },
      ],
    },
    agendaItems: {
      create: [
        { title: 'Why Most Design Systems Fail', startsAt: new Date('2026-08-02T10:00:00+05:30'), endsAt: new Date('2026-08-02T10:45:00+05:30'), type: 'keynote', position: 0 },
        { title: 'Token Architecture Workshop', startsAt: new Date('2026-08-02T10:45:00+05:30'), endsAt: new Date('2026-08-02T11:45:00+05:30'), type: 'session', position: 1 },
        { title: 'Break', startsAt: new Date('2026-08-02T11:45:00+05:30'), endsAt: new Date('2026-08-02T12:00:00+05:30'), type: 'break', position: 2 },
        { title: 'Contribution & Governance Models', startsAt: new Date('2026-08-02T12:00:00+05:30'), endsAt: new Date('2026-08-02T13:00:00+05:30'), type: 'session', position: 3 },
        { title: 'Live Q&A', startsAt: new Date('2026-08-02T13:00:00+05:30'), endsAt: new Date('2026-08-02T14:00:00+05:30'), type: 'networking', position: 4 },
      ],
    },
  },
  {
    title: 'Headtilts Anniversary Meetup 2026',
    slug: slug('Headtilts Anniversary Meetup 2026'),
    excerpt: 'Celebrate three years of Headtilts with the community that made it happen.',
    description: '<p>Three years ago, Headtilts started as a blog. Today it\'s a community. We\'re throwing a party to celebrate — with live music, a community gallery, lightning talks from readers-turned-contributors, and lots of good food.</p><p>This one is free. It\'s our thank-you to you.</p>',
    startAt: new Date('2026-08-15T16:00:00+05:30'),
    endAt:   new Date('2026-08-15T21:00:00+05:30'),
    timezone: 'Asia/Kolkata',
    type: 'in_person',
    status: 'published',
    venueName: 'Taj MG Road',
    venueAddress: '41/3 MG Road',
    venueCity: 'Bangalore',
    venueState: 'Karnataka',
    venueCountry: 'India',
    maxAttendees: 200,
    isRegistrationRequired: true,
    showAttendeesCount: true,
    showAttendeesNames: false,
    isFeatured: true,
    ticketTiers: {
      create: [
        { name: 'Community (Free)', price: 0, currency: 'INR', quantity: 200, soldCount: 0, isVisible: true, perOrderMin: 1, perOrderMax: 2, position: 0 },
      ],
    },
    speakers: {
      create: [
        { name: 'The Headtilts Team', designation: 'Founders', bio: 'The people behind the platform.', position: 0 },
      ],
    },
    agendaItems: {
      create: [
        { title: 'Welcome Reception', startsAt: new Date('2026-08-15T16:00:00+05:30'), endsAt: new Date('2026-08-15T17:00:00+05:30'), type: 'networking', position: 0 },
        { title: 'Community Gallery Walk', startsAt: new Date('2026-08-15T17:00:00+05:30'), endsAt: new Date('2026-08-15T17:45:00+05:30'), type: 'session', position: 1 },
        { title: 'Lightning Talks from the Community', startsAt: new Date('2026-08-15T17:45:00+05:30'), endsAt: new Date('2026-08-15T19:00:00+05:30'), type: 'session', position: 2 },
        { title: 'Live Music & Dinner', startsAt: new Date('2026-08-15T19:00:00+05:30'), endsAt: new Date('2026-08-15T21:00:00+05:30'), type: 'keynote', position: 3 },
      ],
    },
  },
];

async function main() {
  console.log('Seeding events…');

  for (const ev of events) {
    const { ticketTiers, speakers, agendaItems, ...data } = ev;
    const created = await prisma.event.upsert({
      where: { slug: data.slug },
      update: {},
      create: {
        ...data,
        ticketTiers,
        speakers,
        agendaItems,
      },
    });
    console.log(`  ✓ ${created.title}`);
  }

  console.log('Done.');
}

main().catch(console.error).finally(() => prisma.$disconnect());
