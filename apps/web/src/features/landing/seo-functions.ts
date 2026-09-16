import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

// Read only the public origin, never serialize environment bindings to the client.
export const publicOriginFn = createServerFn({ method: "GET" }).handler(
  ({ context }) =>
    new URL(context.env.BETTER_AUTH_URL || getRequest().url).origin,
);
