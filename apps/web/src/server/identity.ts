import { createHmac } from "node:crypto";
export const visitorUuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
export function hashIdentity(
  secret: string,
  siteId: string,
  kind: string,
  id: string,
) {
  return createHmac("sha256", secret)
    .update(`${siteId}\0${kind}\0${id.toLowerCase()}`)
    .digest("hex");
}
