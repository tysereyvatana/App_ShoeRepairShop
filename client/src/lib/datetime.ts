export function datetimeLocalToISO(value: string): string {
  // value comes from <input type="datetime-local">, format: YYYY-MM-DDTHH:mm
  const [datePart, timePart] = value.split("T");
  if (!datePart || !timePart) throw new Error("Invalid datetime-local value");

  const [y, m, d] = datePart.split("-").map((x) => Number(x));
  const [hh, mm] = timePart.split(":").map((x) => Number(x));

  // Construct as LOCAL time (this matches what the user picked in the UI)
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0, 0, 0);
  return dt.toISOString();
}

export function isoToDatetimeLocal(iso: string): string {
  const dt = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");

  const y = dt.getFullYear();
  const m = pad(dt.getMonth() + 1);
  const d = pad(dt.getDate());
  const hh = pad(dt.getHours());
  const mm = pad(dt.getMinutes());

  return `${y}-${m}-${d}T${hh}:${mm}`;
}
