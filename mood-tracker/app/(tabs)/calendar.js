// app/(tabs)/calendar.js
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { CalendarList } from "react-native-calendars";

import { getEntriesBetween } from "../../scripts/db";
import { MOODS, moodColor, withAlpha } from "../../src/moods";
import { useTheme } from "../../src/theme";

const LABEL_W = 44; // month label column

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DOW = ["M","T","W","T","F","S","S"];

function iso(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function todayISO() {
  return iso(new Date());
}
function startOfYear(y) {
  return `${y}-01-01`;
}
function endOfYear(y) {
  return `${y}-12-31`;
}

function hexToRgb(hex) {
  const h = (hex ?? "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map(c => c + c).join("") : h.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return {
    r: Number.isFinite(r) ? r : 0,
    g: Number.isFinite(g) ? g : 0,
    b: Number.isFinite(b) ? b : 0,
  };
}
function lerp(a, b, t) {
  return Math.round(a + (b - a) * t);
}
function rgbToHex({ r, g, b }) {
  const to2 = (x) => x.toString(16).padStart(2, "0");
  return `#${to2(r)}${to2(g)}${to2(b)}`;
}
function lerpHex(c1, c2, t) {
  const a = hexToRgb(c1);
  const b = hexToRgb(c2);
  return rgbToHex({
    r: lerp(a.r, b.r, t),
    g: lerp(a.g, b.g, t),
    b: lerp(a.b, b.b, t),
  });
}

// Month grid: 6 weeks x 7 days (Mon..Sun)
function buildMonthGrid(year, monthIndex0) {
  const first = new Date(year, monthIndex0, 1);
  const last = new Date(year, monthIndex0 + 1, 0).getDate();

  // JS: 0=Sun..6=Sat -> Mon=0..Sun=6
  const offset = (first.getDay() + 6) % 7;

  const cells = Array(6 * 7).fill(null);
  for (let day = 1; day <= last; day++) {
    const idx = offset + (day - 1);
    cells[idx] = iso(new Date(year, monthIndex0, day));
  }
  return cells;
}

// Smoothed mood map over a year (centered moving average)
function computeSmoothedYear(moodByDate, year, window = 11) {
  const start = new Date(year, 0, 1);
  const end = new Date(year, 11, 31);

  const dates = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(iso(d));
  }

  const vals = dates.map(ds => {
    const v = moodByDate[ds];
    return typeof v === "number" ? v : null;
  });

  const half = Math.floor(window / 2);
  const out = {};
  for (let i = 0; i < dates.length; i++) {
    let s = 0;
    let c = 0;
    const a = Math.max(0, i - half);
    const b = Math.min(vals.length - 1, i + half);
    for (let j = a; j <= b; j++) {
      const v = vals[j];
      if (v != null) {
        s += v;
        c += 1;
      }
    }
    out[dates[i]] = c ? s / c : null;
  }
  return out;
}

