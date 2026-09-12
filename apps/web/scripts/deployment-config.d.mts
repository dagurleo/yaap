import type { Unstable_Config } from "wrangler";

export function deploymentHyperdriveId(value?: string): string | undefined;
export function deploymentPlacementRegion(value?: string): string | undefined;
export function configureDeploymentPlacement(
  config: Pick<Unstable_Config, "placement">,
  value?: string,
): void;
export function configureDeploymentDatabase(
  config: Pick<Unstable_Config, "vars" | "d1_databases" | "hyperdrive">,
  value?: string,
): void;
