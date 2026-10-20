import type { Side } from "./match-types";

/**
 * TASK-1816 — a What-If scenario: the trailing side of a REAL Premier League match, at the
 * real minute and score of its biggest deficit. Every field is derived from the committed
 * archive by `adapter/what-if-derive.ts`, and a test re-derives each entry below.
 *
 * `realXi` / `dismissedBefore` carry player NAMES (as the lineups and events record them);
 * the session maps them onto that club-season's pool, so no lineups file reaches the client.
 */
export interface Scenario {
  id: string;
  fixtureId: string;
  season: number;
  date: string;
  /** The side the coach takes — the one that was behind. */
  side: Side;
  /** Minute of the goal that created the deficit; play resumes the minute after. */
  startMinute: number;
  startScore: { home: number; away: number };
  /** The real final score. */
  history: { home: number; away: number };
  sentOffBefore: { home: number; away: number };
  dismissedBefore: { home: string[]; away: string[] };
  subsBefore: { home: number; away: number };
  realXi: { home: string[]; away: string[] };
}

export type Verdict = "rewrote" | "matched" | "repeated";

type Score = { home: number; away: number };

/** Win 2 / draw 1 / loss 0, then goal difference — from `side`'s point of view. */
function rank(score: Score, side: Side): [number, number] {
  const own = side === "home" ? score.home : score.away;
  const opp = side === "home" ? score.away : score.home;
  return [own > opp ? 2 : own === opp ? 1 : 0, own - opp];
}

/** Compare (result, then goal difference) against history, from the coach's side. */
export function compareFinals(a: Score, b: Score, side: Side): number {
  const [ra, ga] = rank(a, side);
  const [rb, gb] = rank(b, side);
  return ra !== rb ? ra - rb : ga - gb;
}

/**
 * Better than history → rewrote; level on both result and goal difference → matched;
 * worse → repeated. A side whose real counterpart already WON is rewritten by winning by
 * more, so every scenario can be rewritten.
 */
export function verdictFor(s: Scenario, final: Score): Verdict {
  const c = compareFinals(final, s.history, s.side);
  return c > 0 ? "rewrote" : c === 0 ? "matched" : "repeated";
}

/**
 * ⛔ FROZEN — pinned by a golden test. Changing an id or a start state changes what every
 * stored best result means (the `DAILY_SHAPES` rule). Generated from the archive; edit the
 * archive-derivation, never these values by hand.
 */
