UPDATE `billing_accounts`
SET `lifecycle_policy_version` = 2
WHERE `trial_starts_at` IS NOT NULL
  AND `lifecycle_policy_version` < 2
  AND NOT EXISTS (
    SELECT 1 FROM `billing_subscriptions`
    WHERE `billing_subscriptions`.`workspace_id` = `billing_accounts`.`workspace_id`
      AND `billing_subscriptions`.`environment` = `billing_accounts`.`environment`
  );
--> statement-breakpoint
UPDATE `billing_usage_periods`
SET `ends_at` = (
      SELECT `trial_ends_at` + 259200000
      FROM `billing_accounts`
      WHERE `billing_accounts`.`workspace_id` = `billing_usage_periods`.`workspace_id`
    ),
    `admission_ceiling` = 110000,
    `plan_version` = 2
WHERE `source` = 'trial'
  AND EXISTS (
    SELECT 1 FROM `billing_accounts`
    WHERE `billing_accounts`.`workspace_id` = `billing_usage_periods`.`workspace_id`
      AND `billing_accounts`.`trial_ends_at` IS NOT NULL
  )
  AND NOT EXISTS (
    SELECT 1 FROM `billing_subscriptions`
    WHERE `billing_subscriptions`.`workspace_id` = `billing_usage_periods`.`workspace_id`
  );
