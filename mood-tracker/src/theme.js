// src/theme.js
import { useColorScheme } from "react-native";

export const THEMES = {
  light: {
    mode: "light",
    bg: "#FFFFFF",
    card: "#FFFFFF",
    text: "#111111",
    subtext: "#333333",
    border: "#DDDDDD",
    inputBg: "#FFFFFF",
    inputText: "#111111",
    muted: "#EEEEEE",
  },
  dark: {
    mode: "dark",
    bg: "#0B0B0F",
    card: "#151521",
    text: "#F2F2F3",
    subtext: "#C9C9CC",
    border: "#2B2B3A",
    inputBg: "#1B1B2A",
    inputText: "#F2F2F3",
    muted: "#202033",
  },
};

export function useTheme() {
  const scheme = useColorScheme();
  return scheme === "dark" ? THEMES.dark : THEMES.light;
}
