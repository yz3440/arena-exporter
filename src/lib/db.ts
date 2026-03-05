import { openDB, deleteDB, type IDBPDatabase } from "idb";
import type { DbChannel, DbBlock, DbConnection, SyncStatus, ChannelWithBlocks, ExportBlock } from "../types";

const DB_NAME = "arena-exporter";
const DB_VERSION = 1;

interface ArenaExporterDB {
  channels: { key: number; value: DbChannel };
  blocks: { key: number; value: DbBlock };
  connections: {
    key: [number, number];
    value: DbConnection;
    indexes: { "by-channel": number; "by-connected-at": string };
  };
  meta: { key: string; value: { key: string; value: string } };
}

let dbPromise: Promise<IDBPDatabase<ArenaExporterDB>> | null = null;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<ArenaExporterDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        db.createObjectStore("channels", { keyPath: "id" });
        db.createObjectStore("blocks", { keyPath: "id" });

        const connStore = db.createObjectStore("connections", {
          keyPath: ["block_id", "channel_id"],
        });
        connStore.createIndex("by-channel", "channel_id");
        connStore.createIndex("by-connected-at", "connected_at");

        db.createObjectStore("meta", { keyPath: "key" });
      },
    });
  }
  return dbPromise;
}

// ─── Channel Operations ─────────────────────────────────────────────

export async function upsertChannel(ch: DbChannel) {
  const db = await getDb();
  await db.put("channels", ch);
}

export async function getAllChannels(): Promise<(DbChannel & { block_count: number })[]> {
  const db = await getDb();
  const channels = await db.getAll("channels");
  const connections = await db.getAll("connections");

  const countMap = new Map<number, number>();
  for (const conn of connections) {
    countMap.set(conn.channel_id, (countMap.get(conn.channel_id) || 0) + 1);
  }

  return channels
    .map((ch) => ({ ...ch, block_count: countMap.get(ch.id) || 0 }))
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getChannelBySlug(slug: string): Promise<ChannelWithBlocks | null> {
  const db = await getDb();
  const channels = await db.getAll("channels");
  const channel = channels.find((ch) => ch.slug === slug);
  if (!channel) return null;

  const connections = await db.getAllFromIndex("connections", "by-channel", channel.id);
  const blocks: ChannelWithBlocks["blocks"] = [];

  for (const conn of connections) {
    const block = await db.get("blocks", conn.block_id);
    if (block) {
      blocks.push({ ...block, position: conn.position, connected_at: conn.connected_at });
    }
  }

  blocks.sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  return { ...channel, blocks, block_count: blocks.length };
}

// ─── Block Operations ───────────────────────────────────────────────

export async function upsertBlock(block: DbBlock) {
  const db = await getDb();
  await db.put("blocks", block);
}

export async function upsertConnection(conn: DbConnection) {
  const db = await getDb();
  await db.put("connections", conn);
}

// ─── Export Query ───────────────────────────────────────────────────

export async function getBlocksForExport(
  channelIds: number[],
  dateFrom?: string,
  dateTo?: string,
): Promise<ExportBlock[]> {
  const db = await getDb();
  const connections = await db.getAll("connections");
  const channelSet = new Set(channelIds);

  // Filter connections by selected channels and date range
  const filtered = connections.filter((conn) => {
    if (!channelSet.has(conn.channel_id)) return false;
    if (dateFrom && conn.connected_at && conn.connected_at < dateFrom) return false;
    if (dateTo && conn.connected_at && conn.connected_at > dateTo + "T23:59:59") return false;
    return true;
  });

  // Group by block_id to collect all channels per block
  const blockChannels = new Map<number, { channels: string[]; connected_at: string | null }>();
  const allChannels = await db.getAll("channels");
  const channelNameMap = new Map(allChannels.map((ch) => [ch.id, ch.title]));

  for (const conn of filtered) {
    const existing = blockChannels.get(conn.block_id);
    const chName = channelNameMap.get(conn.channel_id) || String(conn.channel_id);
    if (existing) {
      if (!existing.channels.includes(chName)) existing.channels.push(chName);
    } else {
      blockChannels.set(conn.block_id, { channels: [chName], connected_at: conn.connected_at });
    }
  }

  // Build export blocks
  const result: ExportBlock[] = [];
  for (const [blockId, info] of blockChannels) {
    const block = await db.get("blocks", blockId);
    if (block) {
      result.push({ ...block, channels: info.channels, connected_at: info.connected_at });
    }
  }

  return result;
}

export async function countBlocksForExport(
  channelIds: number[],
  dateFrom?: string,
  dateTo?: string,
): Promise<number> {
  const db = await getDb();
  const connections = await db.getAll("connections");
  const channelSet = new Set(channelIds);

  const blockIds = new Set<number>();
  for (const conn of connections) {
    if (!channelSet.has(conn.channel_id)) continue;
    if (dateFrom && conn.connected_at && conn.connected_at < dateFrom) continue;
    if (dateTo && conn.connected_at && conn.connected_at > dateTo + "T23:59:59") continue;
    blockIds.add(conn.block_id);
  }

  return blockIds.size;
}

// ─── Sync Meta ──────────────────────────────────────────────────────

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.put("meta", { key, value });
}

export async function getMeta(key: string): Promise<string | null> {
  const db = await getDb();
  const row = await db.get("meta", key);
  return row?.value ?? null;
}

export async function isChannelDone(channelId: number): Promise<boolean> {
  return (await getMeta(`channel_done_${channelId}`)) === "true";
}

export async function markChannelDone(channelId: number) {
  await setMeta(`channel_done_${channelId}`, "true");
}

export async function getSyncStatus(): Promise<SyncStatus> {
  const db = await getDb();
  const channelCount = (await db.getAll("channels")).length;
  const blockCount = (await db.getAll("blocks")).length;
  const connectionCount = (await db.getAll("connections")).length;
  const lastSync = await getMeta("last_sync");

  return { channelCount, blockCount, connectionCount, lastSync };
}

// ─── Clear Cache ────────────────────────────────────────────────────

export async function clearAllData() {
  const db = await getDb();
  const tx = db.transaction(["channels", "blocks", "connections", "meta"], "readwrite");
  await Promise.all([
    tx.objectStore("channels").clear(),
    tx.objectStore("blocks").clear(),
    tx.objectStore("connections").clear(),
    tx.objectStore("meta").clear(),
    tx.done,
  ]);
}

export function clearSettings() {
  localStorage.removeItem("arena_token");
  localStorage.removeItem("arena_user_slug");
}

export async function clearCache() {
  if (dbPromise) {
    const db = await dbPromise;
    db.close();
    dbPromise = null;
  }
  await deleteDB(DB_NAME);
}
