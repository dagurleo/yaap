import type { Unstable_Config } from "wrangler";

export function deploymentHyperdriveId(value?: string): string | undefined;
export function configureDeploymentDatabase(
  config: Pick<Unstable_Config, "vars" | "d1_databases" | "hyperdrive">,
  value?: string,
): void;
