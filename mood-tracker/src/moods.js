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

export function withAlpha(hex, alpha01) {
  const a = Math.round(Math.max(0, Math.min(1, alpha01)) * 255)
    .toString(16)
    .padStart(2, "0");
  return `${hex}${a}`; // #RRGGBBAA
}
