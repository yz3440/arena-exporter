import { useState, useEffect, useCallback } from "react";
import { getAllChannels, isChannelDone, getSyncStatus, clearSettings, clearCache } from "../lib/db";
import {
  fetchAllChannels,
  syncSingleChannel,
  saveChannelMeta,
  hasCredentials,
} from "../lib/arena";
import ChannelOverlay from "../components/ChannelOverlay";
import ExportPanel from "../components/ExportPanel";

interface WorkspaceChannel {
  id: number;
  title: string;
  slug: string;
  status: string;
  length: number;
  created_at: string;
  updated_at: string;
  user_id: number;
  isSynced: boolean;
  localBlockCount: number;
}

type SyncState = { current: number; total: number };

export default function Workspace() {
  const [channels, setChannels] = useState<WorkspaceChannel[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [syncingMap, setSyncingMap] = useState<Map<number, SyncState>>(new Map());
  const [syncErrors, setSyncErrors] = useState<Map<number, string>>(new Map());
  const [browseSlug, setBrowseSlug] = useState<string | null>(null);
  const [showExport, setShowExport] = useState(false);
  const [filter, setFilter] = useState("");
  const [syncFilter, setSyncFilter] = useState<"all" | "synced" | "not-synced">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"updated" | "title" | "blocks">("updated");
  const [hasCreds, setHasCreds] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Settings
  const [showSettings, setShowSettings] = useState(false);
  const [arenaToken, setArenaToken] = useState("");
  const [userSlug, setUserSlug] = useState("");

  // Stats
  const [stats, setStats] = useState({ channels: 0, blocks: 0, connections: 0, lastSync: null as string | null });

  const loadLocal = useCallback(async () => {
    const creds = hasCredentials();
    setHasCreds(creds);
    setUserSlug(localStorage.getItem("arena_user_slug") || "");
    if (!creds) {
      setShowSettings(true);
      return;
    }

    const local = await getAllChannels();
    const status = await getSyncStatus();
    setStats({
      channels: status.channelCount,
      blocks: status.blockCount,
      connections: status.connectionCount,
      lastSync: status.lastSync,
    });

    const result: WorkspaceChannel[] = [];
    for (const ch of local) {
      const synced = await isChannelDone(ch.id);
      result.push({
        id: ch.id,
        title: ch.title,
        slug: ch.slug,
        status: ch.status,
        length: ch.length,
        created_at: ch.created_at,
        updated_at: ch.updated_at,
        user_id: ch.user_id,
        isSynced: synced,
        localBlockCount: ch.block_count,
      });
    }
    setChannels(result);
  }, []);

  useEffect(() => {
    loadLocal();
  }, [loadLocal]);

  const handleSaveSettings = () => {
    if (arenaToken) localStorage.setItem("arena_token", arenaToken);
    if (userSlug) localStorage.setItem("arena_user_slug", userSlug);
    setArenaToken("");
    const creds = hasCredentials();
    setHasCreds(creds);
    if (creds) setShowSettings(false);
  };

  const handleFetchChannels = async () => {
    setFetching(true);
    setFetchError(null);
    try {
      const remote = await fetchAllChannels();

      // Save metadata to DB
      for (const ch of remote) {
        await saveChannelMeta(ch);
      }

      // Determine sync state for each
      const result: WorkspaceChannel[] = [];
      const local = await getAllChannels();
      const localBlockCounts = new Map(local.map((ch) => [ch.id, ch.block_count]));

      for (const ch of remote) {
        const synced = await isChannelDone(ch.id);
        result.push({
          id: ch.id,
          title: ch.title,
          slug: ch.slug,
          status: ch.status,
          length: ch.length,
          created_at: ch.created_at,
          updated_at: ch.updated_at,
          user_id: ch.user_id,
          isSynced: synced,
          localBlockCount: localBlockCounts.get(ch.id) || 0,
        });
      }

      setChannels(result);
      const s = await getSyncStatus();
      setStats({ channels: s.channelCount, blocks: s.blockCount, connections: s.connectionCount, lastSync: s.lastSync });
    } catch (err) {
      setFetchError(err instanceof Error ? err.message : "Failed to fetch channels");
    }
    setFetching(false);
  };

  const handleSyncChannel = async (ch: WorkspaceChannel) => {
    setSyncingMap((prev) => new Map(prev).set(ch.id, { current: 0, total: ch.length }));
    setSyncErrors((prev) => {
      const next = new Map(prev);
      next.delete(ch.id);
      return next;
    });

    try {
      await syncSingleChannel(
        { id: ch.id, slug: ch.slug, title: ch.title, length: ch.length },
        (current, total) => {
          setSyncingMap((prev) => new Map(prev).set(ch.id, { current, total }));
        },
      );

      // Mark as synced in local state
      setChannels((prev) =>
        prev.map((c) => (c.id === ch.id ? { ...c, isSynced: true, localBlockCount: ch.length } : c)),
      );
    } catch (err) {
      setSyncErrors((prev) => new Map(prev).set(ch.id, err instanceof Error ? err.message : "Sync failed"));
    }

    setSyncingMap((prev) => {
      const next = new Map(prev);
      next.delete(ch.id);
      return next;
    });

    // Refresh stats
    const s = await getSyncStatus();
    setStats({ channels: s.channelCount, blocks: s.blockCount, connections: s.connectionCount, lastSync: s.lastSync });
  };

  const handleSyncSelected = async () => {
    const toSync = channels.filter((ch) => selected.has(ch.id) && !ch.isSynced && !syncingMap.has(ch.id));
    for (const ch of toSync) {
      await handleSyncChannel(ch);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((c) => c.id)));
    }
  };

  // Filtering and sorting
  const filtered = channels
    .filter((ch) => {
      if (filter && !ch.title.toLowerCase().includes(filter.toLowerCase())) return false;
      if (statusFilter !== "all" && ch.status !== statusFilter) return false;
      if (syncFilter === "synced" && !ch.isSynced) return false;
      if (syncFilter === "not-synced" && ch.isSynced) return false;
      return true;
    })
    .sort((a, b) => {
      if (sortBy === "title") return a.title.localeCompare(b.title);
      if (sortBy === "blocks") return b.length - a.length;
      return b.updated_at.localeCompare(a.updated_at);
    });

  const syncedSelected = channels.filter((ch) => selected.has(ch.id) && ch.isSynced);
  const unsyncedSelected = channels.filter((ch) => selected.has(ch.id) && !ch.isSynced);
  const isSyncing = syncingMap.size > 0;

  // ─── No credentials ───────────────────────────────────────────
  if (!hasCreds && !showSettings) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <button
          onClick={() => setShowSettings(true)}
          className="text-[13px] text-arena-green hover:underline"
        >
          Connect your Are.na account to get started
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Settings Panel */}
      {showSettings && (
        <div className="border border-arena-border rounded bg-arena-white p-5 max-w-md">
          <h3 className="text-[14px] font-bold mb-1">Connect to Are.na</h3>
          <p className="text-[11px] text-arena-text-light mb-4">Your credentials are stored locally in your browser and are never sent to any external server.</p>
          <div className="space-y-3">
            <div>
              <label className="block text-[12px] text-arena-text-muted mb-1">
                User Slug
                {localStorage.getItem("arena_user_slug") && (
                  <span className="ml-2 text-arena-green">({localStorage.getItem("arena_user_slug")})</span>
                )}
              </label>
              <input
                type="text"
                value={userSlug}
                onChange={(e) => setUserSlug(e.target.value.replace(/\s+/g, "-"))}
                placeholder="your-username"
                className="w-full border border-arena-border rounded px-3 py-2 text-[13px] bg-arena-white focus:outline-none focus:border-arena-text transition-colors"
              />
            </div>
            <div>
              <label className="block text-[12px] text-arena-text-muted mb-1">
                Access Token
                {localStorage.getItem("arena_token") && <span className="ml-2 text-arena-green">saved</span>}
              </label>
              <input
                type="password"
                value={arenaToken}
                onChange={(e) => setArenaToken(e.target.value)}
                placeholder={localStorage.getItem("arena_token") ? "*** saved ***" : "Paste token"}
                className="w-full border border-arena-border rounded px-3 py-2 text-[13px] bg-arena-white focus:outline-none focus:border-arena-text transition-colors"
              />
              <p className="text-[11px] text-arena-text-light mt-1">
                A personal token to authenticate with the{" "}
                <a href="https://www.are.na/developers/explore" target="_blank" rel="noopener noreferrer" className="text-arena-green hover:underline">
                  Are.na API
                </a>
                . Get one from{" "}
                <a href="https://dev.are.na/oauth/applications" target="_blank" rel="noopener noreferrer" className="text-arena-green hover:underline">
                  dev.are.na/oauth/applications
                </a>
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleSaveSettings}
                className="px-4 py-2 text-[13px] font-medium bg-arena-text text-arena-white rounded hover:bg-black transition-colors"
              >
                Save
              </button>
              {hasCreds && (
                <button
                  onClick={() => setShowSettings(false)}
                  className="px-4 py-2 text-[13px] text-arena-text-muted hover:text-arena-text transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
            {hasCreds && (
              <div className="border-t border-arena-border pt-3 mt-1 space-y-2">
                <p className="text-[11px] text-arena-text-light">These actions only affect data stored in your browser. Nothing on Are.na will be changed or deleted.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => {
                      if (!confirm("Remove your saved token and slug from this browser?")) return;
                      clearSettings();
                      window.location.reload();
                    }}
                    className="px-3 py-1.5 text-[12px] text-red-500 border border-red-300 rounded hover:bg-red-50 transition-colors"
                  >
                    Delete Settings
                  </button>
                  <button
                    onClick={async () => {
                      if (!confirm("Delete all synced channels and blocks from this browser?")) return;
                      await clearCache();
                      window.location.reload();
                    }}
                    className="px-3 py-1.5 text-[12px] text-red-500 border border-red-300 rounded hover:bg-red-50 transition-colors"
                  >
                    Delete Cache
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Header Bar */}
      {hasCreds && !showSettings && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-4">
            <button
              onClick={handleFetchChannels}
              disabled={fetching}
              className="px-4 py-2 text-[13px] font-medium bg-arena-text text-arena-white rounded hover:bg-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {fetching ? "Fetching..." : channels.length === 0 ? "Fetch My Channels" : "Refresh Channels"}
            </button>
            {stats.blocks > 0 && (
              <div className="flex gap-4 text-[12px] text-arena-text-muted">
                <span>{stats.channels} channels</span>
                <span>{stats.blocks.toLocaleString()} blocks</span>
                {stats.lastSync && (
                  <span>Last sync {new Date(stats.lastSync).toLocaleDateString()}</span>
                )}
              </div>
            )}
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="text-[12px] text-arena-text-muted hover:text-arena-text transition-colors"
          >
            Settings
          </button>
        </div>
      )}

      {fetchError && (
        <div className="border border-arena-red/30 bg-arena-red/5 rounded px-4 py-3 text-[13px] text-arena-red">
          {fetchError}
        </div>
      )}

      {/* Empty state */}
      {hasCreds && !showSettings && channels.length === 0 && !fetching && (
        <div className="text-center py-16">
          <p className="text-arena-text-muted text-[14px]">
            No channels loaded yet.
          </p>
          <p className="text-arena-text-light text-[13px] mt-1">
            Click "Fetch My Channels" to pull your channel list from Are.na.
          </p>
        </div>
      )}

      {/* Filters */}
      {channels.length > 0 && (
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Search channels..."
            className="border border-arena-border rounded px-3 py-1.5 text-[13px] bg-arena-white focus:outline-none focus:border-arena-text transition-colors w-56"
          />

          <div className="flex gap-1">
            {(["all", "synced", "not-synced"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSyncFilter(s)}
                className={`px-2.5 py-1 text-[12px] rounded transition-colors ${
                  syncFilter === s
                    ? "bg-arena-text text-arena-white"
                    : "text-arena-text-muted hover:text-arena-text hover:bg-arena-bg-hover"
                }`}
              >
                {s === "all" ? "All" : s === "synced" ? "Synced" : "Not synced"}
              </button>
            ))}
          </div>

          <div className="flex gap-1">
            {(["all", "public", "closed", "private"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1 text-[12px] rounded transition-colors ${
                  statusFilter === s
                    ? "bg-arena-text text-arena-white"
                    : "text-arena-text-muted hover:text-arena-text hover:bg-arena-bg-hover"
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="border border-arena-border rounded px-2 py-1 text-[12px] bg-arena-white focus:outline-none focus:border-arena-text transition-colors"
          >
            <option value="updated">Recently updated</option>
            <option value="title">Title A-Z</option>
            <option value="blocks">Most blocks</option>
          </select>

          <span className="text-[12px] text-arena-text-muted ml-auto">
            {filtered.length} of {channels.length}
          </span>
        </div>
      )}

      {/* Channel Grid */}
      {filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {filtered.map((ch) => (
            <ChannelCard
              key={ch.id}
              channel={ch}
              isSelected={selected.has(ch.id)}
              syncState={syncingMap.get(ch.id)}
              syncError={syncErrors.get(ch.id)}
              onSelect={() => toggleSelect(ch.id)}
              onSync={() => handleSyncChannel(ch)}
              onBrowse={() => setBrowseSlug(ch.slug)}
            />
          ))}
        </div>
      )}

      {/* Floating Toolbar */}
      {selected.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-arena-text text-arena-white rounded-lg shadow-lg px-5 py-3 flex items-center gap-4 z-40">
          <span className="text-[13px]">
            {selected.size} selected
          </span>

          {unsyncedSelected.length > 0 && (
            <button
              onClick={handleSyncSelected}
              disabled={isSyncing}
              className="px-3 py-1.5 text-[12px] font-medium bg-arena-green rounded hover:bg-arena-green-hover transition-colors disabled:opacity-50"
            >
              Sync {unsyncedSelected.length} channel{unsyncedSelected.length !== 1 ? "s" : ""}
            </button>
          )}

          {syncedSelected.length > 0 && (
            <button
              onClick={() => setShowExport(true)}
              className="px-3 py-1.5 text-[12px] font-medium bg-white text-arena-text rounded hover:bg-arena-bg transition-colors"
            >
              Export {syncedSelected.length} channel{syncedSelected.length !== 1 ? "s" : ""}
            </button>
          )}

          <button onClick={selectAll} className="text-[12px] text-white/60 hover:text-white transition-colors ml-1">
            {selected.size === filtered.length ? "Deselect all" : "Select all"}
          </button>

          <button
            onClick={() => setSelected(new Set())}
            className="text-[12px] text-white/60 hover:text-white transition-colors"
          >
            Clear
          </button>
        </div>
      )}

      {/* Channel Browse Overlay */}
      {browseSlug && (
        <ChannelOverlay slug={browseSlug} onClose={() => setBrowseSlug(null)} />
      )}

      {/* Export Panel */}
      {showExport && (
        <ExportPanel
          channelIds={Array.from(selected).filter((id) => channels.find((c) => c.id === id)?.isSynced)}
          onClose={() => setShowExport(false)}
        />
      )}
    </div>
  );
}

// ─── Channel Card ─────────────────────────────────────────────────

function ChannelCard({
  channel,
  isSelected,
  syncState,
  syncError,
  onSelect,
  onSync,
  onBrowse,
}: {
  channel: WorkspaceChannel;
  isSelected: boolean;
  syncState?: SyncState;
  syncError?: string;
  onSelect: () => void;
  onSync: () => void;
  onBrowse: () => void;
}) {
  const isSyncing = !!syncState;
  const progress = syncState ? (syncState.total > 0 ? syncState.current / syncState.total : 0) : 0;

  const statusColors: Record<string, string> = {
    private: "bg-arena-text text-arena-white",
    closed: "bg-arena-yellow/20 text-arena-yellow",
    public: "bg-arena-green/15 text-arena-green",
  };

  return (
    <div
      onClick={onSelect}
      className={`relative border rounded bg-arena-white px-4 py-3 cursor-pointer select-none transition-all ${
        isSelected
          ? "border-arena-green ring-1 ring-arena-green/30 bg-arena-green/[0.02]"
          : "border-arena-border hover:border-arena-border-dark"
      } ${isSyncing ? "syncing-pulse" : ""}`}
    >
      {/* Selection indicator */}
      <div
        className={`absolute top-3 right-3 w-4 h-4 rounded-full border-2 transition-colors flex items-center justify-center ${
          isSelected ? "border-arena-green bg-arena-green" : "border-arena-border"
        }`}
      >
        {isSelected && (
          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
            <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </div>

      {/* Title */}
      <h3 className="text-[14px] font-medium leading-snug pr-6 line-clamp-2">{channel.title}</h3>

      {/* Meta */}
      <div className="mt-2 flex items-center gap-2 text-[11px] text-arena-text-muted">
        <span>{channel.length} blocks</span>
        <span
          className={`inline-block px-1.5 py-0.5 text-[10px] rounded-sm ${statusColors[channel.status] || "bg-arena-border text-arena-text-muted"}`}
        >
          {channel.status}
        </span>
      </div>

      {/* Sync State */}
      <div className="mt-3 flex items-center justify-between">
        {isSyncing ? (
          <div className="w-full space-y-1">
            <div className="w-full bg-arena-border rounded-sm h-1.5 overflow-hidden">
              <div
                className="h-full bg-arena-green transition-all duration-300"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <span className="text-[11px] text-arena-text-muted">
              Syncing... {syncState.current}/{syncState.total}
            </span>
          </div>
        ) : syncError ? (
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] text-arena-red truncate max-w-[60%]" title={syncError}>
              Failed
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onSync(); }}
              className="text-[12px] text-arena-text-muted hover:text-arena-text transition-colors"
            >
              Retry
            </button>
          </div>
        ) : channel.isSynced ? (
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] text-arena-green flex items-center gap-1">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-arena-green" />
              Synced
              {channel.localBlockCount > 0 && (
                <span className="text-arena-text-muted ml-1">({channel.localBlockCount})</span>
              )}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); onBrowse(); }}
              className="text-[12px] font-medium text-arena-text-muted hover:text-arena-text transition-colors"
            >
              Browse
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between w-full">
            <span className="text-[11px] text-arena-text-light">Not synced</span>
            <button
              onClick={(e) => { e.stopPropagation(); onSync(); }}
              className="text-[12px] font-medium text-arena-text-muted hover:text-arena-green transition-colors"
            >
              Sync
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
