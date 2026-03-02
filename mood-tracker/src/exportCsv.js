// src/exportCsv.js
import { Paths } from "expo-file-system";
import * as FileSystem from "expo-file-system/legacy";
import * as Sharing from "expo-sharing";

function csvEscape(v) {
  const s = (v ?? "").toString();
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const head = headers.map(csvEscape).join(",");
  const body = rows.map(r => headers.map(h => csvEscape(r[h])).join(",")).join("\n");
  return `${head}\n${body}\n`;
}

export async function exportAllToCsv({ entries, attachments, tags }) {
  const exportDir = `${Paths.document.uri}exports/`;
  try {
    await FileSystem.makeDirectoryAsync(exportDir, { intermediates: true });
  } catch {}

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const fileUri = `${exportDir}mood_export_${ts}.csv`;

  // Single CSV containing 3 sections (easy to share one file)
  const csv =
    `# entries\n` +
    toCsv(
      ["date", "mood", "tags_json", "note", "updated_at"],
      entries.map(e => ({ ...e }))
    ) +
    `\n# attachments\n` +
    toCsv(
      ["id", "entry_date", "uri", "media_type", "created_at"],
      attachments.map(a => ({ ...a }))
    ) +
    `\n# tags\n` +
    toCsv(
      ["id", "name", "color", "created_at"],
      tags.map(t => ({ ...t }))
    );

  await FileSystem.writeAsStringAsync(fileUri, csv);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, { mimeType: "text/csv", dialogTitle: "Export mood data" });
  }

  return fileUri;
}
