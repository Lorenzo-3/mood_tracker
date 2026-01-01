// app/(tabs)/stats.js
import { useEffect, useMemo, useState } from "react";
import { ScrollView, Text, useWindowDimensions, View } from "react-native";
import { LineChart, BarChart } from "react-native-chart-kit";
import { useSQLiteContext } from "expo-sqlite";
import { getEntriesBetween } from "../../scripts/db";
import { MOODS, moodColor, withAlpha } from "../../src/moods";

function todayISO() {
  const d = new Date();
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

export default function Stats() {
  const db = useSQLiteContext();
  const { width } = useWindowDimensions();
  const chartWidth = Math.max(320, width - 24);

  const [monthRows, setMonthRows] = useState([]);
  const [yearRows, setYearRows] = useState([]);

  const now = useMemo(() => new Date(), []);
  const year = now.getFullYear();

  useEffect(() => {
    (async () => {
      const mRows = await getEntriesBetween(db, startOfMonthISO(now), endOfMonthISO(now));
      const yRows = await getEntriesBetween(db, `${year}-01-01`, `${year}-12-31`);
      setMonthRows(mRows);
      setYearRows(yRows);
    })();
  }, [db, now, year]);

  // Month trend (by recorded days)
  const monthLabels = monthRows.map(r => r.date.slice(8, 10));
  const monthData = monthRows.map(r => r.mood);

  // Mood distribution (month)
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

  const chartConfig = {
    backgroundGradientFrom: "#FFFFFF",
    backgroundGradientTo: "#FFFFFF",
    decimalPlaces: 1,
    color: (opacity = 1) => `rgba(0,0,0,${opacity})`,
    labelColor: (opacity = 1) => `rgba(0,0,0,${opacity})`,
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 12, gap: 18 }}>
      <Text style={{ fontSize: 20, fontWeight: "800" }}>Stats</Text>

      <View>
        <Text style={{ fontWeight: "800", marginBottom: 8 }}>This month: mood trend</Text>
        {monthRows.length ? (
          <LineChart
            width={chartWidth}
            height={220}
            data={{
              labels: monthLabels,
              datasets: [{ data: monthData }],
            }}
            chartConfig={chartConfig}
            bezier
            fromZero
            yAxisInterval={1}
          />
        ) : (
          <Text>No entries yet.</Text>
        )}
      </View>

      <View>
        <Text style={{ fontWeight: "800", marginBottom: 8 }}>This month: distribution</Text>
        <BarChart
          width={chartWidth}
          height={220}
          fromZero
          data={{
            labels: MOODS.map(m => String(m.value)),
            datasets: [{ data: MOODS.map(m => dist.get(m.value) ?? 0) }],
          }}
          chartConfig={{
            ...chartConfig,
            color: (opacity = 1) => `rgba(0,0,0,${opacity})`,
          }}
        />
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
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
              <Text style={{ fontWeight: "700" }}>{m.value}: {m.label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View>
        <Text style={{ fontWeight: "800", marginBottom: 8 }}>{year}: monthly averages</Text>
        <LineChart
          width={chartWidth}
          height={220}
          data={{
            labels: ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"],
            datasets: [{ data: avg.map(v => (v ? Number(v.toFixed(2)) : 0)) }],
          }}
          chartConfig={chartConfig}
          fromZero
        />
      </View>
    </ScrollView>
  );
}
