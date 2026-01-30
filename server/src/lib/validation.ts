import { z } from "zod";

export const paginationSchema = z.object({
  q: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  // Some screens (dropdowns / pickers) load a larger set for fast searching.
  // Keeping this reasonably bounded prevents abuse while avoiding 500s.
  pageSize: z.coerce.number().int().min(1).max(2000).default(50),
});

export const moneyIntSchema = z.coerce.number().int().min(0);
export const moneyPosIntSchema = z.coerce.number().int().min(1);

export function toSkipTake(page: number, pageSize: number) {
  const skip = (page - 1) * pageSize;
  const take = pageSize;
  return { skip, take };
}
