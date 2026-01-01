import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { CalendarList } from "react-native-calendars";
import { getMonthEntries } from "../../scripts/db";
import { moodColor, withAlpha } from "../../src/moods";

function ymFrom(dateStr) {
  return dateStr.slice(0, 7);
}
function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function CalendarScreen() {
  const db = useSQLiteContext();
  const [current, setCurrent] = useState(todayISO());
  const [markedDates, setMarkedDates] = useState({});

  const yearMonth = useMemo(() => ymFrom(current), [current]);

  const loadMonth = useCallback(async () => {
    const rows = await getMonthEntries(db, yearMonth);
    const marks = {};

    for (const r of rows) {
      const c = moodColor(r.mood);
      marks[r.date] = {
        customStyles: {
          container: {
            backgroundColor: c,
            borderRadius: 6,        // square-ish (set to 0 for hard square)
          },
          text: {
            color: "#000",
            fontWeight: "800",
          },
        },
      };
    }

    // Optional: highlight today if you want a subtle outline even without entry
    const t = todayISO();
    if (!marks[t]) {
      marks[t] = {
        customStyles: {
          container: { borderWidth: 2, borderColor: "#000", borderRadius: 6, backgroundColor: withAlpha("#000000", 0.05) },
          text: { color: "#000", fontWeight: "800" },
        },
      };
    }

    setMarkedDates(marks);
  }, [db, yearMonth]);

  useEffect(() => {
    loadMonth();
  }, [loadMonth]);

  useFocusEffect(
    useCallback(() => {
      // refresh when returning from editing a day
      loadMonth();
    }, [loadMonth])
  );

  return (
    <View style={{ flex: 1 }}>
      <CalendarList
        current={current}
        markingType="custom"
        markedDates={markedDates}
        onVisibleMonthsChange={(months) => {
          if (months?.[0]?.dateString) setCurrent(months[0].dateString);
        }}
        onDayPress={(day) => router.push(`/day/${day.dateString}`)}
        theme={{
          // optional: tighten spacing so “filled squares” feel more like blocks
          textDayFontWeight: "800",
        }}
      />
    </View>
  );
}