export const SCENARIOS: readonly Scenario[] = [
  {
    id: "2001-tot-mun",
    fixtureId: "2001-09-29-TOT-MUN",
    season: 2001,
    date: "2001-09-29",
    side: "away",
    startMinute: 45,
    startScore: {
      home: 3,
      away: 0,
    },
    history: {
      home: 3,
      away: 5,
    },
    sentOffBefore: {
      home: 0,
      away: 0,
    },
    dismissedBefore: {
      home: [],
      away: [],
    },
    subsBefore: {
      home: 0,
      away: 2,
    },
    realXi: {
      home: [
        "Teddy Sheringham",
        "Darren Anderton",
        "Dean Richards",
        "Les Ferdinand",
        "Ledley King",
        "Christian Ziege",
        "Mauricio Taricco",
        "Steffen Freund",
        "Gustavo Poyet",
        "Chris Perry",
        "Neil Sullivan",
      ],
      away: [
        "Andrew Cole",
        "Ronny Johnsen",
        "Laurent Blanc",
        "Gary Neville",
        "Juan Sebastián Verón",
        "Paul Scholes",
        "Fabien Barthez",
        "Nicky Butt",
        "Ruud van Nistelrooij",
        "Denis Irwin",
        "David Beckham",
      ],
    },
  },
  {
    id: "2011-new-ars",
    fixtureId: "2011-02-05-NEW-ARS",
    season: 2010,
    date: "2011-02-05",
    side: "home",
    startMinute: 26,
    startScore: {
      home: 0,
      away: 4,
    },
    history: {
      home: 4,
      away: 4,
    },
    sentOffBefore: {
      home: 0,
      away: 0,
    },
    dismissedBefore: {
      home: [],
      away: [],
    },
    subsBefore: {
      home: 0,
      away: 0,
    },
    realXi: {
      home: [
        "Michael Williamson",
        "Fabricio Coloccini",
        "Kevin Nolan",
        "José Enrique",
        "Peter Løvenkrands",
        "Joey Barton",
        "Jonás Gutiérrez",
        "Leon Best",
        "Steve Harper",
        "Danny Simpson",
        "Cheik Tioté",
      ],
      away: [
        "Wojciech Szczesny",
        "Francesc Fábregas",
        "Robin van Persie",
        "Johan Djourou",
        "Bacary Sagna",
        "Jack Wilshere",
        "Vassiriki Abou Diaby",
        "Gaël Clichy",
        "Laurent Koscielny",
        "Andrey Arshavin",
        "Theo Walcott",
      ],
    },
  },
  {
    id: "2014-cry-liv",
    fixtureId: "2014-05-05-CRY-LIV",
    season: 2013,
    date: "2014-05-05",
    side: "home",
    startMinute: 55,
    startScore: {
      home: 0,
      away: 3,
    },
    history: {
      home: 3,
      away: 3,
    },
    sentOffBefore: {
      home: 0,
      away: 0,
    },
    dismissedBefore: {
      home: [],
      away: [],
    },
    subsBefore: {
      home: 0,
      away: 0,
    },
    realXi: {
      home: [
        "Mile Jedinak",
        "Jason Puncheon",
        "Marouane Chamakh",
        "Julian Speroni",
        "Damien Delaney",
        "Kagisho Dikgacoi",
        "Yannick Bolasie",
        "Joe Ledley",
        "Joel Ward",
        "Scott Dann",
        "Adrian Mariappa",
      ],
      away: [
        "Martin Skrtel",
        "Mamadou Sakho",
        "Steven Gerrard",
        "Lucas Leiva",
        "Joe Allen",
        "Simon Mignolet",
        "Jon Flanagan",
        "Raheem Sterling",
        "Daniel Sturridge",
        "Glen Johnson",
        "Luis Suarez",
      ],
    },
  },
  {
    id: "2013-wba-mun",
    fixtureId: "2013-05-19-WBA-MUN",
    season: 2012,
    date: "2013-05-19",
    side: "home",
    startMinute: 30,
    startScore: {
      home: 0,
      away: 3,
    },
    history: {
      home: 5,
      away: 5,
    },
    sentOffBefore: {
      home: 0,
      away: 0,
    },
    dismissedBefore: {
      home: [],
      away: [],
    },
    subsBefore: {
      home: 0,
      away: 0,
    },
    realXi: {
      home: [
        "Gareth McAuley",
        "Jonas Olsson",
        "Graham Dorrans",
        "Youssouf Mulumbu",
        "Billy Jones",
        "Liam Ridgewell",
        "Claudio Yacob",
        "James Morrison",
        "Shane Long",
        "Ben Foster",
        "Chris Brunt",
      ],
      away: [
        "Chicharito",
        "Tom Cleverley",
        "Anders Lindegaard",
        "Alexander Büttner",
        "Antonio Valencia",
        "Michael Carrick",
        "Robin van Persie",
        "Jonny Evans",
        "Phil Jones",
        "Anderson",
        "Shinji Kagawa",
      ],
    },
  },
  {
    id: "2024-bou-lut",
    fixtureId: "2024-03-13-BOU-LUT",
    season: 2023,
    date: "2024-03-13",
    side: "home",
    startMinute: 46,
    startScore: {
      home: 0,
      away: 3,
    },
    history: {
      home: 4,
      away: 3,
    },
    sentOffBefore: {
      home: 0,
      away: 0,
    },
    dismissedBefore: {
      home: [],
      away: [],
    },
    subsBefore: {
      home: 2,
      away: 0,
    },
    realXi: {
      home: [
        "Neto",
        "Dango Ouattara",
        "Dominic Solanke",
        "Chris Mepham",
        "Adam Smith",
        "Illia Zabarnyi",
        "Antoine Semenyo",
        "Lewis Cook",
        "Luis Sinisterra",
        "Alex Scott",
        "Ryan Christie",
      ],
      away: [
        "Daiki Hashioka",
        "Alfie Doughty",
        "Carlton Morris",
        "Chiedozie Ogbene",
        "Tahith Chong",
        "Thomas Kaminski",
        "Teden Mengi",
        "Ross Barkley",
        "Reece Burke",
        "Jordan Clark",
        "Issa Kaboré",
      ],
    },
  },
  {
    id: "2005-nor-mid",
    fixtureId: "2005-01-22-NOR-MID",
    season: 2004,
    date: "2005-01-22",
    side: "home",
    startMinute: 78,
    startScore: {
      home: 1,
      away: 4,
    },
    history: {
      home: 4,
      away: 4,
    },
    sentOffBefore: {
      home: 0,
      away: 0,
    },
    dismissedBefore: {
      home: [],
      away: [],
    },
    subsBefore: {
      home: 3,
      away: 2,
    },
    realXi: {
      home: [
        "Dean Ashton",
        "Robert Green",
        "Adam Drury",
        "Craig Fleming",
        "Damien Francis",
        "Gary Doherty",
        "Phil Mulryne",
        "Mattias Jonson",
        "Darren Huckerby",
        "Marc Edworthy",
        "Jim Brennan",
      ],
      away: [
        "Franck Queudrue",
        "Stewart Downing",
        "Tony McMahon",
        "Ray Parlour",
        "Gareth Southgate",
        "Mark Schwarzer",
        "Michael Reiziger",
        "Doriva",
        "Boudewijn Zenden",
        "Jimmy Floyd Hasselbaink",
        "Joseph-Desire Job",
      ],
    },
  },
  {
    id: "1994-liv-mun",
    fixtureId: "1994-01-04-LIV-MUN",
    season: 1993,
    date: "1994-01-04",
    side: "home",
    startMinute: 24,
    startScore: {
      home: 0,
      away: 3,
    },
    history: {
      home: 3,
      away: 3,
    },
    sentOffBefore: {
      home: 0,
      away: 0,
    },
    dismissedBefore: {
      home: [],
      away: [],
    },
    subsBefore: {
      home: 0,
      away: 0,
    },
    realXi: {
      home: [
        "Jamie Redknapp",
        "Bruce Grobbelaar",
        "Mark Wright",
        "Neil Ruddock",
        "Rob Jones",
        "Steve McManaman",
        "John Barnes",
        "Nigel Clough",
        "Ian Rush",
        "Robbie Fowler",
        "Julian Dicks",
      ],
      away: [
        "Gary Pallister",
        "Steve Bruce",
        "Roy Keane",
        "Eric Cantona",
        "Brian McClair",
        "Paul Parker",
        "Denis Irwin",
        "Ryan Giggs",
        "Paul Ince",
        "Andrei Kanchelskis",
        "Peter Schmeichel",
      ],
    },
  },
  {
    id: "2000-sou-liv",
    fixtureId: "2000-08-26-SOU-LIV",
    season: 2000,
    date: "2000-08-26",
    side: "home",
    startMinute: 64,
    startScore: {
      home: 0,
      away: 3,
    },
    history: {
      home: 3,
      away: 3,
    },
    sentOffBefore: {
      home: 0,
      away: 0,
    },
    dismissedBefore: {
      home: [],
      away: [],
    },
    subsBefore: {
      home: 2,
      away: 0,
    },
    realXi: {
      home: [
        "Hassan Kachloul",
        "Matt Oakley",
        "Marian Pahars",
        "Uwe Rösler",
        "Neil Moss",
        "Jason Dodd",
        "Dean Richards",
        "Claus Lundekvam",
        "Jo Tessem",
        "Wayne Bridge",
        "Mark Draper",
      ],
      away: [
        "Jamie Carragher",
        "Sander Westerveld",
        "Dietmar Hamann",
        "Michael Owen",
        "Sami Hyypiä",
        "Nick Barmby",
        "Stéphane Henchoz",
        "Markus Babbel",
        "Steven Gerrard",
        "Vladimir Smicer",
        "Djimi Traore",
      ],
    },
  },
  {
    id: "2012-che-mun",
    fixtureId: "2012-02-05-CHE-MUN",
    season: 2011,
    date: "2012-02-05",
    side: "away",
    startMinute: 50,
    startScore: {
      home: 3,
      away: 0,
    },
    history: {
      home: 3,
      away: 3,
    },
    sentOffBefore: {
      home: 0,
      away: 0,
    },
    dismissedBefore: {
      home: [],
      away: [],
    },
    subsBefore: {
      home: 0,
      away: 0,
    },
    realXi: {
      home: [
        "Florent Malouda",
        "Michael Essien",
        "José Bosingwa",
        "David Luiz",
        "Gary Cahill",
        "Raul Meireles",
        "Daniel Sturridge",
        "Fernando Torres",
        "Petr Cech",
        "Branislav Ivanovic",
        "Juan Mata",
      ],
      away: [
        "David De Gea",
        "Rafael",
        "Michael Carrick",
        "Wayne Rooney",
        "Rio Ferdinand",
        "Patrice Evra",
        "Jonny Evans",
        "Ashley Young",
        "Ryan Giggs",
        "Antonio Valencia",
        "Danny Welbeck",
      ],
    },
  },
  {
    id: "1998-whu-wim",
    fixtureId: "1998-09-09-WHU-WIM",
    season: 1998,
    date: "1998-09-09",
    side: "away",
    startMinute: 27,
    startScore: {
      home: 3,
      away: 0,
    },
    history: {
      home: 3,
      away: 4,
    },
    sentOffBefore: {
      home: 0,
      away: 0,
    },
    dismissedBefore: {
      home: [],
      away: [],
    },
    subsBefore: {
      home: 0,
      away: 0,
    },
    realXi: {
      home: [
        "John Moncur",
        "Ian Wright",
        "Javier Margas",
        "Stan Lazaridis",
        "Shaka Hislop",
        "John Hartson",
        "Frank Lampard",
        "Trevor Sinclair",
        "Neil Ruddock",
        "Ian Pearce",
        "Eyal Berkovic",
      ],
      away: [
        "Duncan Jupp",
        "Carl Leaburn",
        "Alan Kimble",
        "Andy Roberts",
        "Neil Sullivan",
        "Marcus Gayle",
        "Kenny Cunningham",
        "Robbie Earle",
        "Chris Perry",
        "Michael Hughes",
        "Jason Euell",
      ],
    },
  },
];
