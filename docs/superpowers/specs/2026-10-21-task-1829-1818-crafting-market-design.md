# TASK-1829 Card crafting · TASK-1818 Mystery Market — design

Owner, 2026-10-21: the reward moment "should feel like opening a high-stakes loot pack —
suspenseful, rewarding, and full of tactical potential. The choices should force a fun trade-off
(a huge boost with a risky catch), making the player instantly want to test their new setup in
the next match." The owner then said "go ahead and start building". The remaining choices are
**Claude's calls**, listed to the owner in chat before merging.

## TASK-1818 — Mystery Market (`/game/market`)

**The run (Claude's calls):**

- Start with the **weakest legal XI** in the chaos pool, in a 4-4-2.
- Each match is harder: the opponent is a seeded draft from a 40-card window of the pool. It
  starts at the bottom and climbs `TIER_STEP` (12) ranks per win.
- Home and away alternate.
- A **win** opens a pack, a **draw** does nothing, and **three defeats** end the run.
- The best run is kept: most wins, then fewest matches.

**The pack (owner's shape):** three face-down cards on the app's own `CardBack`. "Open the pack"
reveals all three, each showing its **boon** and its **catch**, and you keep one. The six rewards
are a frozen list (Claude's call):

| Reward          | Boon                                           | Catch                                           |
| --------------- | ---------------------------------------------- | ----------------------------------------------- |
| Marquee Signing | an 85+ outfielder replaces your weakest player | he's a Hot-Head                                 |
| Wonderkid       | a player well above your average joins         | your best outfielder is sold                    |
| Gegenpress      | attack +9 for 2 matches                        | attack −14 after 70' in those matches           |
| Iron Curtain    | defence +6 for the rest of the run             | attack −5 for the rest of the run               |
| Talisman Tonic  | your best player becomes a Talisman            | cards +8, fouls +6 for the rest of the run      |
| Physio          | a life back (only offered when one is missing) | every opponent is one tier stronger from now on |

**Determinism:** opponents, packs and signings derive from `(seed, round)`. Results are stored,
never replayed (the season rule), so traits and crafted badges may play without a share flag.

**Measured:** an autopilot that never coaches and picks rewards at random wins a median of 2 per
run, with a best of 10–11 over 120 runs. A coach who uses the team talks and picks rewards on
purpose goes further.

**Motion:** none new. The reveal is a state change until the owner's gallery round picks an
animation.

## TASK-1829 — Card crafting

- **Cost:** spend **3 duplicate album stickers** of one card to mint **one trait badge** on it.
  One badge per card. A keeper can only become a Rock. The sticker always survives, because a
  craft only takes `count` down to 1.
- **Atomic:** spending and minting happen in one IndexedDB transaction (`idbSpendAndPut`). A
  refused craft writes nothing, and two racing crafts produce exactly one badge.
- **Where badges play (Claude's call):** only where results are stored: season runs, the weekly
  ladder and the Mystery Market. A single match, the daily and share links replay from a code that
  another browser must reproduce, and that browser has none of your badges.
- **The coach's side only:** both sides can draft one pool, so a rival fielding the same card
  never inherits your badge.
- **Where it shows:** the Workshop under the album, and the Personalities panel before kick-off.

IndexedDB **v8** adds the `badges` and `market` stores.
