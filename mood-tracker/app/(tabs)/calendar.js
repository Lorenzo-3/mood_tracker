// app/(tabs)/calendar.js
import { useEffect, useMemo, useState } from "react";
import { View } from "react-native";
import { CalendarList } from "react-native-calendars";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { getMonthEntries } from "../../scripts/db";
import { moodColor } from "../../src/moods";

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

  useEffect(() => {
    (async () => {
      const rows = await getMonthEntries(db, yearMonth);
      const marks = {};
      for (const r of rows) {
        marks[r.date] = {
          marked: true,
          dotColor: moodColor(r.mood),
        };
      }
      setMarkedDates(marks);
    })();
  }, [db, yearMonth]);

  return (
    <View style={{ flex: 1 }}>
      <CalendarList
        current={current}
        onVisibleMonthsChange={(months) => {
          if (months?.[0]?.dateString) setCurrent(months[0].dateString);
        }}
        markedDates={markedDates}
        onDayPress={(day) => router.push(`/day/${day.dateString}`)}
      />
    </View>
  );
}
