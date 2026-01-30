export const DB_MONEY_SCALE = 2;

function pow10(decimals: number) {
  if (decimals <= 0) return 1;
  if (decimals === 1) return 10;
  if (decimals === 2) return 100;
  if (decimals === 3) return 1000;
  return Math.pow(10, decimals);
}

/**
 * Convert a Prisma Decimal / number / string into integer minor units.
 * Uses DB_MONEY_SCALE (2) by default to match Decimal(12,2) fields.
 */
export function toMinor(value: unknown, decimals: number = DB_MONEY_SCALE): number {
  if (value === null || value === undefined) return 0;

  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0;
    const p = pow10(decimals);
    return Math.round(value * p);
  }

  if (typeof value === "string") {
    const s = value.trim();
    if (!s) return 0;

    const neg = s.startsWith("-");
    const raw = neg ? s.slice(1) : s;

    const cleaned = raw.replace(/,/g, "").replace(/\s+/g, "");
    const parts = cleaned.split(".");
    const intPartRaw = parts[0] ?? "0";
    const fracPartRaw = parts[1] ?? "";

    const intDigits = intPartRaw.replace(/\D/g, "") || "0";
    const fracDigits = fracPartRaw.replace(/\D/g, "");

    const p = pow10(decimals);
    const intMinor = parseInt(intDigits, 10) * p;

    let fracMinor = 0;
    if (decimals > 0) {
      const frac = fracDigits.padEnd(decimals, "0").slice(0, decimals);
      fracMinor = parseInt(frac || "0", 10);
    }

    const out = intMinor + fracMinor;
    return neg ? -out : out;
  }

  // Prisma Decimal (or similar) objects usually have toString()
  try {
    return toMinor(String(value), decimals);
  } catch {
    return 0;
  }
}

/**
 * Convert integer minor units into a decimal string with fixed scale.
 * Example: 1234 -> "12.34" (scale=2)
 */
export function minorToDecimalString(minor: number, decimals: number = DB_MONEY_SCALE): string {
  const m = Number.isFinite(minor) ? Math.trunc(minor) : 0;
  const neg = m < 0;
  const abs = Math.abs(m);

  const p = pow10(decimals);
  const intPart = Math.floor(abs / p);
  const fracPart = abs % p;

  if (decimals <= 0) return neg ? `-${intPart}` : `${intPart}`;
  const fracStr = fracPart.toString().padStart(decimals, "0");
  const out = `${intPart}.${fracStr}`;
  return neg ? `-${out}` : out;
}

export function clampMinorNonNegative(minor: number): number {
  if (!Number.isFinite(minor)) return 0;
  return minor < 0 ? 0 : minor;
}
