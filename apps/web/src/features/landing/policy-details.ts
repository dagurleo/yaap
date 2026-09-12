// Confirm these public details before publishing the legal documents.
// Keep private deployment variables and personal addresses out of this module.
export const policyDetails: {
  operator: string | null;
  contactEmail: string | null;
  legalDraft: boolean;
} = {
  operator: null,
  contactEmail: "hello@yaap.sh",
  legalDraft: true,
};

export const repositoryUrl = "https://github.com/dagurleo/yaap";
export const documentationUrl = `${repositoryUrl}/blob/main/docs/README.md`;
