import { useState, useEffect } from "react";
import { getChannelBySlug } from "../lib/db";
import type { ChannelWithBlocks, DbBlock } from "../types";

export default function ChannelOverlay({
  slug,
  onClose,
}: {
  slug: string;
  onClose: () => void;
}) {
  const [channel, setChannel] = useState<ChannelWithBlocks | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getChannelBySlug(slug).then((data) => {
      setChannel(data);
      setLoading(false);
    });
  }, [slug]);

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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-arena-bg w-full max-w-5xl mx-4 mt-12 mb-12 rounded-lg shadow-xl overflow-hidden max-h-[calc(100vh-96px)] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-arena-border bg-arena-white shrink-0">
          {loading ? (
            <div className="text-[13px] text-arena-text-muted">Loading...</div>
          ) : channel ? (
            <div>
              <h2 className="text-lg font-bold tracking-tight">{channel.title}</h2>
              <div className="flex items-center gap-4 mt-0.5 text-[12px] text-arena-text-muted">
                <span>{channel.block_count} blocks</span>
                <span className="capitalize">{channel.status}</span>
                <span>Updated {new Date(channel.updated_at).toLocaleDateString()}</span>
              </div>
            </div>
          ) : (
            <div className="text-[13px] text-arena-text-muted">Channel not found</div>
          )}
          <button
            onClick={onClose}
            className="text-arena-text-muted hover:text-arena-text transition-colors p-1"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M5 5L15 15M15 5L5 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 p-6">
          {loading ? (
            <div className="text-[13px] text-arena-text-muted py-12 text-center">
              Loading blocks...
            </div>
          ) : channel && channel.blocks.length > 0 ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {channel.blocks.map((block) => (
                <BlockCard key={block.id} block={block} />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-arena-text-muted py-12 text-center">
              No blocks in this channel.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function BlockCard({
  block,
}: {
  block: DbBlock & { position: number | null; connected_at: string | null };
}) {
  const title = block.title || block.generated_title || "(untitled)";
  const isImage = block.class === "Image" && block.image_display;
  const isLink = block.class === "Link";
  const isText = block.class === "Text";

  return (
    <div className="border border-arena-border rounded bg-arena-white overflow-hidden group hover:border-arena-border-dark transition-colors">
      {(isImage || (isLink && block.image_thumb)) && (
        <div className="aspect-square bg-arena-bg overflow-hidden">
          <img
            src={block.image_display || block.image_thumb || ""}
            alt={title}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {isText && block.content && (
        <div className="aspect-square bg-arena-bg p-3 overflow-hidden">
          <p className="text-[11px] leading-relaxed text-arena-text-muted line-clamp-8">
            {block.content}
          </p>
        </div>
      )}

      {!isImage && !isText && !(isLink && block.image_thumb) && (
        <div className="aspect-square bg-arena-bg flex items-center justify-center">
          <span className="text-[11px] text-arena-text-light">{block.class}</span>
        </div>
      )}

      <div className="px-3 py-2 border-t border-arena-border">
        <p className="text-[12px] leading-tight truncate" title={title}>
          {title}
        </p>
        {block.source_url && (
          <p className="text-[10px] text-arena-text-muted mt-0.5 truncate">
            {(() => { try { return new URL(block.source_url).hostname; } catch { return block.source_url; } })()}
          </p>
        )}
      </div>
    </div>
  );
}
