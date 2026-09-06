import { z } from "zod";
const score = z.number().int().nonnegative();
export const historicalSaveSchema = z.object({
  version: z.literal(1),
  injuries: z
    .array(z.object({ cardId: z.string().min(1), remaining: z.number().int().min(1).max(3) }))
    .max(100)
    .optional(),
  season: z.number().int().min(1992).max(2025),
  clubId: z.number().int().positive(),
  formation: z.string().min(1),
  cardIds: z.array(z.string()).length(11),
  seed: z.number().int().min(0).max(4294967295),
  archiveKey: z.string().regex(/^[a-f0-9]{64}$/),
  results: z
    .array(
      z.object({
        fixtureId: z.string().min(1),
        seed: z.number().int().min(0).max(4294967295),
        homeGoals: score,
        awayGoals: score,
      }),
    )
    .max(462),
});
