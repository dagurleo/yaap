# Publish @yaap/client

The browser tracker is published independently of the Cloudflare application as `@yaap/client`. The first version is `0.1.0`; the npm organization is `yaap`. It includes the ESM client, TypeScript declarations, standalone browser script, README, and license, with no runtime dependencies.

## Prepare and verify

From the repository root:

```sh
npm ci
npm run check:client
npm pack --workspace @yaap/client --pack-destination .
npm publish ./yaap-client-0.1.0.tgz --access public --dry-run
```

The checks build both entry points, test browser behavior, install a tarball in an isolated project, verify server-side imports, and compile a TypeScript consumer. Review the tarball's file list from `npm pack`; only the client build, package metadata, README, and license should ship. Confirm `DEFAULT_HOST` in `packages/client/src/index.ts` uses the intended public service URL. Self-hosters can override it with `host`.

If adopting a custom domain for the first release, connect it to the Worker and verify it before publishing. Update the default URL, its type documentation, the endpoint test, and the tracking guides, then rerun the checks and repack. Domain changes after publication require a new package version; older installed clients continue using their original default.

Commit and push the release source after checks pass. Publish the reviewed tarball so the uploaded files match the artifact you inspected. Tarballs and generated build files are gitignored.

## First publish

Use an npm account with publish access to the `yaap` organization. Sign in interactively and complete npm's authentication prompts:

```sh
npm login --registry=https://registry.npmjs.org
npm whoami --registry=https://registry.npmjs.org
npm publish ./yaap-client-0.1.0.tgz --access public --registry=https://registry.npmjs.org
```

The last command publishes publicly. Complete the 2FA prompt when npm requests it; do not commit credentials or put tokens into the package. See npm's [scoped public package guide](https://docs.npmjs.com/creating-and-publishing-scoped-public-packages/).

Verify the published version and artifact integrity:

```sh
npm view @yaap/client@0.1.0 version dist.integrity --registry=https://registry.npmjs.org
```

Compare `dist.integrity` with the integrity value reported by the reviewed `npm pack` output. Install `@yaap/client@0.1.0` in a separate application, register that application's exact origin in Yaap, and confirm a real browser pageview reaches its dashboard.

## Later releases

Update the version in `packages/client/package.json` and its workspace dependency in `apps/web/package.json`, then refresh the root lockfile with `npm install`. Run the same checks, pack the new version, and publish its tarball. Published name/version pairs cannot be reused; use a new version for fixes.

Once the package exists, you can configure [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) for a dedicated GitHub Actions release workflow in `dagurleo/yaap`. This uses short-lived OIDC credentials instead of a stored npm token. Keep package releases separate from ordinary pushes and Cloudflare deployments.
