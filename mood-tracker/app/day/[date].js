// app/day/[date].js
import Slider from "@react-native-community/slider";
import { useFocusEffect } from "@react-navigation/native";
import { Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useSQLiteContext } from "expo-sqlite";
import { useCallback, useEffect, useMemo, useState } from "react";
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
  updateTagDefColor,
  upsertEntry,
} from "../../scripts/db";

import { MOODS, moodColor, withAlpha } from "../../src/moods";
import { useTheme } from "../../src/theme";

const MEDIA_DIR = `${Paths.document.uri}media/`;

function clamp255(x) {
  const n = Number(x);
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}
function toHex2(n) {
  return clamp255(n).toString(16).padStart(2, "0").toUpperCase();
}
function rgbToHex(r, g, b) {
  return `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
}
function hexToRgb(hex) {
  const h = (hex ?? "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return {
    r: Number.isFinite(r) ? r : 0,
    g: Number.isFinite(g) ? g : 0,
    b: Number.isFinite(b) ? b : 0,
  };
}
function randomRgb() {
  // avoid very dark colors
  return {
    r: 40 + Math.floor(Math.random() * 216),
    g: 40 + Math.floor(Math.random() * 216),
    b: 40 + Math.floor(Math.random() * 216),
  };
}

export default function DayEditor() {
  const { date } = useLocalSearchParams(); // YYYY-MM-DD
  const db = useSQLiteContext();
  const theme = useTheme();

  const [loading, setLoading] = useState(true);
  const [mood, setMood] = useState(3);
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState([]);

  const [tagDefs, setTagDefs] = useState([]); // [{id,name,color,created_at}]
  const [selectedTags, setSelectedTags] = useState([]); // ["work","gym"]

  const [tagModalOpen, setTagModalOpen] = useState(false);
  const [editingTag, setEditingTag] = useState(null); // {id,name,color} | null
  const [newTagName, setNewTagName] = useState("");

  const [r, setR] = useState(180);
  const [g, setG] = useState(120);
  const [b, setB] = useState(120);

  const pickedColor = useMemo(() => rgbToHex(r, g, b), [r, g, b]);

  // Use theme.bg as base; mood as an accent layer.
  const accentBg = useMemo(
    () => withAlpha(moodColor(mood), theme.mode === "dark" ? 0.22 : 0.12),
    [mood, theme.mode]
  );

  const refreshTagDefs = useCallback(async () => {
    const defs = await getAllTagDefs(db);
    setTagDefs(defs);
  }, [db]);

  const refreshEntry = useCallback(async () => {
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
  }, [db, date]);

  useEffect(() => {
    (async () => {
      try {
        await refreshTagDefs();
        await refreshEntry();
      } finally {
        setLoading(false);
      }
    })();
  }, [refreshTagDefs, refreshEntry]);

  useFocusEffect(
    useCallback(() => {
      refreshTagDefs();
      refreshEntry();
    }, [refreshTagDefs, refreshEntry])
  );

  function toggleTag(name) {
    setSelectedTags((prev) =>
      prev.includes(name) ? prev.filter((t) => t !== name) : [...prev, name]
    );
  }

  function openCreateTag() {
    setEditingTag(null);
    setNewTagName("");
    const c = randomRgb();
    setR(c.r);
    setG(c.g);
    setB(c.b);
    setTagModalOpen(true);
  }

  function openEditTag(t) {
    setEditingTag(t);
    setNewTagName(t.name);
    const c = hexToRgb(t.color);
    setR(c.r);
    setG(c.g);
    setB(c.b);
    setTagModalOpen(true);
  }

  async function ensureMediaDir() {
    try {
      await FileSystem.makeDirectoryAsync(MEDIA_DIR, { intermediates: true });
    } catch {}
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

    await upsertEntry(db, { date, mood, tags: selectedTags, note });
    await addAttachments(db, date, persisted);
    await refreshEntry();
  }

  async function onSave() {
    await upsertEntry(db, { date, mood, tags: selectedTags, note });
    router.back();
  }

  async function onDeleteAttachment(id) {
    await deleteAttachment(db, id);
    await refreshEntry();
  }

  async function onSaveTag() {
    const name = newTagName.trim();
    if (!name) {
      Alert.alert("Tag name required");
      return;
    }

    try {
      if (editingTag) {
        await updateTagDefColor(db, { name: editingTag.name, color: pickedColor });
      } else {
        await addTagDef(db, { name, color: pickedColor });
      }
    } catch (e) {
      const msg = String(e?.message ?? e);
      const isUnique = msg.toLowerCase().includes("unique");
      if (!editingTag && !isUnique) {
        Alert.alert("Could not save tag", msg);
        return;
      }
    }

    await refreshTagDefs();
    setSelectedTags((prev) => (prev.includes(name) ? prev : [...prev, name]));
    setTagModalOpen(false);
  }

  if (loading) return null;

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{
        padding: 16,
        flexGrow: 1,
        backgroundColor: theme.bg,
      }}
    >
      <View
        style={{
          backgroundColor: accentBg,
          borderRadius: 16,
          padding: 12,
          borderWidth: 1,
          borderColor: withAlpha(moodColor(mood), 0.30),
          marginBottom: 14,
        }}
      >
        <Text style={{ fontSize: 22, fontWeight: "900", color: theme.text }}>
          {date}
        </Text>
      </View>

      <Text style={{ fontWeight: "900", marginBottom: 8, color: theme.text }}>
        Mood
      </Text>

      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {MOODS.map((m) => {
          const selected = m.value === mood;
          const c = moodColor(m.value);

          return (
            <Pressable
              key={m.value}
              onPress={() => setMood(m.value)}
              style={{
                paddingVertical: 10,
                paddingHorizontal: 12,
                borderRadius: 12,
                backgroundColor: selected
                  ? c
                  : withAlpha(c, theme.mode === "dark" ? 0.25 : 0.18),
                borderWidth: 1,
                borderColor: withAlpha(c, 0.35),
              }}
            >
              <Text style={{ fontWeight: "900", color: theme.text }}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={{ fontWeight: "900", marginBottom: 8, color: theme.text }}>
        Tags
      </Text>

      <Text style={{ color: theme.subtext, marginBottom: 8 }}>
        Tap to select. Long-press to edit color.
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        {tagDefs.map((t) => {
          const selected = selectedTags.includes(t.name);
          return (
            <Pressable
              key={t.id}
              onPress={() => toggleTag(t.name)}
              onLongPress={() => openEditTag(t)}
              style={{
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 999,
                backgroundColor: selected
                  ? t.color
                  : withAlpha(t.color, theme.mode === "dark" ? 0.25 : 0.18),
                borderWidth: 1,
                borderColor: withAlpha(t.color, 0.35),
              }}
            >
              <Text style={{ fontWeight: "900", color: theme.text }}>{t.name}</Text>
            </Pressable>
          );
        })}

        <Pressable
          onPress={openCreateTag}
          style={{
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 999,
            backgroundColor: theme.card,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ fontWeight: "900", color: theme.text }}>+ Add tag</Text>
        </Pressable>
      </View>

      <Modal visible={tagModalOpen} transparent animationType="fade">
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.35)",
            justifyContent: "center",
            padding: 16,
          }}
        >
          <View
            style={{
              backgroundColor: theme.card,
              borderRadius: 16,
              padding: 14,
              borderWidth: 1,
              borderColor: theme.border,
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: "900",
                marginBottom: 8,
                color: theme.text,
              }}
            >
              {editingTag ? "Edit tag color" : "New tag"}
            </Text>

            <Text style={{ color: theme.subtext, fontWeight: "800", marginBottom: 6 }}>
              Name
            </Text>

            <TextInput
              value={newTagName}
              onChangeText={setNewTagName}
              placeholder="e.g. gym"
              placeholderTextColor={theme.subtext}
              autoCapitalize="none"
              editable={!editingTag}
              style={{
                borderWidth: 1,
                borderColor: theme.border,
                borderRadius: 12,
                padding: 10,
                marginBottom: 12,
                backgroundColor: theme.inputBg,
                color: theme.inputText,
                opacity: editingTag ? 0.85 : 1,
              }}
            />

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 10,
                  backgroundColor: pickedColor,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              />
              <Text style={{ color: theme.subtext, fontWeight: "900" }}>{pickedColor}</Text>

              <View style={{ flex: 1 }} />

              <Pressable
                onPress={() => {
                  const c = randomRgb();
                  setR(c.r);
                  setG(c.g);
                  setB(c.b);
                }}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: theme.border,
                }}
              >
                <Text style={{ color: theme.text, fontWeight: "900" }}>Random</Text>
              </Pressable>
            </View>

            {[
              ["R", r, setR],
              ["G", g, setG],
              ["B", b, setB],
            ].map(([label, val, setVal]) => (
              <View key={label} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                  <Text style={{ color: theme.subtext, fontWeight: "900" }}>{label}</Text>
                  <Text style={{ color: theme.subtext, fontWeight: "900" }}>{val}</Text>
                </View>

                <Slider
                  minimumValue={0}
                  maximumValue={255}
                  step={1}
                  value={val}
                  onValueChange={setVal}
                  minimumTrackTintColor={theme.text}
                  maximumTrackTintColor={theme.border}
                  thumbTintColor={theme.text}
                />
              </View>
            ))}

            <View style={{ flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
              <Pressable onPress={() => setTagModalOpen(false)} style={{ padding: 10 }}>
                <Text style={{ fontWeight: "900", color: theme.text }}>Cancel</Text>
              </Pressable>
              <Pressable onPress={onSaveTag} style={{ padding: 10 }}>
                <Text style={{ fontWeight: "900", color: theme.text }}>
                  {editingTag ? "Save" : "Create"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      <Text style={{ fontWeight: "900", marginBottom: 8, color: theme.text }}>
        Note
      </Text>

      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder="What happened today?"
        placeholderTextColor={theme.subtext}
        multiline
        style={{
          backgroundColor: theme.inputBg,
          color: theme.inputText,
          borderRadius: 12,
          padding: 12,
          minHeight: 120,
          textAlignVertical: "top",
          marginBottom: 16,
          borderWidth: 1,
          borderColor: theme.border,
        }}
      />

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 12 }}>
        <Pressable
          onPress={pickMedia}
          style={{
            backgroundColor: theme.card,
            padding: 12,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Text style={{ fontWeight: "900", color: theme.text }}>Add media</Text>
        </Pressable>

        <Pressable
          onPress={onSave}
          style={{
            backgroundColor: moodColor(mood),
            padding: 12,
            borderRadius: 12,
          }}
        >
          <Text style={{ fontWeight: "900", color: theme.text }}>Save</Text>
        </Pressable>
      </View>

      <Text style={{ fontWeight: "900", marginBottom: 8, color: theme.text }}>
        Attachments
      </Text>

      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10 }}>
        {attachments.map((a) => (
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
                style={{ width: 96, height: 96, borderRadius: 12, backgroundColor: theme.muted }}
              />
            ) : (
              <View
                style={{
                  width: 96,
                  height: 96,
                  borderRadius: 12,
                  backgroundColor: theme.muted,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontWeight: "900", color: theme.text }}>VIDEO</Text>
              </View>
            )}
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
