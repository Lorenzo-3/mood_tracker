// app/day/[date].js
import { useEffect, useMemo, useState } from "react";
import { Alert, Image, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, router } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import { Paths } from "expo-file-system";

import { MOODS, moodColor, withAlpha } from "../../src/moods";
import { addAttachments, deleteAttachment, getEntry, upsertEntry } from "../../scripts/db";

const MEDIA_DIR = `${Paths.document.uri}media/`; // persisted app storage (offline)

export default function DayEditor() {
  const { date } = useLocalSearchParams(); // YYYY-MM-DD
  const db = useSQLiteContext();

  const [loading, setLoading] = useState(true);
  const [mood, setMood] = useState(3);
  const [tagsText, setTagsText] = useState("");
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState([]);

  const bg = useMemo(() => withAlpha(moodColor(mood), 0.12), [mood]);

  useEffect(() => {
    (async () => {
      try {
        const e = await getEntry(db, date);
        if (e) {
          setMood(e.mood);
          setTagsText((e.tags ?? []).join(", "));
          setNote(e.note ?? "");
          setAttachments(e.attachments ?? []);
        } else {
          setMood(3);
          setTagsText("");
          setNote("");
          setAttachments([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [db, date]);

  function parseTags(s) {
    return s
      .split(",")
      .map(t => t.trim())
      .filter(Boolean)
      .slice(0, 20);
  }

  async function ensureMediaDir() {
    try {
      await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
    } catch {
      // ignore if exists
    }
  }

  async function persistPickedAssets(pickedAssets) {
    await ensureMediaDir();
    const persisted = [];
    for (const a of pickedAssets) {
      const extGuess =
        (a.fileName && a.fileName.includes(".") && a.fileName.split(".").pop()) ||
        (a.uri.includes(".") && a.uri.split(".").pop().split("?")[0]) ||
        "jpg";

      const dest = `${MEDIA_DIR}${date}_${Date.now()}_${Math.random()
        .toString(16)
        .slice(2)}.${extGuess}`;

      // copyAsync supports content:// on Android (legacy FS API) :contentReference[oaicite:2]{index=2}
      await FileSystem.copyAsync({ from: a.uri, to: dest });

      persisted.push({ uri: dest, type: a.type ?? "image" });
    }
    return persisted;
  }

  async function pickMedia() {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Permission required", "Media library permission is required.");
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images", "videos"],
      allowsMultipleSelection: true,
      selectionLimit: 10, // max items when multi-select is enabled :contentReference[oaicite:3]{index=3}
      quality: 1,
    });

    if (result.canceled) return;

    const persisted = await persistPickedAssets(result.assets);
    await upsertEntry(db, { date, mood, tags: parseTags(tagsText), note }); // ensure parent row exists
    await addAttachments(db, date, persisted);

    const refreshed = await getEntry(db, date);
    setAttachments(refreshed?.attachments ?? []);
  }

  async function onSave() {
    await upsertEntry(db, { date, mood, tags: parseTags(tagsText), note });
    router.back();
  }

  async function onDeleteAttachment(id) {
    await deleteAttachment(db, id);
    const refreshed = await getEntry(db, date);
    setAttachments(refreshed?.attachments ?? []);
  }

  if (loading) return null;

  return (
    <ScrollView contentContainerStyle={{ padding: 16, backgroundColor: bg, flexGrow: 1 }}>
      <Text style={{ fontSize: 22, fontWeight: "700", marginBottom: 12 }}>{date}</Text>

      <Text style={{ fontWeight: "700", marginBottom: 8 }}>Mood</Text>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {MOODS.map(m => {
          const selected = m.value === mood;
          return (
            <Pressable
              key={m.value}
              onPress={() => setMood(m.value)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: selected ? moodColor(m.value) : withAlpha(moodColor(m.value), 0.18),
                borderWidth: selected ? 0 : 1,
                borderColor: withAlpha(moodColor(m.value), 0.35),
              }}
            >
              <Text style={{ fontWeight: "700" }}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ fontWeight: "700", marginBottom: 8 }}>Tags (comma-separated)</Text>
      <TextInput
        value={tagsText}
        onChangeText={setTagsText}
        placeholder="work, gym, friends"
        style={{
          backgroundColor: "white",
          borderRadius: 12,
          padding: 12,
          marginBottom: 16,
        }}
      />

      <Text style={{ fontWeight: "700", marginBottom: 8 }}>Note</Text>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="What happened today?"
        multiline
        style={{
          backgroundColor: "white",
          borderRadius: 12,
          padding: 12,
          minHeight: 120,
          textAlignVertical: "top",
          marginBottom: 16,
        }}
      />

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <Pressable
          onPress={pickMedia}
          style={{ backgroundColor: "white", padding: 12, borderRadius: 12 }}
        >
          <Text style={{ fontWeight: "700" }}>Add media</Text>
        </Pressable>

        <Pressable
          onPress={onSave}
          style={{ backgroundColor: moodColor(mood), padding: 12, borderRadius: 12 }}
        >
          <Text style={{ fontWeight: "700" }}>Save</Text>
        </Pressable>
      </View>

      <Text style={{ fontWeight: "700", marginBottom: 8 }}>Attachments</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {attachments.map(a => (
          <Pressable
            key={a.id}
            onLongPress={() =>
              Alert.alert("Remove attachment?", "This removes it from the entry.", [
                { text: "Cancel" },
                { text: "Remove", style: "destructive", onPress: () => onDeleteAttachment(a.id) },
              ])
            }
            style={{ width: 96 }}
          >
            {a.media_type === "image" ? (
              <Image
                source={{ uri: a.uri }}
                style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: "#eee" }}
              />
            ) : (
              <View
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 12,
                  backgroundColor: "#eee",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontWeight: "700" }}>VIDEO</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
