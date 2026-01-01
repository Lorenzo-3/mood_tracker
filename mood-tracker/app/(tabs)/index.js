// app/(tabs)/index.js
import { useEffect, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { getEntry } from "../../scripts/db";
import { moodColor, withAlpha } from "../../src/moods";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Today() {
  const db = useSQLiteContext();
  const date = useMemo(() => todayISO(), []);
  const [mood, setMood] = useState(3);

  useEffect(() => {
    (async () => {
      const e = await getEntry(db, date);
      setMood(e?.mood ?? 3);
    })();
  }, [db, date]);

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: withAlpha(moodColor(mood), 0.10) }}>
      <Text style={{ fontSize: 22, fontWeight: "800", marginBottom: 6 }}>Today</Text>
      <Text style={{ fontSize: 16, marginBottom: 18 }}>{date}</Text>

      <Pressable
        onPress={() => router.push(`/day/${date}`)}
        style={{
          backgroundColor: moodColor(mood),
          padding: 14,
          borderRadius: 14,
          alignSelf: "flex-start",
        }}
      >
        <Text style={{ fontWeight: "800" }}>Edit today</Text>
      </Pressable>
    </View>
  );
}
