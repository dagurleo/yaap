import { HttpError } from "../../http";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireUser } from "../../server/services";
import {
  sharingSettings,
  saveSharing,
  publicSiteInfo,
  readPublicReport,
  demoPublicId,
} from "../../server/public-sharing";
import {
  sharingSchema,
  publicIdSchema,
  publicReadSchema,
} from "../../lib/public-sharing";
import { limitRequest } from "../../rate-limit";
const siteInput = z.object({ siteId: z.string().min(1).max(128) });
export const publicSharingFn = createServerFn({ method: "GET" })
  .validator(siteInput)
  .handler(async ({ data, context }) =>
    sharingSettings(
      context.env,
      await requireUser(getRequest(), context.env),
      data.siteId,
    ),
  );
export const savePublicSharingFn = createServerFn({ method: "POST" })
  .validator(siteInput.extend({ settings: sharingSchema }))
  .handler(async ({ data, context }) =>
    saveSharing(
      context.env,
      await requireUser(getRequest(), context.env),
      data.siteId,
      data.settings,
    ),
  );
export const publicSiteFn = createServerFn({ method: "GET" })
  .validator(z.object({ publicId: publicIdSchema }))
  .handler(({ data, context }) => publicSiteInfo(context.env, data.publicId));
export const publicReportFn = createServerFn({ method: "GET" })
  .validator(publicReadSchema)
  .handler(async ({ data, context }) => {
    await limitRequest(getRequest(), context.env, "public-reports", 180);
    return readPublicReport(context.env, data);
  });
export const demoFn = createServerFn({ method: "GET" }).handler(({ context }) =>
  demoPublicId(context.env),
);

export const demoAvailableFn = createServerFn({ method: "GET" }).handler(
  async ({ context }) => {
    if (!context.env.YAAP_DEMO_SITE_ID) return false;
    try {
      await demoPublicId(context.env);
      return true;
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) return false;
      throw error;
    }
  },
);
