import type { ArenaChannel, ArenaBlock } from "../types";
import { upsertChannel, upsertBlock, upsertConnection, setMeta, markChannelDone } from "./db";

const BASE_URL = "https://api.are.na/v2";
const RATE_LIMIT_MS = 2000;

export function getToken(): string {
  const token = localStorage.getItem("arena_token");
  if (!token) throw new Error("Are.na access token not set");
  return token;
}

export function getUserSlug(): string {
  const slug = localStorage.getItem("arena_user_slug");
  if (!slug) throw new Error("Are.na user slug not set");
  return slug;
}

export function hasCredentials(): boolean {
  return !!localStorage.getItem("arena_token") && !!localStorage.getItem("arena_user_slug");
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function arenaFetch<T>(path: string, retries = 5): Promise<T> {
  const url = `${BASE_URL}${path}`;

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          Authorization: `Bearer ${getToken()}`,
        },
      });

      if (res.status === 429 || res.status >= 500) {
        const wait = Math.pow(2, attempt + 1) * 1000;
        console.log(`[Arena] ${res.status} on ${path}, retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        // Cloudflare 1015 rate limit
        if (res.status === 403 && body.includes("1015")) {
          const wait = Math.pow(2, attempt + 2) * 1000;
          console.log(`[Arena] Cloudflare rate limit on ${path}, retrying in ${wait}ms...`);
          await sleep(wait);
          continue;
        }
        throw new Error(`Are.na API error ${res.status}: ${body.slice(0, 200)}`);
      }

      return res.json() as Promise<T>;
    } catch (err) {
      if (err instanceof TypeError) {
        const wait = Math.pow(2, attempt + 1) * 1000;
        console.log(`[Arena] Network error on ${path}, retrying in ${wait}ms...`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
  }
  throw new Error(`Are.na API: max retries exceeded for ${path}`);
}

// ─── Fetch all user channels (paginated) ────────────────────────────

interface ChannelsResponse {
  channels: ArenaChannel[];
  total_pages: number;
  current_page: number;
}

export async function fetchAllChannels(): Promise<ArenaChannel[]> {
  const slug = getUserSlug();
  const all: ArenaChannel[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const data = await arenaFetch<ChannelsResponse>(`/users/${slug}/channels?page=${page}&per=50`);
    all.push(...data.channels);
    totalPages = data.total_pages;
    page++;
    if (page <= totalPages) await sleep(RATE_LIMIT_MS);
  }

  return all;
}

// ─── Fetch channel contents (paginated) ─────────────────────────────

interface ChannelContentsResponse {
  contents: (ArenaBlock | ArenaChannel)[];
  total_pages: number;
  current_page: number;
  length: number;
}

async function fetchChannelContents(
  slug: string,
  onProgress?: (blocksFetched: number, totalBlocks: number) => void,
): Promise<ArenaBlock[]> {
  const blocks: ArenaBlock[] = [];
  let page = 1;
  let totalPages = 1;

  while (page <= totalPages) {
    const data = await arenaFetch<ChannelContentsResponse>(
      `/channels/${slug}/contents?page=${page}&per=50`,
    );

    for (const item of data.contents) {
      if ("base_class" in item && item.base_class === "Block") {
        blocks.push(item as ArenaBlock);
      }
    }

    onProgress?.(blocks.length, data.length);
    totalPages = data.total_pages;
    page++;
    if (page <= totalPages) await sleep(RATE_LIMIT_MS);
  }

  return blocks;
}

// ─── Sync a single channel ──────────────────────────────────────────

export async function syncSingleChannel(
  channel: { id: number; slug: string; title: string; length: number },
  onProgress: (blocksFetched: number, totalBlocks: number) => void,
) {
  const blocks = await fetchChannelContents(channel.slug, onProgress);

  for (const block of blocks) {
    await upsertBlock({
      id: block.id,
      title: block.title,
      generated_title: block.generated_title,
      class: block.class,
      content: block.content,
      description: block.description,
      source_url: block.source?.url ?? null,
      source_provider: block.source?.provider?.name ?? null,
      image_thumb: block.image?.thumb?.url ?? null,
      image_display: block.image?.display?.url ?? null,
      state: block.state,
      created_at: block.created_at,
      updated_at: block.updated_at,
    });

    await upsertConnection({
      block_id: block.id,
      channel_id: channel.id,
      position: block.position ?? null,
      connected_at: block.connected_at ?? null,
    });
  }

  await markChannelDone(channel.id);
  await setMeta("last_sync", new Date().toISOString());
}

// ─── Save channel metadata to DB ────────────────────────────────────

export async function saveChannelMeta(ch: ArenaChannel) {
  await upsertChannel({
    id: ch.id,
    title: ch.title,
    slug: ch.slug,
    status: ch.status,
    length: ch.length,
    created_at: ch.created_at,
    updated_at: ch.updated_at,
    user_id: ch.user_id,
    metadata: JSON.stringify({
      kind: ch.kind,
      published: ch.published,
      open: ch.open,
      collaboration: ch.collaboration,
      follower_count: ch.follower_count,
    }),
  });
}
