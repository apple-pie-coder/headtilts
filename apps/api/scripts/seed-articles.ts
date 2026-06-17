import { prisma } from '../src/config/database';
import { createPost } from '../src/services/posts.service';

/**
 * One-off content seed: 6 music articles in EACH of the
 * News / Reviews / Interviews / Editorials categories (24 total), each
 * using an existing image from the media library as its featured image
 * (and one more inline). Bands and artists referenced here are fictional
 * sample content. Idempotent: posts whose slug already exists are skipped,
 * so this can be re-run safely.
 */

interface ArticleSpec {
  title: string;
  excerpt: string;
  categorySlug: 'news' | 'reviews' | 'interviews' | 'editorials';
  tagNames: string[];
  isFeatured?: boolean;
  body: string; // article body (without the inline figure, which is added programmatically)
}

const articles: ArticleSpec[] = [
  // ============================== NEWS ==============================
  {
    title: 'Velvet Tides Announce Surprise Winter Tour Across Twelve Cities',
    excerpt:
      'After two years off the road, dream-pop quartet Velvet Tides return with a twelve-date winter run and a promise of unreleased material every night.',
    categorySlug: 'news',
    tagNames: ['Velvet Tides', 'Tour', 'Dream Pop'],
    isFeatured: true,
    body: `
<p>Dream-pop quartet <strong>Velvet Tides</strong> ended a two-year silence this morning with a single line on their socials: "We're coming back, and we're bringing the whole record." Within the hour the band confirmed a twelve-city winter tour that opens in Portland on December 3rd and closes with a two-night stand in their hometown of Glasgow.</p>
<h2>Twelve nights, twelve setlists</h2>
<p>According to the band, no two shows will share a setlist. "We've been sitting on a record's worth of songs," said frontwoman Iris Vane in the announcement. "Rather than drip-feed singles, we want people in the room to hear them first." Each night will reportedly feature at least one piece that has never been performed or released.</p>
<blockquote>"We missed the noise of a real crowd more than we expected. This tour is us saying thank you, loudly." — Iris Vane</blockquote>
<p>Pre-sale begins Friday for fan-club members, with general tickets following the next week. The band also hinted that the tour could double as the rollout for their long-rumoured third album, though no release date has been set.</p>
<h2>What we know about the new material</h2>
<p>Sources close to the band describe the unreleased songs as "warmer and more guitar-forward" than the synth-soaked textures of their last record. Whether that marks a permanent shift or a single chapter, fans will find out one city at a time.</p>
`,
  },
  {
    title: 'Indie Label Moonlit Records Signs Three Breakout Acts for 2026',
    excerpt:
      'Moonlit Records has quietly built one of the most talked-about rosters of the year, adding three rising acts ahead of a busy festival season.',
    categorySlug: 'news',
    tagNames: ['Moonlit Records', 'Signings', 'Indie'],
    body: `
<p>Independent label <strong>Moonlit Records</strong> confirmed today that it has signed three breakout acts for the 2026 season: post-punk outfit <em>Saffron Lake</em>, bedroom-pop solo artist <em>Juno Reyes</em>, and the genre-bending collective <em>Glass Harbor</em>.</p>
<h2>A roster built on word of mouth</h2>
<p>None of the three came up through traditional industry channels. Saffron Lake built a following through relentless touring; Juno Reyes went viral with a single recorded on a phone; Glass Harbor self-released two EPs before a single label call came in.</p>
<p>"We don't chase numbers, we chase rooms that feel alive," label co-founder Dele Amobi said. "All three of these acts make people lean in."</p>
<h2>What comes next</h2>
<p>Moonlit says debut full-lengths from all three are slated for release before the end of the year, with festival appearances to be announced. For a label that started in a converted garage five years ago, it is the most ambitious slate yet.</p>
`,
  },
  {
    title: 'Festival Lineup Leak Hints at a Genre-Bending 2026 Edition',
    excerpt:
      'A leaked poster for next summer’s Tidelines Festival points to its most eclectic lineup yet, mixing headline pop, noise-rock and ambient electronica.',
    categorySlug: 'news',
    tagNames: ['Tidelines Festival', 'Lineup', 'Festival'],
    body: `
<p>An apparent draft poster for the 2026 edition of <strong>Tidelines Festival</strong> circulated online overnight, and if it holds up, organisers are planning their most genre-spanning weekend to date.</p>
<h2>An unlikely mix at the top</h2>
<p>The leaked artwork pairs a stadium-pop headliner with a Saturday-night slot for noise-rock veterans and a Sunday closer from an ambient electronic act better known for gallery installations than main stages. Mid-card names span folk, drill, jazz fusion and at least two acts that defy any tidy label.</p>
<blockquote>"Tidelines has always been about collisions," a person familiar with the booking said. "This year leans all the way into it."</blockquote>
<p>Organisers have not confirmed the lineup and asked outlets not to treat the leak as final. An official announcement is expected within the fortnight, alongside ticket details.</p>
`,
  },
  {
    title: 'Streaming Platform Rolls Out Lossless Audio for All Subscribers',
    excerpt:
      'A major streaming service is making lossless audio standard at no extra cost — a move that could reshape how casual listeners hear music.',
    categorySlug: 'news',
    tagNames: ['Streaming', 'Lossless', 'Industry'],
    body: `
<p>One of the largest streaming platforms announced today that <strong>lossless audio</strong> will become standard for every subscriber tier at no additional charge, ending years of paywalling higher-fidelity playback behind premium plans.</p>
<h2>What changes for listeners</h2>
<p>The rollout begins next month and will apply automatically once users update their apps. The company says the change covers "the overwhelming majority" of its catalogue, with the remainder being re-mastered and re-ingested over the coming year.</p>
<p>Audio engineers welcomed the move but cautioned that most listeners on wireless earbuds may not hear a dramatic difference. "Fidelity is only as good as the weakest link in the chain," one mastering engineer noted, "and for a lot of people that's still the headphones."</p>
<h2>Pressure on the rest of the market</h2>
<p>The announcement immediately raised questions about whether rival services will follow suit. For now, the company is betting that "lossless by default" becomes the new baseline expectation across the industry.</p>
`,
  },
  {
    title: 'Beloved Venue The Lantern Room Saved After Community Buyout',
    excerpt:
      'The 200-capacity Lantern Room, a launchpad for a generation of local bands, will stay open after fans and musicians raised the funds to buy it.',
    categorySlug: 'news',
    tagNames: ['The Lantern Room', 'Grassroots', 'Venues'],
    body: `
<p>The <strong>Lantern Room</strong>, a 200-capacity venue that has hosted first gigs for a generation of local acts, has been saved from closure after a community buyout reached its target this week.</p>
<h2>From eviction notice to ownership</h2>
<p>Six months ago the venue faced closure when its lease was put up for sale. A coalition of regulars, former staff and musicians who got their start on its tiny stage launched a share offer, eventually raising enough to purchase the building outright.</p>
<blockquote>"Every band in this city has a Lantern Room story. We weren't about to let it become flats." — campaign organiser Nadia Brooks</blockquote>
<p>The venue will now be run as a community-owned non-profit, with profits reinvested into lower ticket prices and paid slots for emerging artists. Its first show under new ownership is already sold out.</p>
`,
  },
  {
    title: 'Glass Harbor Tease Debut Album With Cryptic Billboard Campaign',
    excerpt:
      'Coordinates, a date and a single lyric — Glass Harbor have begun rolling out their debut album with billboards in five cities and no further explanation.',
    categorySlug: 'news',
    tagNames: ['Glass Harbor', 'Debut Album', 'Marketing'],
    body: `
<p>Genre-bending collective <strong>Glass Harbor</strong> have begun teasing their long-awaited debut album in the most analogue way possible: physical billboards in five cities, each carrying a set of coordinates, a date, and a single unattributed lyric.</p>
<h2>A puzzle for the fans</h2>
<p>Within hours, listeners had pieced together that the coordinates point to small venues in each city and that the shared date — three weeks from now — likely marks the album's release. The band has said nothing official, letting the campaign speak for itself.</p>
<p>"They've always trusted their audience to do the work," said one industry observer. "It's a refreshing bet that mystery still beats a push notification."</p>
<h2>What we expect</h2>
<p>The record will be the group's first full-length after two self-released EPs and their recent signing to Moonlit Records. If the billboards are any guide, the rollout will reward patience over hype.</p>
`,
  },

  // ============================= REVIEWS =============================
  {
    title: "Album Review: 'Neon Cathedral' by The Paper Astronauts",
    excerpt:
      "The Paper Astronauts trade arena gloss for something stranger and more intimate on 'Neon Cathedral' — and it's their best work yet.",
    categorySlug: 'reviews',
    tagNames: ['The Paper Astronauts', 'Album Review', 'Indie Rock'],
    body: `
<p>There is a moment three tracks into <strong>Neon Cathedral</strong> where The Paper Astronauts seem to forget they were ever a stadium band. The drums drop out, a single detuned guitar hangs in the air, and singer Cole Marsh half-whispers a verse that would have been buried under reverb on their earlier records. It is the sound of a band deciding to trust the quiet.</p>
<h2>Less polish, more presence</h2>
<p>Where the group's previous album reached for the cheap seats, <em>Neon Cathedral</em> pulls inward. The production is deliberately rough at the edges — you can hear fingers on strings, a chair creaking, a take that almost falls apart and doesn't. It makes the big moments, when they arrive, hit twice as hard.</p>
<blockquote>The record's thesis seems to be that intimacy scales better than spectacle.</blockquote>
<h2>Highlights</h2>
<p>"Lantern Year" is the obvious single, but the real centre of the album is the seven-minute "Tidewater," which builds from a lullaby into something close to a hymn. By the closing track the band has earned every swell.</p>
<p><strong>Verdict:</strong> 8.5/10 — a confident left turn that rewards repeat listens.</p>
`,
  },
  {
    title: 'Live Review: Saffron Lake Set the Festival Main Stage Ablaze',
    excerpt:
      'On a rain-soaked Saturday, Saffron Lake turned a mid-afternoon slot into the weekend’s most talked-about set.',
    categorySlug: 'reviews',
    tagNames: ['Saffron Lake', 'Live Review', 'Festival'],
    body: `
<p>The forecast said rain all day, and the forecast was right. None of it mattered the moment <strong>Saffron Lake</strong> walked on stage forty minutes into a soaked Saturday afternoon and opened with the snarling riff of "Brick & Bone."</p>
<h2>A set that refused to lose momentum</h2>
<p>What could have been a low-stakes mid-card slot became the talking point of the entire weekend. The band played like the headliner, ripping through a tight forty-five minutes with barely a pause for breath. By the third song the crowd had tripled in size as people drifted over from neighbouring stages.</p>
<blockquote>"You waited in the rain for us — so we're not wasting a second of it," guitarist Remy Sol told the crowd.</blockquote>
<h2>The moment of the day</h2>
<p>The closer, an extended version of "Harbour Lights," ended with the entire band off their mics, letting the crowd carry the final chorus. It was the kind of communal moment festivals exist to create — and Saffron Lake made it look effortless.</p>
`,
  },
  {
    title: "Album Review: 'Static Bloom' by Juno Reyes",
    excerpt:
      "Juno Reyes turns bedroom-pop intimacy into something widescreen on a debut that never loses its handmade warmth.",
    categorySlug: 'reviews',
    tagNames: ['Juno Reyes', 'Album Review', 'Bedroom Pop'],
    body: `
<p>You can still hear the bedroom in <strong>Static Bloom</strong> — the soft clip of an overdriven laptop mic, the hum of a cheap amp — but Juno Reyes has learned to build cathedrals out of those small sounds.</p>
<h2>Big feelings, small rooms</h2>
<p>Reyes first went viral with a single recorded on a phone, and the temptation on a debut would be to scrub away every imperfection. Instead, the album leans into them, layering wobbly synths and close-mic'd vocals until the songs feel enormous without ever feeling slick.</p>
<blockquote>It's the rare debut that sounds both unmistakably homemade and genuinely ambitious.</blockquote>
<h2>Highlights</h2>
<p>"Porchlight" is the heart of the record, a two-minute miracle of melody, while the closing "Static Bloom" stretches out into a hazy, six-minute fade that you'll want to start over the moment it ends.</p>
<p><strong>Verdict:</strong> 8/10 — a debut that earns the hype and then some.</p>
`,
  },
  {
    title: "EP Review: Moth & Marrow Find Their Voice on 'Tin Roof Sessions'",
    excerpt:
      'Recorded live to tape in a converted barn, the new Moth & Marrow EP is rough, warm and quietly devastating.',
    categorySlug: 'reviews',
    tagNames: ['Moth & Marrow', 'EP Review', 'Folk'],
    body: `
<p>There are no click tracks on <strong>Tin Roof Sessions</strong>, and you can tell. The new five-song EP from folk duo <strong>Moth &amp; Marrow</strong> was cut live to tape in a converted barn, and it breathes in a way their earlier studio work never quite did.</p>
<h2>The sound of a room</h2>
<p>Across five tracks you hear rain on the titular tin roof, the creak of a wooden floor, two voices finding each other in real time. It is an EP that trusts space — the silences are as deliberate as the notes.</p>
<p>The writing has tightened, too. "Hollow Oak" pares a breakup down to a single repeated line, and it lands harder for the restraint.</p>
<h2>Verdict</h2>
<p>Short, unfussy and quietly devastating. <strong>7.5/10</strong> — the sound of a band that has finally stopped trying to sound like anyone else.</p>
`,
  },
  {
    title: "Album Review: 'Cartography' by Northern Wires",
    excerpt:
      'Northern Wires aim for the cosmos on an ambitious, occasionally overstuffed concept album about getting lost and finding your way back.',
    categorySlug: 'reviews',
    tagNames: ['Northern Wires', 'Album Review', 'Post-Rock'],
    body: `
<p><strong>Cartography</strong> is the kind of record bands make when they have something to prove. Across nine sprawling tracks, post-rock outfit <strong>Northern Wires</strong> chart a loose concept about getting lost — geographically, emotionally — and the long way home.</p>
<h2>Ambition and its costs</h2>
<p>When it works, it really works: the central trilogy of "True North," "Drift" and "Landfall" is as gripping as anything the genre has produced this year, all slow-burn builds and earned catharsis. When it doesn't, the album mistakes length for depth, and a couple of mid-record passages wander without ever arriving.</p>
<blockquote>A tighter edit would have made a very good record a great one.</blockquote>
<h2>Verdict</h2>
<p><strong>7/10</strong> — flawed, overlong and frequently breathtaking. Worth getting lost in, even if you'll want to skip a track or two.</p>
`,
  },
  {
    title: 'Live Review: An Intimate Night With Iris Vane at the Lantern Room',
    excerpt:
      'Stripped of her band and her effects pedals, Velvet Tides’ frontwoman delivered a hushed solo set that held 200 people perfectly still.',
    categorySlug: 'reviews',
    tagNames: ['Iris Vane', 'Live Review', 'Acoustic'],
    body: `
<p>No band, no synths, no wall of reverb to hide behind — just <strong>Iris Vane</strong>, an acoustic guitar, and 200 people holding their breath. The Velvet Tides frontwoman's solo show at the recently saved Lantern Room was a study in how much power lives in restraint.</p>
<h2>Old songs, new skin</h2>
<p>Stripped of their studio sheen, the Velvet Tides catalogue revealed its bones. "Glasshouse," normally a shimmering anthem, became a near-whispered confession. The crowd, mercifully silent, leaned in for every word.</p>
<blockquote>"This is terrifying, by the way," Vane admitted between songs. "I can hear all of you breathing."</blockquote>
<h2>The takeaway</h2>
<p>Two unreleased songs hinted at the warmer, guitar-led direction rumoured for the band's next record. On the evidence of tonight, the quiet suits her. <strong>9/10.</strong></p>
`,
  },

  // ============================ INTERVIEWS ============================
  {
    title: 'In Conversation with Mara Okonkwo of Glass Harbor',
    excerpt:
      'The Glass Harbor frontwoman on writing in the dark, leaving major-label offers on the table, and why the band records everything live.',
    categorySlug: 'interviews',
    tagNames: ['Glass Harbor', 'Interview', 'Songwriting'],
    body: `
<p>Glass Harbor have spent five years doing things the slow way: self-releasing, self-booking, and turning down deals that most bands would sign without reading. We sat down with frontwoman <strong>Mara Okonkwo</strong> ahead of the collective's first full-length to talk craft, patience, and the value of saying no.</p>
<h2>On writing songs</h2>
<p><strong>You've said you write most songs "in the dark." What does that mean?</strong></p>
<p>"Literally, sometimes — lights off, no screens. I think we edit ourselves too early when we can see everything. In the dark you commit to a melody before you can talk yourself out of it."</p>
<h2>On turning down major labels</h2>
<p><strong>You walked away from offers most bands dream about. Any regrets?</strong></p>
<blockquote>"None. The day signing a deal feels like losing control of the songs is the day it's not worth it. We'd rather own the work and grow slower."</blockquote>
<h2>On recording live</h2>
<p>"We track almost everything in one room, playing together. You lose a little precision and you gain the thing that actually matters — the feeling of people listening to each other. You can't overdub that."</p>
`,
  },
  {
    title: 'The Long Game: A Conversation With Producer Dele Amobi',
    excerpt:
      'The Moonlit Records co-founder on building a label without chasing trends, and why he still answers every demo himself.',
    categorySlug: 'interviews',
    tagNames: ['Dele Amobi', 'Interview', 'Production'],
    body: `
<p>Five years ago <strong>Dele Amobi</strong> ran a label out of a converted garage. Today Moonlit Records has one of the most envied rosters in independent music. We asked him how — and why he's in no hurry.</p>
<h2>On finding artists</h2>
<p><strong>You're famous for answering demos personally. Still true?</strong></p>
<p>"Every one. It takes hours, and I wouldn't trade it. You can't outsource taste. The moment a label becomes a spreadsheet, it stops being a label."</p>
<h2>On resisting trends</h2>
<blockquote>"Chasing a trend means you arrive exactly when it's leaving. We'd rather sign the band that starts the next one."</blockquote>
<h2>On patience</h2>
<p>"People ask when we'll scale. We are scaling — just on a timeline that lets the artists actually develop. A career is a long game. I'm trying to build labels and lives that last longer than a news cycle."</p>
`,
  },
  {
    title: 'Juno Reyes on Going From Bedroom Demos to a Debut LP',
    excerpt:
      'The breakout artist on the song that changed everything, the fear of "ruining it" with a studio, and keeping the wobble in.',
    categorySlug: 'interviews',
    tagNames: ['Juno Reyes', 'Interview', 'Bedroom Pop'],
    body: `
<p>A year ago <strong>Juno Reyes</strong> was uploading phone recordings to a few hundred followers. Then one of them caught fire. With a debut LP, <em>Static Bloom</em>, now out, we talked about the strange leap from bedroom to studio.</p>
<h2>On the song that changed everything</h2>
<p>"I almost didn't post it. It felt unfinished. I think that's exactly why people connected — it sounded like a person, not a product."</p>
<h2>On the fear of the studio</h2>
<blockquote>"My biggest fear was that a 'real' studio would sand off everything that made the songs mine. So we kept the wobble in. The mistakes are load-bearing."</blockquote>
<h2>On what's next</h2>
<p>"Honestly? I want to get better at this without getting slicker. There's a difference. I never want a song to sound like it came off an assembly line."</p>
`,
  },
  {
    title: 'Remy Sol of Saffron Lake on Noise, Nerves and the Road',
    excerpt:
      'The Saffron Lake guitarist on turning stage fright into fuel, the discipline of a forty-five-minute set, and why they still load their own gear.',
    categorySlug: 'interviews',
    tagNames: ['Saffron Lake', 'Interview', 'Touring'],
    body: `
<p>Saffron Lake built their following the hard way — one sweaty room at a time. After a festival set that stole the weekend, guitarist <strong>Remy Sol</strong> sat down to talk about the engine behind the noise.</p>
<h2>On stage fright</h2>
<p>"I throw up before half our shows. I've made peace with it. The nerves and the energy come from the same place — kill one and you kill the other."</p>
<h2>On the short set</h2>
<blockquote>"Forty-five minutes is a gift and a guillotine. There's no room for a dud song. It made us ruthless about our own material."</blockquote>
<h2>On staying grounded</h2>
<p>"We still load our own gear. Not as some authenticity stunt — it just keeps your feet on the ground. Hard to get a big head when you're coiling cables at 2am."</p>
`,
  },
  {
    title: 'Cole Marsh of The Paper Astronauts on Learning to Play Quiet',
    excerpt:
      'After years of arena-sized choruses, the frontman explains why the band’s new album whispers — and what it cost him to get there.',
    categorySlug: 'interviews',
    tagNames: ['The Paper Astronauts', 'Interview', 'Indie Rock'],
    body: `
<p>The Paper Astronauts could fill arenas. On <em>Neon Cathedral</em>, they chose instead to make a record you have to lean in to hear. Frontman <strong>Cole Marsh</strong> told us why.</p>
<h2>On scaling down</h2>
<p>"We'd gotten so good at the big swing that we forgot how to do anything else. I realised I couldn't remember the last time I'd sung something softly and meant it."</p>
<h2>On the risk</h2>
<blockquote>"Our manager was terrified. 'Where are the singles?' But intimacy travels. A whisper in a stadium is louder than a shout, if you've earned it."</blockquote>
<h2>On what he learned</h2>
<p>"That the loudest thing I can do is be honest. Turns out you don't need a wall of guitars for that. Sometimes one is plenty."</p>
`,
  },
  {
    title: 'Behind the Mixing Desk: Engineer Priya Nair on Capturing a Live Room',
    excerpt:
      'The in-demand engineer on why she fights to record bands together, the myth of the "perfect" take, and listening with your whole body.',
    categorySlug: 'interviews',
    tagNames: ['Priya Nair', 'Interview', 'Engineering'],
    body: `
<p>If a record from the past year sounded warm, alive and a little dangerous, there's a good chance <strong>Priya Nair</strong> was behind the desk. We talked craft with one of the most sought-after engineers working today.</p>
<h2>On recording live</h2>
<p>"I push every band to track together in one room. Editing afterwards is easy; capturing the moment four people lock in is not. You can't fake that, and you can't reconstruct it later."</p>
<h2>On the 'perfect' take</h2>
<blockquote>"The perfect take is a myth that's ruined a thousand records. I'll take a flawed take with a pulse over a flawless one with none, every single time."</blockquote>
<h2>On listening</h2>
<p>"People mix with their eyes now — staring at waveforms. I make myself close the laptop and just listen with my whole body. If it makes me move, it's right. The meters can't tell you that."</p>
`,
  },

  // ============================ EDITORIALS ============================
  {
    title: 'Why the Album Still Matters in the Age of the Endless Playlist',
    excerpt:
      'Streaming rewards the single and the playlist. So why do the records that change our lives still arrive as albums? An argument for the long form.',
    categorySlug: 'editorials',
    tagNames: ['Editorial', 'Albums', 'Streaming'],
    body: `
<p>Every metric in modern music points away from the album. Playlists drive discovery, algorithms reward the three-minute hook, and an artist can build a career on a single track that never sits beside another. And yet the records that lodge themselves in our lives — the ones we return to a decade later — almost always arrive as albums. That is not an accident.</p>
<h2>Sequence is meaning</h2>
<p>A playlist is a list. An album is an argument. The order of songs, the silence between them, the deliberate placement of the quiet track after the loud one — these are decisions, and decisions carry meaning. Shuffle a great record and you don't just lose convenience; you lose the author's intent.</p>
<blockquote>A single asks for your attention. An album asks for your time. They are not the same request.</blockquote>
<h2>The case for the long form</h2>
<p>None of this is nostalgia. Plenty of albums are bloated, padded to hit a streaming-friendly runtime. The point isn't length — it's intention. When an artist decides that forty minutes belong together, and earns that decision, they offer something the playlist never can: a complete thought.</p>
<h2>Where this leaves us</h2>
<p>Streaming isn't the enemy of the album; indifference is. As long as listeners are willing to sit with a record front to back, artists will keep making them. The format survives not because it's efficient, but because it's the closest music gets to a conversation.</p>
`,
  },
  {
    title: "The Vinyl Revival Isn't Nostalgia — It's a Demand for Ownership",
    excerpt:
      'Record sales keep climbing in a streaming world. The easy explanation is nostalgia. The real one is that people are tired of renting their music.',
    categorySlug: 'editorials',
    tagNames: ['Editorial', 'Vinyl', 'Ownership'],
    body: `
<p>Vinyl sales have risen for the better part of two decades now, which is long enough that "it's just a fad" no longer holds. The lazy explanation is nostalgia. The more interesting one is that people are quietly rebelling against the idea that you can love something you don't own.</p>
<h2>The streaming bargain</h2>
<p>Streaming is miraculous and it is also a rental agreement. The catalogue you've built can shrink overnight when a license lapses. Your favourite record can vanish from your library and you'll never get a refund, because you never bought anything.</p>
<blockquote>A record on a shelf can't be revoked by a licensing dispute. That permanence is the whole point.</blockquote>
<h2>The object as commitment</h2>
<p>Buying vinyl is slow, expensive and gloriously inconvenient. That friction is a feature. It turns listening into a choice, an artefact into a commitment. In an age of infinite, frictionless access, choosing to own one record is a small act of devotion.</p>
`,
  },
  {
    title: 'We Need to Talk About How We Pay Songwriters',
    excerpt:
      'The people who write the songs we love are often the last to get paid — and the way streaming royalties are split is quietly making it worse.',
    categorySlug: 'editorials',
    tagNames: ['Editorial', 'Royalties', 'Industry'],
    body: `
<p>Ask a casual listener who makes the music they love and they'll name the performer. Ask who gets paid and the honest answer is: it's complicated, and the person who actually wrote the song is often near the back of the queue.</p>
<h2>The split nobody sees</h2>
<p>Streaming royalties are divided between recording rights and publishing rights, and the publishing share — the slice that flows to songwriters — has historically been the smaller one. For a writer who doesn't perform, a hit can generate enormous streams and a heartbreakingly modest cheque.</p>
<blockquote>We've built an economy that pays for the recording and treats the song itself as an afterthought.</blockquote>
<h2>Why it matters</h2>
<p>If we make songwriting financially unviable, we don't just hurt individuals — we narrow who can afford to do it at all. The next generation of great songs depends on people being able to keep the lights on while they write them. That's not charity; it's maintenance of the thing we all enjoy.</p>
`,
  },
  {
    title: 'In Defense of the Difficult Second Album',
    excerpt:
      'We mock the sophomore slump, but the records where a band visibly struggles to grow are often the ones worth keeping.',
    categorySlug: 'editorials',
    tagNames: ['Editorial', 'Albums', 'Craft'],
    body: `
<p>The "difficult second album" is one of music's favourite punchlines. A band nails a debut, then stumbles trying to follow it. But I've come to believe those awkward, searching second records are frequently the most honest things an artist ever makes.</p>
<h2>The debut is easy to love</h2>
<p>A debut is the distillation of years — every good idea a band has ever had, polished by time. Of course it's strong. The second album, made under deadline and scrutiny, is where you actually watch someone figure out who they are.</p>
<blockquote>The slump isn't a failure of talent. It's the sound of growth happening in public.</blockquote>
<h2>Give them room</h2>
<p>Some of the most beloved catalogues contain a second album that fans once dismissed and later came to treasure. We should be more patient with the transitional record — the one where a band refuses to simply repeat itself. That refusal is exactly what we should want.</p>
`,
  },
  {
    title: "The Algorithm Can't Love a Band the Way a Scene Can",
    excerpt:
      'Recommendation engines are good at finding you more of the same. Local scenes are good at making careers. We keep confusing the two.',
    categorySlug: 'editorials',
    tagNames: ['Editorial', 'Scenes', 'Discovery'],
    body: `
<p>We've handed music discovery to the algorithm, and it's genuinely good at one thing: finding you more of what you already like. But a recommendation engine has never put up a flyer, lent a band a drum kit, or filled a room for an act nobody had heard of. Scenes do that. The two are not interchangeable.</p>
<h2>What a scene actually does</h2>
<p>A local scene is a support system disguised as a social one. It's the venue that books the unproven act, the older band that brings the younger one on tour, the crowd that shows up on a wet Tuesday because someone they trust said it was worth it.</p>
<blockquote>An algorithm optimises for what you'll click. A scene invests in what might become great.</blockquote>
<h2>Use both, but know the difference</h2>
<p>There's nothing wrong with a good recommendation. But if we want a future full of strange, ambitious, surprising bands, we have to keep feeding the rooms that make them — with our money, our attention and our wet-Tuesday turnout.</p>
`,
  },
  {
    title: 'Why Live Music Is the Last Truly Shared Experience',
    excerpt:
      'Almost everything we watch and hear is now personalised and solitary. A gig is one of the few cultural events we still go through together.',
    categorySlug: 'editorials',
    tagNames: ['Editorial', 'Live Music', 'Culture'],
    body: `
<p>Think about how you consumed culture this week. Your feed, your playlist, your queue — all tuned to you, all experienced alone, even when you're in a room full of people on their own devices. Now think about the last time you were at a gig. That difference is the whole argument.</p>
<h2>One room, one moment</h2>
<p>At a show, everyone hears the same song at the same second. The drop, the key change, the moment the whole room sings the line back — these can't be personalised, paused or skipped. You experience them on the artist's terms, alongside strangers, or not at all.</p>
<blockquote>Almost nothing else in modern life asks a few hundred people to feel the same thing at the same time anymore.</blockquote>
<h2>Why it's worth protecting</h2>
<p>That shared, unrepeatable quality is precisely what makes live music feel like an event rather than content. As the rest of culture splinters into a million private streams, the gig remains stubbornly, gloriously collective. We should guard it like the rare thing it is.</p>
`,
  },
];

