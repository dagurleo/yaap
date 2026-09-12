export function deploymentHyperdriveId(value) {
  const id = value?.trim();
  if (!id) return undefined;
  if (!/^[a-f0-9]{32}$/i.test(id))
    throw new Error(
      "YAAP_HYPERDRIVE_ID must be a 32-character hexadecimal Hyperdrive ID.",
    );
  return id;
}

export function deploymentPlacementRegion(value) {
  const region = value?.trim();
  if (!region) return undefined;
  if (!/^(aws|gcp|azure):[a-z0-9]+(?:-[a-z0-9]+)*$/.test(region))
    throw new Error(
      "YAAP_PLACEMENT_REGION must use a cloud region such as aws:us-east-2, gcp:us-east4, or azure:eastus.",
    );
  return region;
}

export function configureDeploymentPlacement(config, value) {
  const region = deploymentPlacementRegion(value);
  // Placement hints are mutually exclusive; replace any existing strategy.
  if (region) config.placement = { region };
}

// Mutate in place: the Vite plugin concatenates arrays returned as overrides.
export function configureDeploymentDatabase(config, value) {
  const id = deploymentHyperdriveId(value);
  if (!id) return;
  config.vars = { ...config.vars, DATABASE_PROVIDER: "postgres" };
  config.d1_databases = (config.d1_databases ?? []).filter(
    (binding) => binding.binding !== "DB",
  );
  config.hyperdrive = [
    ...(config.hyperdrive ?? []).filter(
      (binding) => binding.binding !== "HYPERDRIVE",
    ),
    { binding: "HYPERDRIVE", id },
  ];
}
