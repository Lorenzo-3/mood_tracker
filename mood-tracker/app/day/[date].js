// app/day/[date].js
import { Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import {
  addAttachments,
  addTagDef,
  deleteAttachment,
  getAllTagDefs,
  getEntry,
  upsertEntry,
} from "../../scripts/db";
import { MOODS, moodColor, withAlpha } from "../../src/moods";

const MEDIA_DIR = `${Paths.document.uri}media/`; // persisted app storage (offline)

const TAG_PALETTE = [
  "#D64545",
  "#E07A3F",
  "#D9B44A",
  "#4BAA6A",
  "#2F8F83",
  "#4A6FE3",
  "#B04AE3",
];

export default function DayEditor() {
  const { date } = useLocalSearchParams(); // YYYY-MM-DD
  const db = useSQLiteContext();

  const [loading, setLoading] = useState(true);

  const [mood, setMood] = useState(3);
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState([]);

  const [tagDefs, setTagDefs] = useState([]); // [{id,name,color}]
  const [selectedTags, setSelectedTags] = useState([]); // ["work","gym"]

  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [newTagName, setNewTagName] = useState("");

  const bg = useMemo(() => withAlpha(moodColor(mood), 0.12), [mood]);

  async function refreshTagDefs() {
    const defs = await getAllTagDefs(db);
    setTagDefs(defs);
  }

  useEffect(() => {
    refreshTagDefs();
  }, [db]);

  useEffect(() => {
    (async () => {
      try {
        const e = await getEntry(db, date);
        if (e) {
          setMood(e.mood);
          setSelectedTags(e.tags ?? []);
          setNote(e.note ?? "");
          setAttachments(e.attachments ?? []);
        } else {
          setMood(3);
          setSelectedTags([]);
          setNote("");
          setAttachments([]);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [db, date]);

  function toggleTag(name) {
    setSelectedTags(prev =>
      prev.includes(name) ? prev.filter(t => t !== name) : [...prev, name]
    );
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
      mediaTypes: ImagePicker.MediaTypeOptions.All,
      allowsMultipleSelection: true,
      selectionLimit: 10,
      quality: 1,
    });

    if (result.canceled) return;

    const persisted = await persistPickedAssets(result.assets);

    // ensure parent row exists before adding attachments
    await upsertEntry(db, { date, mood, tags: selectedTags, note });
    await addAttachments(db, date, persisted);

    const refreshed = await getEntry(db, date);
    setAttachments(refreshed?.attachments ?? []);
  }

  async function onSave() {
    await upsertEntry(db, { date, mood, tags: selectedTags, note });
    router.back();
  }

  async function onDeleteAttachment(id) {
    await deleteAttachment(db, id);
    const refreshed = await getEntry(db, date);
    setAttachments(refreshed?.attachments ?? []);
  }

  async function createTag() {
    const name = newTagName.trim();
    if (!name) {
      Alert.alert("Tag name required");
      return;
    }

    const color = TAG_PALETTE[Math.floor(Math.random() * TAG_PALETTE.length)];

    try {
      await addTagDef(db, { name, color });
    } catch (e) {
      const msg = String(e?.message ?? e);

      // If it already exists, that's fine: we'll just select it.
      const isUnique = msg.toLowerCase().includes("unique");
      if (!isUnique) {
        Alert.alert("Could not create tag", msg);
        return;
      }
    }

    try {
      await refreshTagDefs();
    } catch (e) {
      Alert.alert(
        "Database not migrated",
        "tag_defs table is missing. Make sure migrateDbIfNeeded runs (SQLiteProvider onInit) or reinstall the app to reset the DB."
      );
      return;
    }

    setSelectedTags(prev => (prev.includes(name) ? prev : [...prev, name]));
    setNewTagName("");
    setTagModalOpen(false);
  }


  if (loading) return null;

  return (
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, backgroundColor: bg, flexGrow: 1 }}>
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
                borderWidth: 1,
                borderColor: withAlpha(moodColor(m.value), selected ? 0.0 : 0.35),
              }}
            >
              <Text style={{ fontWeight: "700" }}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ fontWeight: "700", marginBottom: 8 }}>Tags</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {tagDefs.map(t => {
          const selected = selectedTags.includes(t.name);
          return (
            <Pressable
              key={t.id}
              onPress={() => toggleTag(t.name)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 999,
                backgroundColor: selected ? t.color : withAlpha(t.color, 0.18),
                borderWidth: 1,
                borderColor: withAlpha(t.color, 0.35),
              }}
            >
              <Text style={{ fontWeight: "700" }}>{t.name}</Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={() => setTagModalOpen(true)}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 999,
            backgroundColor: "white",
            borderWidth: 1,
            borderColor: "#ddd",
          }}
        >
          <Text style={{ fontWeight: "800" }}>+ Add tag</Text>
        </Pressable>
      </View>

      <Modal visible={tagModalOpen} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.3)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View style={{ backgroundColor: "white", borderRadius: 16, padding: 14 }}>
            <Text style={{ fontSize: 16, fontWeight: "800", marginBottom: 8 }}>New tag</Text>

            <TextInput
              value={newTagName}
              onChangeText={setNewTagName}
              placeholder="e.g. gym"
              autoCapitalize="none"
              style={{
                borderWidth: 1,
                borderColor: "#ddd",
                borderRadius: 12,
                padding: 10,
                marginBottom: 12,
              }}
            />

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end" }}>
              <Pressable onPress={() => setTagModalOpen(false)} style={{ padding: 10 }}>
                <Text style={{ fontWeight: "800" }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={createTag} style={{ padding: 10 }}>
                <Text style={{ fontWeight: "800" }}>Create</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

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
        <Pressable onPress={pickMedia} style={{ backgroundColor: "white", padding: 12, borderRadius: 12 }}>
          <Text style={{ fontWeight: "700" }}>Add media</Text>
        </Pressable>

        <Pressable onPress={onSave} style={{ backgroundColor: moodColor(mood), padding: 12, borderRadius: 12 }}>
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
