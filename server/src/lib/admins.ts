// Admin access lives outside the database: `ADMIN_EMAILS` is a comma-separated
// allowlist read on every call (not cached), so a restart with new config takes
// effect immediately and tests can vary it per process. An unset or empty value
// means nobody is an admin, which fails closed.

/** Normalises the raw allowlist into comparable, lowercase addresses. */
export function parseAdminEmails(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return [
    ...new Set(
      raw
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter((email) => email.length > 0),
    ),
  ];
}

/** True when the address is on the configured admin allowlist. */
export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) {
    return false;
  }

  return parseAdminEmails(process.env.ADMIN_EMAILS).includes(
    email.trim().toLowerCase(),
  );
}
