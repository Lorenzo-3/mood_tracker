// app/(tabs)/stats.js
import { useFocusEffect } from "@react-navigation/native";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { BarChart, LineChart } from "react-native-chart-kit";

import {
  getAllAttachments,
  // add these in scripts/db.js if you haven't yet:
  getAllEntries,
  getAllTagDefs,
  getEntriesBetween,
} from "../../scripts/db";

import { exportAllToCsv } from "../../src/exportCsv";
import { moodColor, MOODS, withAlpha } from "../../src/moods";
import { useTheme } from "../../src/theme";

function isoYMD(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function startOfMonthISO(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}-01`;
}
function endOfMonthISO(d = new Date()) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const last = new Date(y, m + 1, 0).getDate();
  return `${y}-${String(m + 1).padStart(2, "0")}-${String(last).padStart(2, "0")}`;
}

function safeTagsJson(s) {
  try {
    const t = JSON.parse(s ?? "[]");
    return Array.isArray(t) ? t.filter(x => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function mean(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function std(arr) {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  const v = mean(arr.map(x => (x - m) ** 2));
  return Math.sqrt(v);
}
function rollingMean(values, window) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    out.push(mean(values.slice(start, i + 1)));
  }
  return out;
}
function rollingStd(values, window) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    out.push(std(values.slice(start, i + 1)));
  }
  return out;
}

function computeTagEffects(rows, minCount = 3) {
  // point-biserial-ish summary: mean(mood|tag) - mean(mood|not tag)
  const n = rows.length;
  if (!n) return [];

  const tagSets = rows.map(r => new Set(safeTagsJson(r.tags_json)));
  const allTags = new Set();
  tagSets.forEach(s => s.forEach(t => allTags.add(t)));

  const out = [];
  for (const tag of allTags) {
    const moods1 = [];
    const moods0 = [];
    for (let i = 0; i < n; i++) {
      if (tagSets[i].has(tag)) moods1.push(rows[i].mood);
      else moods0.push(rows[i].mood);
    }
    if (moods1.length < minCount) continue;

    const m1 = mean(moods1);
    const m0 = mean(moods0);
    const effect = m1 - m0;

    out.push({
      tag,
      count: moods1.length,
      mean_when_present: m1,
      mean_when_absent: m0,
      effect,
    });
  }

  out.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  return out;
}

function weekdayIndexFromISO(dateStr) {
  // 0..6 -> Mon..Sun
  const d = new Date(`${dateStr}T00:00:00`);
  const js = d.getDay(); // 0 Sun .. 6 Sat
  return (js + 6) % 7; // shift so Monday=0
}

export default function Stats() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(320, width - 24);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();

  const [monthRows, setMonthRows] = useState([]);
  const [yearRows, setYearRows] = useState([]);

  const refresh = useCallback(async () => {
    const mRows = await getEntriesBetween(db, startOfMonthISO(now), endOfMonthISO(now));
    const yRows = await getEntriesBetween(db, `${year}-01-01`, `${year}-12-31`);
    setMonthRows(mRows);
    setYearRows(yRows);
  }, [db, now, year]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const monthMoods = monthRows.map(r => r.mood);
  const avgMonthMood = mean(monthMoods);
  const monthAccent = moodColor(Math.min(5, Math.max(1, Math.round(avgMonthMood || 3))));

  // Month trend
  const monthLabels = monthRows.map(r => r.date.slice(8, 10));
  const monthData = monthRows.map(r => r.mood);
  const monthRolling7 = rollingMean(monthData, 7);
  const monthVol7 = rollingStd(monthData, 7);

  // Month distribution (color per mood value)
  const dist = new Map(MOODS.map(m => [m.value, 0]));
  for (const r of monthRows) dist.set(r.mood, (dist.get(r.mood) ?? 0) + 1);

  // Year monthly averages
  const sums = Array(12).fill(0);
  const counts = Array(12).fill(0);
  for (const r of yearRows) {
    const mm = Number(r.date.slice(5, 7)) - 1;
    sums[mm] += r.mood;
    counts[mm] += 1;
  }
  const avg = sums.map((s, i) => (counts[i] ? s / counts[i] : 0));

  // Stability numbers (month)
  const deltas = [];
  for (let i = 1; i < monthData.length; i++) deltas.push(monthData[i] - monthData[i - 1]);
  const avgAbsChange = mean(deltas.map(d => Math.abs(d)));
  const moodStdMonth = std(monthData);
  const stabilityScore = 1 / (1 + (avgAbsChange || 0)); // higher = steadier

  // Tag effects (use year for better sample size)
  const tagEffects = computeTagEffects(yearRows, 3);
  const posTags = tagEffects.filter(x => x.effect > 0).slice(0, 8);
  const negTags = tagEffects
    .filter(x => x.effect < 0)
    .sort((a, b) => a.effect - b.effect) // most negative first
    .slice(0, 8);

  // Weekday averages (year)
  const wdSums = Array(7).fill(0);
  const wdCounts = Array(7).fill(0);
  for (const r of yearRows) {
    const wi = weekdayIndexFromISO(r.date);
    wdSums[wi] += r.mood;
    wdCounts[wi] += 1;
  }
  const wdAvg = wdSums.map((s, i) => (wdCounts[i] ? s / wdCounts[i] : 0));

  const chartConfig = {
    backgroundGradientFrom: theme.card,
    backgroundGradientTo: theme.card,
    decimalPlaces: 1,
    color: (opacity = 1) => (theme.mode === "dark" ? `rgba(242,242,243,${opacity})` : `rgba(0,0,0,${opacity})`),
    labelColor: (opacity = 1) => (theme.mode === "dark" ? `rgba(201,201,204,${opacity})` : `rgba(0,0,0,${opacity})`),
    propsForDots: {
      r: "3",
      strokeWidth: "1",
      stroke: theme.mode === "dark" ? theme.card : theme.card,
    },
  };

  async function onExport() {
    const entries = await getAllEntries(db);
    const attachments = await getAllAttachments(db);
    const tags = await getAllTagDefs(db);
    await exportAllToCsv({ entries, attachments, tags });
  }

  const Card = ({ title, children }) => (
    <View
      style={{
        backgroundColor: theme.card,
        borderWidth: 1,
        borderColor: theme.border,
        borderRadius: 16,
        padding: 12,
        gap: 10,
      }}
    >
      <Text style={{ color: theme.text, fontWeight: "900" }}>{title}</Text>
      {children}
    </View>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 14, backgroundColor: theme.bg }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ fontSize: 20, fontWeight: "900", color: theme.text }}>Stats</Text>
        <Pressable
          onPress={onExport}
          style={{
            backgroundColor: withAlpha(monthAccent, 0.18),
            borderWidth: 1,
            borderColor: withAlpha(monthAccent, 0.35),
            paddingVertical: 10,
            paddingHorizontal: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ fontWeight: "900", color: theme.text }}>Export CSV</Text>
        </Pressable>
      </View>

      <Card title="This month: quick metrics">
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
          <View
            style={{
              paddingVertical: 8,
              paddingHorizontal: 10,
              borderRadius: 12,
              backgroundColor: withAlpha(monthAccent, 0.16),
              borderWidth: 1,
              borderColor: withAlpha(monthAccent, 0.30),
            }}
          >
            <Text style={{ color: theme.text, fontWeight: "900" }}>
              Avg mood: {avgMonthMood ? avgMonthMood.toFixed(2) : "—"}
            </Text>
          </View>

          <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: theme.muted }}>
            <Text style={{ color: theme.text, fontWeight: "900" }}>
              σ mood: {monthData.length ? moodStdMonth.toFixed(2) : "—"}
            </Text>
          </View>

          <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: theme.muted }}>
            <Text style={{ color: theme.text, fontWeight: "900" }}>
              Avg |Δ|: {monthData.length > 1 ? avgAbsChange.toFixed(2) : "—"}
            </Text>
          </View>

          <View style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 12, backgroundColor: theme.muted }}>
            <Text style={{ color: theme.text, fontWeight: "900" }}>
              Stability: {monthData.length > 1 ? stabilityScore.toFixed(2) : "—"}
            </Text>
          </View>
        </View>
      </Card>

      <Card title="This month: mood trend (with 7-day average)">
        {monthRows.length ? (
          <LineChart
            width={chartWidth}
            height={240}
            fromZero
            data={{
              labels: monthLabels,
              datasets: [
                {
                  data: monthData,
                  color: (opacity = 1) => withAlpha(monthAccent, opacity),
                  strokeWidth: 3,
                },
                {
                  data: monthRolling7,
                  color: (opacity = 1) =>
                    theme.mode === "dark" ? `rgba(201,201,204,${opacity})` : `rgba(0,0,0,${opacity})`,
                  strokeWidth: 2,
                },
              ],
              legend: ["Mood", "7-day avg"],
            }}
            chartConfig={chartConfig}
            bezier
            yAxisInterval={1}
          />
        ) : (
          <Text style={{ color: theme.subtext }}>No entries yet.</Text>
        )}
      </Card>

      <Card title="This month: volatility (7-day rolling σ)">
        {monthRows.length ? (
          <LineChart
            width={chartWidth}
            height={220}
            fromZero
            data={{
              labels: monthLabels,
              datasets: [
                {
                  data: monthVol7,
                  color: (opacity = 1) =>
                    theme.mode === "dark" ? `rgba(201,201,204,${opacity})` : `rgba(0,0,0,${opacity})`,
                  strokeWidth: 2,
                },
              ],
            }}
            chartConfig={chartConfig}
            bezier
          />
        ) : (
          <Text style={{ color: theme.subtext }}>No entries yet.</Text>
        )}
      </Card>

      <Card title="This month: distribution">
        <BarChart
          width={chartWidth}
          height={240}
          fromZero
          withCustomBarColorFromData
          flatColor
          data={{
            labels: MOODS.map(m => String(m.value)),
            datasets: [
              {
                data: MOODS.map(m => dist.get(m.value) ?? 0),
                colors: MOODS.map(m => () => moodColor(m.value)),
              },
            ],
          }}
          chartConfig={chartConfig}
        />

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {MOODS.map(m => (
            <View
              key={m.value}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: 999,
                backgroundColor: withAlpha(moodColor(m.value), 0.18),
                borderWidth: 1,
                borderColor: withAlpha(moodColor(m.value), 0.35),
              }}
            >
              <Text style={{ fontWeight: "800", color: theme.text }}>
                {m.value}: {m.label}
              </Text>
            </View>
          ))}
        </View>
      </Card>

      <Card title={`${year}: monthly averages`}>
        <LineChart
          width={chartWidth}
          height={220}
          fromZero
          data={{
            labels: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
            datasets: [
              {
                data: avg.map(v => (v ? Number(v.toFixed(2)) : 0)),
                color: (opacity = 1) => withAlpha(monthAccent, opacity),
                strokeWidth: 3,
              },
            ],
          }}
          chartConfig={chartConfig}
          bezier
        />
      </Card>

      <Card title={`${year}: weekday averages`}>
        <BarChart
          width={chartWidth}
          height={240}
          fromZero
          data={{
            labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
            datasets: [{ data: wdAvg.map(v => Number((v || 0).toFixed(2))) }],
          }}
          chartConfig={chartConfig}
        />
        <Text style={{ color: theme.subtext }}>
          Computed from days with an entry only.
        </Text>
      </Card>

      <Card title={`${year}: tags associated with mood`}>
        <Text style={{ color: theme.subtext }}>
          Effect = (mean mood when tag is present) − (mean mood when absent). Uses this year’s entries.
        </Text>

        {posTags.length ? (
          <>
            <Text style={{ color: theme.text, fontWeight: "900" }}>Top positive</Text>
            <BarChart
              width={chartWidth}
              height={260}
              fromZero
              data={{
                labels: posTags.map(t => (t.tag.length > 8 ? `${t.tag.slice(0, 8)}…` : t.tag)),
                datasets: [{ data: posTags.map(t => Number(t.effect.toFixed(2))) }],
              }}
              chartConfig={{
                ...chartConfig,
                color: (opacity = 1) => withAlpha("#4BAA6A", opacity),
              }}
            />
          </>
        ) : (
          <Text style={{ color: theme.subtext }}>Not enough tag data for positive effects.</Text>
        )}

        {negTags.length ? (
          <>
            <Text style={{ color: theme.text, fontWeight: "900", marginTop: 8 }}>Top negative</Text>
            <BarChart
              width={chartWidth}
              height={260}
              fromZero
              data={{
                labels: negTags.map(t => (t.tag.length > 8 ? `${t.tag.slice(0, 8)}…` : t.tag)),
                datasets: [{ data: negTags.map(t => Number(Math.abs(t.effect).toFixed(2))) }],
              }}
              chartConfig={{
                ...chartConfig,
                color: (opacity = 1) => withAlpha("#D64545", opacity),
              }}
            />
            <Text style={{ color: theme.subtext }}>
              (Magnitude shown; these tags are associated with lower mood.)
            </Text>
          </>
        ) : (
          <Text style={{ color: theme.subtext }}>Not enough tag data for negative effects.</Text>
        )}
      </Card>

      <View style={{ height: 8 }} />
    </ScrollView>
  );
}
