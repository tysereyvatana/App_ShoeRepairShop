const env = (import.meta as any).env || {};

export const CURRENCY: string = (env.VITE_CURRENCY as string) || "KHR";
export const MONEY_DECIMALS: number = CURRENCY === "KHR" ? 0 : 2;
export const MONEY_STEP: string = MONEY_DECIMALS === 0 ? "1" : "0.01";
export const MONEY_MIN_POSITIVE: number = MONEY_DECIMALS === 0 ? 1 : 0.01;

/**
 * For UI inputs: keep only digits, and optionally a single decimal point.
 *
 * Examples:
 * - KHR (0 decimals): "12.3" -> "123" (dot removed)
 * - USD (2 decimals): "1,234.567" -> "1234.56" (extra decimals trimmed)
 */
export function sanitizeMoneyInput(raw: string, decimals: number = MONEY_DECIMALS): string {
  const s = (raw ?? "").toString();
  if (!s.trim()) return "";

  const cleaned = s.replace(/,/g, "").replace(/\s+/g, "");
  let out = "";
  let dotUsed = false;

  for (const ch of cleaned) {
    if (ch >= "0" && ch <= "9") {
      out += ch;
      continue;
    }
    if (decimals > 0 && ch === "." && !dotUsed) {
      out += ".";
      dotUsed = true;
    }
  }

  if (!out) return "";

  if (decimals <= 0) {
    // Trim leading zeros but keep one if it's all zeros.
    const t = out.replace(/^0+(?=\d)/, "");
    return t === "" ? "0" : t;
  }

  const [intRaw, fracRaw = ""] = out.split(".");
  const intPart = (intRaw || "0").replace(/^0+(?=\d)/, "");
  const fracPart = fracRaw.slice(0, decimals);
  return dotUsed ? `${intPart || "0"}.${fracPart}` : (intPart || "0");
}

/**
 * Normalize a money input to a canonical string (using rounding rules in toMinor()).
 * If empty and emptyAsZero=false, returns "".
 */
export function normalizeMoneyInput(raw: string, opts?: { decimals?: number; emptyAsZero?: boolean }): string {
  const decimals = opts?.decimals ?? MONEY_DECIMALS;
  const emptyAsZero = opts?.emptyAsZero ?? true;
  const trimmed = (raw ?? "").toString().trim();
  if (!trimmed) return emptyAsZero ? minorToMajorString(0, decimals) : "";
  const sanitized = sanitizeMoneyInput(trimmed, decimals);
  if (!sanitized) return emptyAsZero ? minorToMajorString(0, decimals) : "";
  return minorToMajorString(toMinor(sanitized, decimals), decimals);
}

/**
 * MUI-friendly numeric input props.
 * Use with TextField: inputProps={{ ...moneyTextInputProps(), min: 0 }}
 */
export function moneyTextInputProps(decimals: number = MONEY_DECIMALS): Record<string, any> {
  const pattern = decimals <= 0 ? "[0-9]*" : "[0-9]*[.]?[0-9]*";
  return {
    inputMode: "numeric",
    pattern,
    // Prevent browser numeric-step UI quirks by using text fields.
    // (We still validate and coerce on blur/save.)
  };
}

function pow10(decimals: number) {
  if (decimals <= 0) return 1;
  if (decimals === 1) return 10;
  if (decimals === 2) return 100;
  if (decimals === 3) return 1000;
  return Math.pow(10, decimals);
}

/**
 * Normalize a major-unit number to the current currency decimals.
 * Example (USD): 1.005 -> 1.01
 */
export function normalizeMajor(value: number, decimals: number = MONEY_DECIMALS): number {
  if (!Number.isFinite(value)) return 0;
  const p = pow10(decimals);
  return Math.round(value * p) / p;
}

/**
 * Convert major units (string/number) into integer minor units.
 * - KHR (0 decimals): "5000" -> 5000
 * - USD (2 decimals): "12.34" -> 1234
 *
 * This avoids floating point drift in calculations/comparisons.
 */
export function toMinor(value: unknown, decimals: number = MONEY_DECIMALS): number {
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

    // remove commas/spaces
    const cleaned = raw.replace(/,/g, "").replace(/\s+/g, "");
    const parts = cleaned.split(".");
    const intPartRaw = parts[0] ?? "0";
    const fracPartRaw = parts[1] ?? "";

    const intDigits = intPartRaw.replace(/\D/g, "") || "0";
    const fracDigits = fracPartRaw.replace(/\D/g, "");

    const p = pow10(decimals);

    const intVal = parseInt(intDigits, 10) || 0;
    let fracMinor = 0;
    let carry = 0;

    if (decimals > 0) {
      // Round to `decimals` without floating point math.
      // Example (2dp): 12.345 -> 12.35
      const fracAll = fracDigits.padEnd(decimals + 1, "0");
      const main = fracAll.slice(0, decimals);
      const roundDigit = fracAll.charAt(decimals) || "0";

      fracMinor = parseInt(main || "0", 10) || 0;
      if (roundDigit >= "5") {
        fracMinor += 1;
        if (fracMinor >= p) {
          fracMinor -= p;
          carry = 1;
        }
      }
    }

    const out = (intVal + carry) * p + fracMinor;
    return neg ? -out : out;
  }

  // Fallback for Prisma Decimal-ish objects or other types
  try {
    return toMinor(String(value), decimals);
  } catch {
    return 0;
  }
}

/**
 * Convert integer minor units back to a major-unit string.
 * - 1234 (USD, 2 decimals) -> "12.34"
 * - 5000 (KHR, 0 decimals) -> "5000"
 */
export function minorToMajorString(minor: number, decimals: number = MONEY_DECIMALS): string {
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

export function toMajorNumber(minor: number, decimals: number = MONEY_DECIMALS): number {
  return normalizeMajor(Number(minorToMajorString(minor, decimals)), decimals);
}

export function clampMinorNonNegative(minor: number): number {
  if (!Number.isFinite(minor)) return 0;
  return minor < 0 ? 0 : minor;
}

export function lineTotalMinor(price: unknown, qty: number): number {
  const q = Number.isFinite(qty) ? Math.max(0, Math.trunc(qty)) : 0;
  return toMinor(price) * q;
}

export function sumMinor(values: Array<unknown>): number {
  let s = 0;
  for (const v of values) s += toMinor(v);
  return s;
}
