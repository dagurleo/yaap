import { createHash } from "node:crypto";
import { sql } from "drizzle-orm";
import { createDb } from "../db";
import {
  decodePathParam,
  json,
  mediaType,
  readBody,
  readJson,
  HttpError,
} from "../http";
import { appOrigin, requireOwner } from "../server/services";
import { limitRequest } from "../rate-limit";
import type { Env } from "../types";
import {
  authenticate,
  grants,
  type Credential,
  credentialColumns,
} from "./auth";
import {
  ApiError,
  crypt,
  fields,
  hash,
  invalid,
  scopes,
  secret,
  str,
  type Input,
} from "./contracts";
import { guard } from "./mutations";
import { insert } from "./management";

const esc = (v: unknown) =>
  String(v)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
type Client = {
  id: string;
  name: string;
  ownerId: string;
  redirectUris: string;
};
async function form(request: Request): Promise<Input> {
  if (mediaType(request) !== "application/x-www-form-urlencoded")
    throw new ApiError(
      415,
      "invalid_request",
      "Send application/x-www-form-urlencoded",
    );
  const bytes = await readBody(request, 16384);
  const input: Input = {};
  for (const [key, value] of new URLSearchParams(
    new TextDecoder().decode(bytes),
  )) {
    if (key in input) {
      if (key === "siteId")
        input[key] = [
          ...(Array.isArray(input[key]) ? input[key] : [input[key]]),
          value,
        ];
      else invalid("Duplicate form parameter");
    } else input[key] = value;
  }
  return input;
}
function html(body: string, redirectOrigin: string) {
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Connect to YAAP</title><style>html{color-scheme:light dark;font:16px system-ui;background:Canvas;color:CanvasText}main{max-width:640px;margin:8vh auto;padding:24px}h1{font-size:28px}fieldset{border:1px solid GrayText;border-radius:8px;padding:16px;margin:24px 0}label{display:block;margin:12px 0}button{font:inherit;padding:10px 18px;cursor:pointer}code{overflow-wrap:anywhere}p{line-height:1.6}a{color:LinkText}</style></head><body><main>${body}</main></body></html>`,
    {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${redirectOrigin}; frame-ancestors 'none'; base-uri 'none'`,
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
async function routeOAuth(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const url = new URL(request.url),
    origin = appOrigin(request, env),
    path = url.pathname,
    db = createDb(env),
    resource = origin + "/mcp";
  if (!path.startsWith("/oauth/") && !path.startsWith("/.well-known/oauth-"))
    return null;
  try {
    if (
      request.method === "GET" &&
      [
        "/.well-known/oauth-protected-resource/mcp",
        "/.well-known/oauth-protected-resource",
      ].includes(path)
    )
      return json({
        resource,
        authorization_servers: [origin],
        scopes_supported: scopes,
        bearer_methods_supported: ["header"],
      });
    if (
      request.method === "GET" &&
      path === "/.well-known/oauth-authorization-server"
    )
      return json({
        issuer: origin,
        authorization_endpoint: origin + "/oauth/authorize",
        token_endpoint: origin + "/oauth/token",
        revocation_endpoint: origin + "/oauth/revoke",
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code", "refresh_token"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: [...scopes, "offline_access"],
        authorization_response_iss_parameter_supported: true,
      });
    if (path === "/oauth/clients" || path.startsWith("/oauth/clients/")) {
      const p = await authenticate(request, env, true);
      if (p.kind !== "session")
        throw new ApiError(403, "access_denied", "Owner session required");
      if (path === "/oauth/clients" && request.method === "GET") {
        const rows = await db.all<Client>(
          sql`select id,name,redirect_uris as "redirectUris" from oauth_clients where owner_id=${p.ownerId} order by created_at,id limit 100`,
        );
        return json({
          data: rows.map((row) => ({
            ...row,
            redirectUris: JSON.parse(row.redirectUris),
          })),
        });
      }
      if (path === "/oauth/clients" && request.method === "POST") {
        const input = await readJson(request, 16384);
        fields(input, ["name", "redirectUris"]);
        const name = str(input, "name", 120);
        if (
          !Array.isArray(input.redirectUris) ||
          !input.redirectUris.length ||
          input.redirectUris.length > 10
        )
          invalid("Supply 1–10 redirect URIs");
        const uris = input.redirectUris.map((v) => {
          if (typeof v !== "string" || v.length > 2048)
            invalid("Invalid redirect URI");
          let u: URL;
          try {
            u = new URL(v);
          } catch {
            invalid("Invalid redirect URI");
          }
          if (
            u.username ||
            u.password ||
            u.hash ||
            !(
              u.protocol === "https:" ||
              (u.protocol === "http:" &&
                ["127.0.0.1", "[::1]", "localhost"].includes(u.hostname))
            )
          )
            invalid(
              "Use HTTPS or a loopback HTTP redirect URI without credentials or fragment",
            );
          return v;
        });
        const [count] = await db.all<{ n: number }>(
          sql`select count(*) as n from oauth_clients where owner_id=${p.ownerId}`,
        );
        if (count.n >= 100) invalid("Maximum 100 registered clients");
        const id = crypto.randomUUID();
        await db.atomic([
          insert("oauth_clients", {
            id,
            owner_id: p.ownerId,
            name,
            redirect_uris: JSON.stringify(uris),
            created_at: Date.now(),
          }),
          audit(p.ownerId, p.id, "register_oauth_client", id),
        ]);
        return json(
          {
            data: {
              client_id: id,
              client_name: name,
              redirect_uris: uris,
              token_endpoint_auth_method: "none",
            },
          },
          201,
        );
      }
      if (request.method === "DELETE" && path.startsWith("/oauth/clients/")) {
        const id = decodePathParam(path.slice("/oauth/clients/".length));
        await db.atomic([
          sql`delete from oauth_clients where id=${id} and owner_id=${p.ownerId}`,
          sql`update api_credentials set revoked_at=${Date.now()} where client_id=${id} and owner_id=${p.ownerId}`,
          sql`delete from oauth_codes where client_id=${id} and owner_id=${p.ownerId}`,
          audit(p.ownerId, p.id, "revoke_oauth_client", id),
        ]);
        return json({ data: { revoked: true } });
      }
    }
    if (path === "/oauth/authorize" && request.method === "GET") {
      const input: Input = {};
      for (const [k, v] of url.searchParams) {
        if (k in input) invalid("Duplicate authorization parameter");
        input[k] = v;
      }
      fields(input, [
        "client_id",
        "redirect_uri",
        "response_type",
        "scope",
        "state",
        "code_challenge",
        "code_challenge_method",
        "resource",
      ]);
      const clientId = str(input, "client_id"),
        redirectUri = str(input, "redirect_uri", 2048);
      const [client] = await db.all<Client>(
        sql`select id,name,owner_id as "ownerId",redirect_uris as "redirectUris" from oauth_clients where id=${clientId}`,
      );
      if (!client || !JSON.parse(client.redirectUris).includes(redirectUri))
        invalid("Unregistered client or redirect URI");
      if (
        input.response_type !== "code" ||
        input.code_challenge_method !== "S256" ||
        !/^[-_A-Za-z0-9]{43}$/.test(str(input, "code_challenge", 43))
      )
        invalid("Authorization code with S256 PKCE is required");
      if (input.resource !== resource)
        throw new ApiError(
          400,
          "invalid_target",
          "Request this installation's /mcp resource",
        );
      if (input.state !== undefined) str(input, "state", 1024);
      const requested = [...new Set(str(input, "scope", 1024).split(" "))];
      if (
        requested.some(
          (s) => s !== "offline_access" && !scopes.includes(s as never),
        ) ||
        !requested.some((s) => s !== "offline_access")
      )
        throw new ApiError(
          400,
          "invalid_scope",
          "Choose supported YAAP scopes",
        );
      let ownerId: string;
      try {
        ownerId = await requireOwner(request, env);
      } catch (error) {
        if (error instanceof HttpError && error.status === 401)
          return Response.redirect(
            origin +
              "/login?returnTo=" +
              encodeURIComponent(url.pathname + url.search),
            302,
          );
        throw error;
      }
      if (ownerId !== client.ownerId)
        throw new ApiError(
          403,
          "access_denied",
          "Client is not owned by this account",
        );
      const pending = await crypt(
        env,
        "oauth-consent",
        JSON.stringify({ ...input, ownerId, expiresAt: Date.now() + 600000 }),
      );
      const sites = await db.listSites(ownerId);
      return html(
        `<h1>Connect ${esc(client.name)} to YAAP</h1><p>This application is requesting the permissions below. Choose the websites it can access.</p><p>Redirect: <code>${esc(redirectUri)}</code></p><ul>${requested.map((s) => `<li>${esc(s)}</li>`).join("")}</ul><form method="post" action="/oauth/authorize"><input type="hidden" name="request" value="${esc(pending)}"><fieldset><legend>Websites</legend>${sites.map((s) => `<label><input type="checkbox" name="siteId" value="${esc(s.id)}"> ${esc(s.name)} (${esc(s.origin)})</label>`).join("")}<label><input type="checkbox" name="allSites" value="true"> All current and future websites</label></fieldset><button type="submit" name="decision" value="allow">Allow access</button> <button type="submit" name="decision" value="deny">Cancel</button></form>`,
        new URL(redirectUri).origin,
      );
    }
    if (path === "/oauth/authorize" && request.method === "POST") {
      const p = await authenticate(request, env, true);
      if (p.kind !== "session")
        throw new ApiError(403, "access_denied", "Owner session required");
      const body = await form(request);
      fields(body, ["request", "siteId", "allSites", "decision"]);
      let pending: Input;
      try {
        pending = JSON.parse(
          await crypt(env, "oauth-consent", str(body, "request", 12000), true),
        );
      } catch {
        invalid("Invalid consent request");
      }
      if (
        pending.ownerId !== p.ownerId ||
        Number(pending.expiresAt) < Date.now()
      )
        invalid("Consent request expired");
      const [client] = await db.all<Client>(
        sql`select id,redirect_uris as "redirectUris" from oauth_clients where id=${pending.client_id} and owner_id=${p.ownerId}`,
      );
      if (
        !client ||
        !JSON.parse(client.redirectUris).includes(pending.redirect_uri)
      )
        invalid("Client registration changed");
      const redirect = new URL(String(pending.redirect_uri));
      redirect.searchParams.set("iss", origin);
      if (pending.state)
        redirect.searchParams.set("state", String(pending.state));
      if (body.decision === "deny") {
        redirect.searchParams.set("error", "access_denied");
        return Response.redirect(redirect.toString(), 303);
      }
      if (body.decision !== "allow") invalid("Choose allow or deny");
      const selectedScopes = String(pending.scope).split(" "),
        allSites = body.allSites === "true";
      const access = await grants(env, p.ownerId, {
        scopes: selectedScopes.filter((s) => s !== "offline_access"),
        allSites,
        siteIds: allSites
          ? []
          : body.siteId === undefined
            ? []
            : Array.isArray(body.siteId)
              ? body.siteId
              : [body.siteId],
      });
      const code = secret("yaap_code_");
      await db.atomic([
        insert("oauth_codes", {
          hash: hash(code),
          owner_id: p.ownerId,
          client_id: pending.client_id,
          redirect_uri: pending.redirect_uri,
          challenge: pending.code_challenge,
          scopes: JSON.stringify(selectedScopes),
          site_ids: JSON.stringify(access.siteIds),
          all_sites: Number(access.allSites),
          resource,
          expires_at: Date.now() + 60000,
        }),
        audit(
          p.ownerId,
          p.id,
          "authorize_oauth_client",
          String(pending.client_id),
        ),
      ]);
      redirect.searchParams.set("code", code);
      return Response.redirect(redirect.toString(), 303);
    }
    if (
      (path === "/oauth/token" || path === "/oauth/revoke") &&
      request.method === "POST"
    ) {
      await limitRequest(request, env, "oauth", 60);
      const body = await form(request),
        now = Date.now();
      if (path === "/oauth/revoke") {
        fields(body, ["token", "token_type_hint", "client_id"]);
        const token = hash(str(body, "token", 256)),
          clientId = str(body, "client_id");
        await db.run(
          sql`update api_credentials set revoked_at=${now} where kind='oauth' and client_id=${clientId} and (token_hash=${token} or refresh_hash=${token})`,
        );
        return json({});
      }
      fields(body, [
        "grant_type",
        "code",
        "code_verifier",
        "redirect_uri",
        "client_id",
        "resource",
        "refresh_token",
        "scope",
      ]);
      const clientId = str(body, "client_id");
      const [client] = await db.all<Client>(
        sql`select id,name from oauth_clients where id=${clientId}`,
      );
      if (!client)
        throw new ApiError(400, "invalid_client", "Unregistered client");
      if (body.resource !== resource)
        throw new ApiError(
          400,
          "invalid_target",
          "Token resource must match this installation's /mcp endpoint",
        );
      const accessToken = secret("yaap_access_"),
        refreshToken = secret("yaap_refresh_"),
        guardId = crypto.randomUUID();
      if (body.grant_type === "authorization_code") {
        const codeHash = hash(str(body, "code", 256)),
          verifier = str(body, "code_verifier", 128);
        if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier))
          throw new ApiError(400, "invalid_grant", "Invalid code verifier");
        const [code] = await db.all<{
          ownerId: string;
          scopes: string;
          siteIds: string;
          allSites: number;
          challenge: string;
        }>(
          sql`select owner_id as "ownerId",scopes,site_ids as "siteIds",all_sites as "allSites",challenge from oauth_codes where hash=${codeHash} and client_id=${clientId} and redirect_uri=${str(body, "redirect_uri", 2048)} and resource=${resource} and expires_at>${now} and used_by is null`,
        );
        if (
          !code ||
          createHash("sha256").update(verifier).digest("base64url") !==
            code.challenge
        )
          throw new ApiError(
            400,
            "invalid_grant",
            "Invalid, expired, or consumed authorization code",
          );
        const requested = JSON.parse(code.scopes) as string[],
          refresh = requested.includes("offline_access"),
          id = crypto.randomUUID();
        try {
          await db.atomic([
            sql`update oauth_codes set used_by=${id} where hash=${codeHash} and used_by is null and expires_at>${now}`,
            guard(
              guardId,
              sql`exists(select 1 from oauth_codes where hash=${codeHash} and used_by=${id})`,
            ),
            insert("api_credentials", {
              id,
              owner_id: code.ownerId,
              name: client.name,
              token_hash: hash(accessToken),
              hint: accessToken.slice(-8),
              scopes: JSON.stringify(
                requested.filter((s) => s !== "offline_access"),
              ),
              site_ids: code.siteIds,
              all_sites: code.allSites,
              created_at: now,
              expires_at: now + 3600000,
              kind: "oauth",
              client_id: clientId,
              audience: resource,
              refresh_hash: refresh ? hash(refreshToken) : null,
              refresh_expires_at: refresh ? now + 30 * 86400000 : null,
            }),
            sql`delete from api_write_guards where id=${guardId}`,
          ]);
        } catch {
          throw new ApiError(
            400,
            "invalid_grant",
            "Authorization code is no longer usable",
          );
        }
        return json({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: 3600,
          scope: requested.join(" "),
          ...(refresh ? { refresh_token: refreshToken } : {}),
        });
      }
      if (body.grant_type === "refresh_token") {
        const previous = hash(str(body, "refresh_token", 256));
        const revokeReusedRefresh = async () => {
          const rows = await db.all<{ id: string }>(
            sql`update api_credentials set revoked_at=${now} where client_id=${clientId}
              and id in (select credential_id from oauth_refresh_used where hash=${previous}) returning id`,
          );
          return rows.length > 0;
        };
        if (await revokeReusedRefresh()) {
          throw new ApiError(
            400,
            "invalid_grant",
            "Refresh token was already used; reconnect the application",
          );
        }
        const [row] = await db.all<Credential>(
          sql`select ${credentialColumns} from api_credentials where refresh_hash=${previous} and client_id=${clientId} and audience=${resource} and revoked_at is null and refresh_expires_at>${now}`,
        );
        if (!row) {
          // Another request can rotate between the replay check and this read.
          await revokeReusedRefresh();
          throw new ApiError(
            400,
            "invalid_grant",
            "Invalid or expired refresh token",
          );
        }
        const granted = JSON.parse(row.scopes) as string[],
          requested =
            body.scope === undefined
              ? granted
              : str(body, "scope", 1024)
                  .split(" ")
                  .filter((s) => s !== "offline_access");
        if (!requested.length || requested.some((s) => !granted.includes(s)))
          throw new ApiError(
            400,
            "invalid_scope",
            "Refresh cannot increase scopes",
          );
        const newHash = hash(accessToken);
        try {
          await db.atomic([
            sql`update api_credentials set token_hash=${newHash},hint=${accessToken.slice(-8)},refresh_hash=${hash(refreshToken)},scopes=${JSON.stringify(requested)},expires_at=${Math.min(now + 3600000, row.refreshExpiresAt!)} where id=${row.id} and refresh_hash=${previous} and revoked_at is null`,
            guard(
              guardId,
              sql`exists(select 1 from api_credentials where id=${row.id} and token_hash=${newHash} and revoked_at is null)`,
            ),
            insert("oauth_refresh_used", {
              hash: previous,
              credential_id: row.id,
              expires_at: row.refreshExpiresAt,
            }),
            sql`delete from api_write_guards where id=${guardId}`,
          ]);
        } catch {
          // A concurrent rotation can win after our read. Reuse still revokes
          // the grant, just as it does when detected at the start of a request.
          await revokeReusedRefresh();
          throw new ApiError(
            400,
            "invalid_grant",
            "Refresh token is no longer usable",
          );
        }
        return json({
          access_token: accessToken,
          token_type: "Bearer",
          expires_in: Math.floor(
            (Math.min(now + 3600000, row.refreshExpiresAt!) - now) / 1000,
          ),
          refresh_token: refreshToken,
          scope: [...requested, "offline_access"].join(" "),
        });
      }
      throw new ApiError(
        400,
        "unsupported_grant_type",
        "Use authorization_code or refresh_token",
      );
    }
    return json(
      {
        error: "invalid_request",
        error_description: "Unknown OAuth endpoint or method",
      },
      404,
    );
  } catch (error) {
    return json(
      {
        error:
          error instanceof ApiError
            ? error.code
            : error instanceof HttpError && error.status === 401
              ? "login_required"
              : "invalid_request",
        error_description:
          error instanceof HttpError
            ? error.message
            : "Authorization request could not complete",
      },
      error instanceof HttpError ? error.status : 400,
    );
  }
}
function audit(owner: string, actor: string, operation: string, id: string) {
  return insert("api_audit", {
    id: crypto.randomUUID(),
    owner_id: owner,
    actor_id: actor,
    operation,
    resource_id: id,
    fields: "[]",
    created_at: Date.now(),
  });
}

/** Authorization URLs and redirects may contain credentials or client state. */
export async function oauth(
  request: Request,
  env: Env,
): Promise<Response | null> {
  const response = await routeOAuth(request, env);
  if (!response) return null;
  const safe = new Response(response.body, response);
  safe.headers.set("Referrer-Policy", "no-referrer");
  return safe;
}