async function main() {
  const author = await prisma.user.findFirst({ orderBy: { createdAt: 'asc' } });
  if (!author) {
    throw new Error('No user found to assign as author. Create a user first.');
  }

  const categories = await prisma.category.findMany();
  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  const media = await prisma.media.findMany({
    where: { mimeType: { startsWith: 'image/' } },
    orderBy: { id: 'asc' },
  });
  if (media.length === 0) {
    throw new Error('No images found in the media library.');
  }

  console.log(`Author: ${author.username} (${author.id})`);
  console.log(`Categories: ${[...categoryIdBySlug.keys()].join(', ')}`);
  console.log(`Images available: ${media.length}`);
  console.log(`Article specs: ${articles.length}\n`);

  const { slugify } = await import('@headtilts/shared');

  let created = 0;
  let skipped = 0;

  for (let i = 0; i < articles.length; i++) {
    const spec = articles[i];
    const slug = slugify(spec.title);

    const existing = await prisma.post.findUnique({ where: { slug } });
    if (existing) {
      console.log(`- SKIP   [${spec.categorySlug}] "${spec.title}" (slug exists, id ${existing.id})`);
      skipped++;
      continue;
    }

    const categoryId = categoryIdBySlug.get(spec.categorySlug);
    if (categoryId === undefined) {
      throw new Error(`Category "${spec.categorySlug}" not found in database.`);
    }

    const featured = media[i % media.length];
    const inline = media[(i + Math.ceil(media.length / 2)) % media.length];

    const inlineFigure = `
<figure>
  <img src="${inline.url}" alt="${spec.title}" />
  <figcaption>${spec.categorySlug.charAt(0).toUpperCase() + spec.categorySlug.slice(1)} — Headtilts</figcaption>
</figure>`;

    // Drop the inline figure in after the first heading for a natural layout.
    const firstHeadingEnd = spec.body.indexOf('</h2>');
    const content =
      firstHeadingEnd !== -1
        ? spec.body.slice(0, firstHeadingEnd + 5) + inlineFigure + spec.body.slice(firstHeadingEnd + 5)
        : spec.body + inlineFigure;

    const post = await createPost(
      {
        title: spec.title,
        content: content.trim(),
        excerpt: spec.excerpt,
        status: 'published',
        featuredImage: featured.url,
        isFeatured: spec.isFeatured ?? false,
        categoryIds: [categoryId],
        tagNames: spec.tagNames,
        metaTitle: spec.title,
        metaDescription: spec.excerpt,
      },
      author.id as unknown as number, // service stores the value as-is; author ids are UUID strings
    );

    console.log(
      `+ CREATE [${spec.categorySlug}] "${post.title}" -> id ${post.id}, featured ${featured.originalName}`,
    );
    created++;
  }

  console.log(`\nDone. Created ${created}, skipped ${skipped}, total specs ${articles.length}.`);
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
