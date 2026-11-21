/**
 * Shared formatting utilities.
 * Works in both server and client contexts.
 */

/** Human-readable byte formatting */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export { formatBytes };

const COMPACT_BYTE_UNITS = ["b", "kb", "mb", "gb", "tb"];

export function formatCompactBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 1) return "0 b";
  const unit = Math.min(Math.floor(Math.log2(bytes) / 10), COMPACT_BYTE_UNITS.length - 1);
  return `${Number((bytes / 1024 ** unit).toFixed(1))} ${COMPACT_BYTE_UNITS[unit]}`;
}
