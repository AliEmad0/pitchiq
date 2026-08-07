// Fix a player's CARD image here without touching the dataset. Map a numeric
// player id to either an FPL numeric photo code (transparent cutout) OR an
// absolute image URL (any host). This wins over the dataset photo on the card;
// rebuild / redeploy to see it. The cutout-vs-background treatment is still
// auto-detected from the actual image, so a fixed image "just works".
//
// Example:
//   export const CARD_PHOTO_OVERRIDES: Record<number, string> = {
//     1815: "https://your-cdn.example.com/david-may.png", // David May
//     14937: "223094",                                     // swap to another FPL code
//   };

export const CARD_PHOTO_OVERRIDES: Record<number, string> = {};
