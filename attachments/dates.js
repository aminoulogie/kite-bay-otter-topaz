// ==========================================================================
// Local-time date helpers. Everything is keyed YYYY-MM-DD in LOCAL time so a
// session logged at 11pm never lands on the wrong day via UTC.
// ==========================================================================

function getLocalDateKey(dateObj = new Date()) {
  const y = dateObj.getFullYear();
  const m = String(dateObj.getMonth() + 1).padStart(2, "0");
  const d = String(dateObj.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function parseLocalDateKey(dateKeyStr) {
  if (!dateKeyStr || typeof dateKeyStr !== "string") return new Date();
  const parts = dateKeyStr.split("-").map(Number);
  if (parts.length < 3 || isNaN(parts[0])) return new Date();
  return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function formatDateLong(dateStr) {
  const d = parseLocalDateKey(dateStr);
  return d.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" });
}

function formatTimeShort(ts) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

module.exports = { getLocalDateKey, parseLocalDateKey, addDays, formatDateLong, formatTimeShort };
