// app/(tabs)/index.js
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { getEntry, upsertEntry } from "../../scripts/db";
import { MOODS, moodColor, withAlpha } from "../../src/moods";
import { useTheme } from "../../src/theme";

function todayISO() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export default function Today() {
  const db = useSQLiteContext();
  const theme = useTheme();
  const date = useMemo(() => todayISO(), []);

  const [entry, setEntry] = useState(null);

  const refresh = useCallback(async () => {
    const e = await getEntry(db, date);
    setEntry(e);
  }, [db, date]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const mood = entry?.mood ?? 3;
  const accent = moodColor(mood);

  async function quickSetMood(m) {
    await upsertEntry(db, {
      date,
      mood: m,
      tags: entry?.tags ?? [],
      note: entry?.note ?? "",
    });
    await refresh();
  }

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: theme.bg, gap: 14 }}>
      <View>
        <Text style={{ fontSize: 26, fontWeight: "900", color: theme.text }}>Today</Text>
        <Text style={{ fontSize: 16, color: theme.subtext }}>{date}</Text>
      </View>

      <View
        style={{
          backgroundColor: withAlpha(accent, theme.mode === "dark" ? 0.18 : 0.12),
          borderWidth: 1,
          borderColor: withAlpha(accent, 0.35),
          padding: 12,
          borderRadius: 16,
          gap: 10,
        }}
      >
        <Text style={{ color: theme.text, fontWeight: "900" }}>Quick mood</Text>

        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {MOODS.map(m => {
            const selected = m.value === mood;
            return (
              <Pressable
                key={m.value}
                onPress={() => quickSetMood(m.value)}
                style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 12,
                  backgroundColor: selected ? moodColor(m.value) : withAlpha(moodColor(m.value), 0.18),
                  borderWidth: 1,
                  borderColor: withAlpha(moodColor(m.value), 0.35),
                }}
              >
                <Text style={{ fontWeight: "900", color: theme.text }}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <View
        style={{
          backgroundColor: theme.card,
          borderWidth: 1,
          borderColor: theme.border,
          borderRadius: 16,
          padding: 12,
          gap: 8,
        }}
      >
        <Text style={{ color: theme.text, fontWeight: "900" }}>Summary</Text>

        <Text style={{ color: theme.subtext }}>
          Tags: {entry?.tags?.length ? entry.tags.join(", ") : "—"}
        </Text>
        <Text style={{ color: theme.subtext }}>
          Note: {entry?.note?.trim() ? entry.note.trim().slice(0, 80) + (entry.note.trim().length > 80 ? "…" : "") : "—"}
        </Text>
        <Text style={{ color: theme.subtext }}>
          Attachments: {entry?.attachments?.length ?? 0}
        </Text>

        <Pressable
          onPress={() => router.push(`/day/${date}`)}
          style={{
            marginTop: 6,
            backgroundColor: accent,
            paddingVertical: 12,
            paddingHorizontal: 14,
            borderRadius: 14,
            alignSelf: "flex-start",
          }}
        >
          <Text style={{ fontWeight: "900", color: theme.text }}>Edit today</Text>
        </Pressable>
      </View>
    </View>
  );
}
