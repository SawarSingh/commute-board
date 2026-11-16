const TZ = "Asia/Kolkata";

export function clockTime(iso: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

export function durationLabel(seconds: number): string {
  const total = Math.round(seconds / 60);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)}h ${total % 60}m`;
}

export function deltaLabel(seconds: number): string {
  const minutes = Math.round(seconds / 60);
  return `${minutes > 0 ? "+" : ""}${minutes} min`;
}

export function distanceLabel(meters: number): string {
  return `${(meters / 1000).toFixed(1)} km`;
}

export function dayLabel(dateKey: string): string {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][
    new Date(`${dateKey}T00:00:00Z`).getUTCDay()
  ];
}

export function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

export function nowHHMM(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date());
  return parts;
}
