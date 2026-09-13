import { z } from "zod";
export const sharingSchema = z.object({
  enabled: z.boolean(),
  events: z.boolean(),
  visitors: z.boolean(),
  revenue: z.boolean(),
  conversions: z.boolean(),
});
export type PublicSharing = z.infer<typeof sharingSchema>;
export const privateSharing: PublicSharing = {
  enabled: false,
  events: false,
  visitors: false,
  revenue: false,
  conversions: false,
};
export const publicIdSchema = z.string().uuid();
export const publicReadSchema = z.object({
  publicId: publicIdSchema,
  report: z.enum([
    "overview",
    "events",
    "visitors",
    "journey",
    "revenue",
    "funnels",
    "conversions",
    "live",
  ]),
  filters: z.record(z.string(), z.unknown()).default({}),
});
