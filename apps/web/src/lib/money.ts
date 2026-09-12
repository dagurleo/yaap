// Amounts use Stripe charge units, including ISK/UGX compatibility and MGA's zero-decimal unit.
export function money(amount: number, currency: string) {
  const format = new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "code",
  });
  const digits =
    currency === "ISK" || currency === "UGX"
      ? 2
      : currency === "MGA"
        ? 0
        : (format.resolvedOptions().maximumFractionDigits ?? 2);
  return format.format(amount / 10 ** digits);
}
