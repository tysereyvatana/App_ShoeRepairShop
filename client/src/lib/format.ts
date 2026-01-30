const env = (import.meta as any).env || {};

const CURRENCY: string = (env.VITE_CURRENCY as string) || "KHR";
const CURRENCY_SYMBOL: string =
  (env.VITE_CURRENCY_SYMBOL as string) || (CURRENCY === "KHR" ? "KHR " : "$");
const MONEY_DECIMALS: number = CURRENCY === "KHR" ? 0 : 2;

function formatNumber(n: number) {
  const rounded = MONEY_DECIMALS === 0 ? Math.round(n) : n;
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: MONEY_DECIMALS,
    maximumFractionDigits: MONEY_DECIMALS,
  }).format(rounded);
}

export function fmtMoney(v: string | number | null | undefined) {
  const n = typeof v === "string" ? Number(v) : v ?? 0;
  if (!Number.isFinite(n)) return `${CURRENCY_SYMBOL}0`;
  if (n < 0) return `-${CURRENCY_SYMBOL}${formatNumber(Math.abs(n))}`;
  return `${CURRENCY_SYMBOL}${formatNumber(n)}`;
}

export function fmtDate(iso: string | Date | null | undefined) {
  if (!iso) return "";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString();
}