export default function CalendarScreen() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const [mode, setMode] = useState("month"); // "month" | "year" | "gradient"
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const initialMonth = useMemo(() => todayISO(), []);

  // Preload wide range so month scroller never loses marks
  const preloadStart = useMemo(() => startOfYear(selectedYear - 1), [selectedYear]);
  const preloadEnd = useMemo(() => endOfYear(selectedYear + 1), [selectedYear]);

  const [moodByDate, setMoodByDate] = useState({});
  const [markedDates, setMarkedDates] = useState({});

  const minMood = useMemo(() => Math.min(...MOODS.map(m => m.value)), []);
  const maxMood = useMemo(() => Math.max(...MOODS.map(m => m.value)), []);
  const bad = useMemo(() => moodColor(minMood), [minMood]);
  const good = useMemo(() => moodColor(maxMood), [maxMood]);

  // Layout sizing for year/gradient grid (fills width)
  const GAP = 3;
  const H_PADDING = 12;
  const dayW = useMemo(() => {
    const available = width - H_PADDING * 2 - LABEL_W - GAP * 6;
    return Math.max(28, Math.floor(available / 7)); // rectangular feel on phones
  }, [width]);
  const dayH = useMemo(() => Math.max(14, Math.floor(dayW * 0.55)), [dayW]); // wider than tall

  const monthCells = useMemo(() => {
    const out = [];
    for (let m = 0; m < 12; m++) out.push(buildMonthGrid(selectedYear, m));
    return out;
  }, [selectedYear]);

  const reload = useCallback(async () => {
    const rows = await getEntriesBetween(db, preloadStart, preloadEnd);

    const map = {};
    const marks = {};

    for (const r of rows) {
      map[r.date] = r.mood;
      const c = moodColor(r.mood);
      marks[r.date] = {
        customStyles: {
          container: { backgroundColor: c, borderRadius: 6 },
          text: { color: "#000", fontWeight: "900" },
        },
      };
    }

    // outline today
    const t = todayISO();
    const baseBg = marks[t]?.customStyles?.container?.backgroundColor;
    marks[t] = {
      customStyles: {
        container: {
          backgroundColor: baseBg ?? "transparent",
          borderWidth: 2,
          borderColor: theme.text,
          borderRadius: 6,
        },
        text: { color: baseBg ? "#000" : theme.text, fontWeight: "900" },
      },
    };

    setMoodByDate(map);
    setMarkedDates(marks);
  }, [db, preloadStart, preloadEnd, theme.text]);

  useEffect(() => {
    reload();
  }, [reload]);

  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload])
  );

  const calendarTheme = useMemo(
    () => ({
      calendarBackground: theme.bg,
      monthTextColor: theme.text,
      dayTextColor: theme.text,
      textDisabledColor:
        theme.mode === "dark" ? withAlpha("#FFFFFF", 0.25) : withAlpha("#000000", 0.25),
      arrowColor: theme.text,
      todayTextColor: theme.text,
      textDayFontWeight: "800",
    }),
    [theme.bg, theme.text, theme.mode]
  );

  const smoothed = useMemo(() => {
    if (mode !== "gradient") return null;
    return computeSmoothedYear(moodByDate, selectedYear, 11);
  }, [mode, moodByDate, selectedYear]);

  const colorForYear = useCallback(
    (dateStr) => {
      const m = moodByDate[dateStr];
      if (!m) return null;
      return moodColor(m);
    },
    [moodByDate]
  );

  const colorForGradient = useCallback(
    (dateStr) => {
      const v = smoothed?.[dateStr];
      if (v == null) return null;
      const t = (v - minMood) / (maxMood - minMood);
      return lerpHex(bad, good, Math.max(0, Math.min(1, t)));
    },
    [smoothed, minMood, maxMood, bad, good]
  );

  function ModeButton({ id, label }) {
    const active = mode === id;
    return (
      <Pressable
        onPress={() => setMode(id)}
        style={{
          paddingVertical: 8,
          paddingHorizontal: 12,
          borderRadius: 999,
          backgroundColor: active ? theme.card : "transparent",
          borderWidth: 1,
          borderColor: theme.border,
        }}
      >
        <Text style={{ color: theme.text, fontWeight: "900" }}>{label}</Text>
      </Pressable>
    );
  }

  function YearLikeView({ getColor, showLegend }) {
    return (
      <ScrollView contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 16 }}>
        {/* Weekday header */}
        <View style={{ flexDirection: "row", alignItems: "center", marginTop: 6, marginBottom: 10 }}>
          <View style={{ width: LABEL_W }} />
          <View style={{ flexDirection: "row", gap: GAP }}>
            {DOW.map((d, i) => (
              <View key={i} style={{ width: dayW, alignItems: "center" }}>
                <Text style={{ color: theme.subtext, fontSize: 12, fontWeight: "800" }}>
                  {d}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Months stacked, full-width */}
        <View style={{ gap: 14 }}>
          {monthCells.map((cells, monthIdx) => (
            <View key={monthIdx} style={{ flexDirection: "row", alignItems: "flex-start" }}>
              <View style={{ width: LABEL_W, paddingTop: 2 }}>
                <Text style={{ color: theme.text, fontSize: 14, fontWeight: "900" }}>
                  {MONTHS[monthIdx]}
                </Text>
              </View>

              <View style={{ flex: 1, gap: GAP }}>
                {Array.from({ length: 6 }).map((_, weekRow) => (
                  <View key={weekRow} style={{ flexDirection: "row", gap: GAP }}>
                    {Array.from({ length: 7 }).map((__, dow) => {
                      const dateStr = cells[weekRow * 7 + dow];
                      const c = dateStr ? getColor(dateStr) : null;

                      return (
                        <Pressable
                          key={dow}
                          disabled={!dateStr}
                          onPress={() => router.push(`/day/${dateStr}`)}
                          style={{
                            width: dayW,
                            height: dayH,
                            borderRadius: 6,
                            backgroundColor: c ?? "transparent",
                            borderWidth: 1,
                            borderColor: dateStr
                              ? withAlpha(theme.border, theme.mode === "dark" ? 0.45 : 0.30)
                              : withAlpha(theme.border, theme.mode === "dark" ? 0.18 : 0.12),
                          }}
                        />
                      );
                    })}
                  </View>
                ))}
              </View>
            </View>
          ))}
        </View>

        {showLegend && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 16 }}>
            <Text style={{ color: theme.subtext, fontWeight: "800" }}>bad</Text>
            <View
              style={{
                flex: 1,
                height: 12,
                borderRadius: 8,
                overflow: "hidden",
                flexDirection: "row",
                borderWidth: 1,
                borderColor: withAlpha(theme.border, 0.4),
              }}
            >
              {Array.from({ length: 24 }).map((_, i) => (
                <View key={i} style={{ flex: 1, backgroundColor: lerpHex(bad, good, i / 23) }} />
              ))}
            </View>
            <Text style={{ color: theme.subtext, fontWeight: "800" }}>good</Text>
          </View>
        )}
      </ScrollView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.bg }}>
      {/* Top controls */}
      <View style={{ flexDirection: "row", gap: 8, padding: 12, alignItems: "center" }}>
        <ModeButton id="month" label="Month" />
        <ModeButton id="year" label="Year" />
        <ModeButton id="gradient" label="Gradient" />

        <View style={{ flex: 1 }} />

        {(mode === "year" || mode === "gradient") && (
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Pressable
              onPress={() => setSelectedYear((y) => y - 1)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "900" }}>‹</Text>
            </Pressable>

            <Text style={{ color: theme.text, fontWeight: "900" }}>{selectedYear}</Text>

            <Pressable
              onPress={() => setSelectedYear((y) => y + 1)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: theme.border,
              }}
            >
              <Text style={{ color: theme.text, fontWeight: "900" }}>›</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* Month view */}
      {mode === "month" && (
        <CalendarList
          current={initialMonth}
          pastScrollRange={18}
          futureScrollRange={18}
          scrollEnabled
          showScrollIndicator={false}
          markingType="custom"
          markedDates={markedDates}
          onDayPress={(day) => router.push(`/day/${day.dateString}`)}
          theme={calendarTheme}
        />
      )}

      {/* Year view (discrete colors) */}
      {mode === "year" && (
        <YearLikeView getColor={colorForYear} showLegend={false} />
      )}

      {/* Gradient view (smoothed over time) */}
      {mode === "gradient" && (
        <YearLikeView getColor={colorForGradient} showLegend={true} />
      )}
    </View>
  );
}
