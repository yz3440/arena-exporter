// ─── Are.na API Types ───────────────────────────────────────────────

export interface ArenaChannel {
  id: number;
  title: string;
  slug: string;
  status: "private" | "closed" | "public";
  length: number;
  created_at: string;
  updated_at: string;
  user_id: number;
  kind: "default" | "profile";
  published: boolean;
  open: boolean;
  collaboration: boolean;
  follower_count: number;
  user?: ArenaUser;
  contents?: (ArenaBlock | ArenaChannel)[];
  total_pages?: number;
  current_page?: number;
  per?: number;
}

export interface ArenaBlock {
  id: number;
  title: string | null;
  generated_title: string;
  class: "Image" | "Text" | "Link" | "Media" | "Attachment";
  base_class: "Block";
  content: string | null;
  content_html: string | null;
  description: string | null;
  description_html: string | null;
  source: {
    url: string;
    provider: { name: string; url: string };
  } | null;
  image: {
    filename: string;
    content_type: string;
    thumb: { url: string };
    display: { url: string };
    original: { url: string; file_size: number };
  } | null;
  state: "Available" | "Failure" | "Processed" | "Processing";
  user: ArenaUser;
  created_at: string;
  updated_at: string;
  comment_count: number;
  position?: number;
  selected?: boolean;
  connected_at?: string;
  connected_by_user_id?: number;
  connections?: ArenaChannel[];
}

export interface ArenaUser {
  id: number;
  slug: string;
  first_name: string;
  last_name: string;
  full_name: string;
  avatar: string;
  channel_count: number;
  following_count: number;
  follower_count: number;
  profile_id: number;
}

// ─── Local Storage Types ────────────────────────────────────────────

export interface DbChannel {
  id: number;
  title: string;
  slug: string;
  status: string;
  length: number;
  created_at: string;
  updated_at: string;
  user_id: number;
  metadata: string | null;
}

export interface DbBlock {
  id: number;
  title: string | null;
  generated_title: string | null;
  class: string;
  content: string | null;
  description: string | null;
  source_url: string | null;
  source_provider: string | null;
  image_thumb: string | null;
  image_display: string | null;
  state: string | null;
  created_at: string | null;
  updated_at: string | null;
}

export interface DbConnection {
  block_id: number;
  channel_id: number;
  position: number | null;
  connected_at: string | null;
}

export interface SyncProgress {
  phase: "channels" | "blocks" | "done" | "error";
  current: number;
  total: number;
  message: string;
}

export interface SyncStatus {
  channelCount: number;
  blockCount: number;
  connectionCount: number;
  lastSync: string | null;
}

export interface ChannelWithBlocks extends DbChannel {
  blocks: (DbBlock & { position: number | null; connected_at: string | null })[];
  block_count: number;
}

export interface ExportBlock extends DbBlock {
  channels: string[];
  connected_at: string | null;
}
