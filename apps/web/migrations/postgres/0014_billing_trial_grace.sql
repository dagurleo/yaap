UPDATE "billing_accounts" AS a
SET "lifecycle_policy_version" = 2
WHERE "trial_starts_at" IS NOT NULL
  AND "lifecycle_policy_version" < 2
  AND NOT EXISTS (
    SELECT 1 FROM "billing_subscriptions" AS s
    WHERE s."workspace_id" = a."workspace_id"
      AND s."environment" = a."environment"
  );

UPDATE "billing_usage_periods" AS p
SET "ends_at" = a."trial_ends_at" + 259200000,
    "admission_ceiling" = 110000,
    "plan_version" = 2
FROM "billing_accounts" AS a
WHERE p."source" = 'trial'
  AND a."workspace_id" = p."workspace_id"
  AND a."trial_ends_at" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "billing_subscriptions" AS s
    WHERE s."workspace_id" = p."workspace_id"
  );
