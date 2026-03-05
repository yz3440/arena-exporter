import initSqlJs from "sql.js";
import type { ExportBlock } from "../types";

export const EXPORT_FIELDS = {
  id: "ID",
  title: "Title",
  class: "Type",
  content: "Content",
  description: "Description",
  source_url: "Source URL",
  image_url: "Image URL",
  connected_at: "Connected At",
  created_at: "Created At",
  channels: "Channels",
} as const;

export type ExportFieldKey = keyof typeof EXPORT_FIELDS;

export const ALL_FIELD_KEYS: ExportFieldKey[] = Object.keys(EXPORT_FIELDS) as ExportFieldKey[];

function getFieldValue(block: ExportBlock, field: ExportFieldKey): string | number | null {
  switch (field) {
    case "id": return block.id;
    case "title": return block.title || block.generated_title || null;
    case "class": return block.class;
    case "content": return block.content;
    case "description": return block.description;
    case "source_url": return block.source_url;
    case "image_url": return block.image_display;
    case "connected_at": return block.connected_at;
    case "created_at": return block.created_at;
    case "channels": return block.channels.join(" | ");
  }
}

function triggerDownload(content: string | Uint8Array, filename: string, mimeType: string) {
  const blob = new Blob([content as BlobPart], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportAsJson(blocks: ExportBlock[], fields: ExportFieldKey[], filename = "arena-export.json") {
  const data = blocks.map((b) => {
    const obj: Record<string, string | number | null> = {};
    for (const f of fields) obj[f] = getFieldValue(b, f);
    return obj;
  });
  triggerDownload(JSON.stringify(data, null, 2), filename, "application/json");
}

export function exportAsCsv(blocks: ExportBlock[], fields: ExportFieldKey[], filename = "arena-export.csv") {
  const escape = (v: string | number | null | undefined): string => {
    if (v == null) return "";
    const s = String(v);
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const header = fields.join(",");
  const rows = blocks.map((b) =>
    fields.map((f) => escape(getFieldValue(b, f))).join(","),
  );

  triggerDownload([header, ...rows].join("\n"), filename, "text/csv;charset=utf-8");
}

export async function exportAsSqlite(blocks: ExportBlock[], fields: ExportFieldKey[], filename = "arena-export.sqlite") {
  const SQL = await initSqlJs({
    locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/sql.js@latest/dist/${file}`,
  });
  const db = new SQL.Database();

  // Build column definitions — all TEXT except id which is INTEGER
  const cols = fields.map((f) => {
    const colName = f;
    return f === "id" ? `${colName} INTEGER PRIMARY KEY` : `${colName} TEXT`;
  });
  db.run(`CREATE TABLE blocks (${cols.join(", ")})`);

  // Insert rows
  const placeholders = fields.map(() => "?").join(", ");
  const stmt = db.prepare(`INSERT INTO blocks (${fields.join(", ")}) VALUES (${placeholders})`);
  for (const block of blocks) {
    const values = fields.map((f) => {
      const v = getFieldValue(block, f);
      return v === null ? null : f === "id" ? v : String(v);
    });
    stmt.run(values);
  }
  stmt.free();

  const data = db.export();
  db.close();

  triggerDownload(data, filename, "application/x-sqlite3");
}
