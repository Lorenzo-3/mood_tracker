// src/moods.js
export const MOODS = [
  { value: 1, label: "Terrible", color: "#ff0000"},
  { value: 2, label: "Very bad", color: "#cf5252ff" },
  { value: 3, label: "Bad",      color: "#e3854eff" },
  { value: 4, label: "OK",       color: "#D9B44A" },
  { value: 5, label: "Good",     color: "#4BAA6A" },
  { value: 6, label: "Great",    color: "#2F8F83" },
  { value: 7, label: "Amazing",  color: "#00ffff"}
];

export function moodColor(mood) {
  return MOODS.find(m => m.value === mood)?.color ?? "#888888";
}

// src/moods.js
export function withAlpha(hex, alpha01) {
  const a = Math.max(0, Math.min(1, alpha01));
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h.slice(0, 6);

  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);

  return `rgba(${r},${g},${b},${a})`;
}

