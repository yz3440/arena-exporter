import { useState, useEffect, useCallback } from "react";
import { getAllChannels, getBlocksForExport, countBlocksForExport } from "../lib/db";
import { exportAsCsv, exportAsJson, exportAsSqlite, EXPORT_FIELDS, ALL_FIELD_KEYS, type ExportFieldKey } from "../lib/export";
import type { DbChannel } from "../types";

type ChannelRow = DbChannel & { block_count: number };

export default function ExportPanel({
  channelIds,
  onClose,
}: {
  channelIds: number[];
  onClose: () => void;
}) {
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set(channelIds));
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [matchCount, setMatchCount] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const [fields, setFields] = useState<Set<ExportFieldKey>>(new Set(ALL_FIELD_KEYS));

  useEffect(() => {
    getAllChannels().then(setChannels);
  }, []);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  // Prevent body scroll
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const updateCount = useCallback(async () => {
    if (selected.size === 0) {
      setMatchCount(null);
      return;
    }
    const count = await countBlocksForExport(
      Array.from(selected),
      dateFrom || undefined,
      dateTo || undefined,
    );
    setMatchCount(count);
  }, [selected, dateFrom, dateTo]);

  useEffect(() => {
    updateCount();
  }, [updateCount]);

  const toggleChannel = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleField = (key: ExportFieldKey) => {
    setFields((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        if (next.size === 1) return prev;
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const selectedFields = ALL_FIELD_KEYS.filter((k) => fields.has(k));

  const handleExport = async (format: "csv" | "json" | "sqlite") => {
    if (selected.size === 0) return;
    setExporting(true);
    try {
      const blocks = await getBlocksForExport(
        Array.from(selected),
        dateFrom || undefined,
        dateTo || undefined,
      );
      const timestamp = new Date().toISOString().slice(0, 10);
      if (format === "csv") {
        exportAsCsv(blocks, selectedFields, `arena-export-${timestamp}.csv`);
      } else if (format === "json") {
        exportAsJson(blocks, selectedFields, `arena-export-${timestamp}.json`);
      } else {
        await exportAsSqlite(blocks, selectedFields, `arena-export-${timestamp}.sqlite`);
      }
    } catch (err) {
      console.error("Export failed:", err);
    }
    setExporting(false);
  };

  const selectedChannels = channels.filter((ch) => selected.has(ch.id));

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-arena-bg w-full max-w-lg shadow-xl overflow-y-auto">
        <div className="p-6 space-y-6">
          {/* Header */}
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold tracking-tight">Export</h2>
            <button
              onClick={onClose}
              className="text-arena-text-muted hover:text-arena-text transition-colors p-1"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          {/* Channels */}
          <div className="space-y-2">
            <label className="text-[12px] text-arena-text-muted font-medium">
              Channels ({selectedChannels.length} selected)
            </label>
            <div className="max-h-48 overflow-y-auto border border-arena-border rounded bg-arena-white divide-y divide-arena-border">
              {channels.filter(ch => selected.has(ch.id) || channelIds.includes(ch.id)).map((ch) => (
                <label
                  key={ch.id}
                  className="flex items-center gap-3 px-3 py-2 text-[13px] hover:bg-arena-bg cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(ch.id)}
                    onChange={() => toggleChannel(ch.id)}
                    className="accent-arena-text shrink-0"
                  />
                  <span className="truncate">{ch.title}</span>
                  <span className="text-[11px] text-arena-text-muted ml-auto shrink-0">
                    {ch.block_count} blocks
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Date Range */}
          <div className="space-y-2">
            <label className="text-[12px] text-arena-text-muted font-medium">Date range</label>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="border border-arena-border rounded px-3 py-1.5 text-[13px] bg-arena-white focus:outline-none focus:border-arena-text transition-colors flex-1"
              />
              <span className="text-[12px] text-arena-text-muted">to</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="border border-arena-border rounded px-3 py-1.5 text-[13px] bg-arena-white focus:outline-none focus:border-arena-text transition-colors flex-1"
              />
              {(dateFrom || dateTo) && (
                <button
                  onClick={() => { setDateFrom(""); setDateTo(""); }}
                  className="text-[11px] text-arena-text-muted hover:text-arena-text transition-colors shrink-0"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          {/* Fields */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[12px] text-arena-text-muted font-medium">Fields</label>
              <button
                onClick={() => setFields(fields.size === ALL_FIELD_KEYS.length ? new Set(["id"]) : new Set(ALL_FIELD_KEYS))}
                className="text-[11px] text-arena-text-muted hover:text-arena-text transition-colors"
              >
                {fields.size === ALL_FIELD_KEYS.length ? "Deselect all" : "Select all"}
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_FIELD_KEYS.map((key) => (
                <button
                  key={key}
                  onClick={() => toggleField(key)}
                  className={`px-2.5 py-1 text-[12px] rounded border transition-colors ${
                    fields.has(key)
                      ? "border-arena-text bg-arena-text text-arena-white"
                      : "border-arena-border text-arena-text-muted hover:border-arena-text"
                  }`}
                >
                  {EXPORT_FIELDS[key]}
                </button>
              ))}
            </div>
          </div>

          {/* Export Buttons */}
          <div className="space-y-3 pt-2">
            {matchCount !== null && (
              <p className="text-[12px] text-arena-text-muted">
                {matchCount.toLocaleString()} block{matchCount !== 1 ? "s" : ""} matched
              </p>
            )}
            <div className="flex gap-2">
              <button
                onClick={() => handleExport("csv")}
                disabled={selected.size === 0 || exporting}
                className="flex-1 px-4 py-2.5 text-[13px] font-medium bg-arena-text text-arena-white rounded hover:bg-black transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                CSV
              </button>
              <button
                onClick={() => handleExport("json")}
                disabled={selected.size === 0 || exporting}
                className="flex-1 px-4 py-2.5 text-[13px] font-medium border border-arena-text text-arena-text rounded hover:bg-arena-bg-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                JSON
              </button>
              <button
                onClick={() => handleExport("sqlite")}
                disabled={selected.size === 0 || exporting}
                className="flex-1 px-4 py-2.5 text-[13px] font-medium border border-arena-text text-arena-text rounded hover:bg-arena-bg-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                SQLite
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
