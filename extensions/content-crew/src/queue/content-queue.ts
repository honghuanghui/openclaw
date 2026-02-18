/**
 * Content Queue Manager
 * Manages content lifecycle from draft to published
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  ContentItem,
  ContentStats,
  ContentStatus,
  Pagination,
  QueueFilter,
  QueueResult,
  QueueSort,
  ReviewComment,
} from "./types.js";

/** In-memory content storage (with file persistence) */
let contentItems: Map<string, ContentItem> = new Map();

/** Storage file path */
let storagePath: string | null = null;

/** Initialize queue with storage path */
export function initQueue(dataDir: string): void {
  storagePath = path.join(dataDir, "content-queue.json");
  loadFromDisk();
}

/** Load content from disk */
function loadFromDisk(): void {
  if (!storagePath || !fs.existsSync(storagePath)) {
    return;
  }

  try {
    const data = fs.readFileSync(storagePath, "utf-8");
    const items = JSON.parse(data) as ContentItem[];
    contentItems = new Map(items.map((item) => [item.id, item]));
  } catch {
    // Ignore errors, start with empty queue
  }
}

/** Save content to disk */
function saveToDisk(): void {
  if (!storagePath) {
    return;
  }

  try {
    const items = Array.from(contentItems.values());
    const dir = path.dirname(storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(storagePath, JSON.stringify(items, null, 2));
  } catch {
    // Ignore errors
  }
}

/** Create a new content item */
export function createContent(
  content: Omit<ContentItem, "id" | "createdAt" | "updatedAt">,
): ContentItem {
  const now = Date.now();
  const item: ContentItem = {
    ...content,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };

  contentItems.set(item.id, item);
  saveToDisk();
  return item;
}

/** Get content by ID */
export function getContent(id: string): ContentItem | undefined {
  return contentItems.get(id);
}

/** Update content */
export function updateContent(
  id: string,
  updates: Partial<Omit<ContentItem, "id" | "createdAt">>,
): ContentItem | undefined {
  const item = contentItems.get(id);
  if (!item) {
    return undefined;
  }

  const updated: ContentItem = {
    ...item,
    ...updates,
    updatedAt: Date.now(),
  };

  contentItems.set(id, updated);
  saveToDisk();
  return updated;
}

/** Update content status */
export function updateContentStatus(
  id: string,
  status: ContentStatus,
): ContentItem | undefined {
  return updateContent(id, { status });
}

/** Add review comment */
export function addReviewComment(
  id: string,
  comment: Omit<ReviewComment, "id" | "createdAt">,
): ContentItem | undefined {
  const item = contentItems.get(id);
  if (!item) {
    return undefined;
  }

  const newComment: ReviewComment = {
    ...comment,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
  };

  const comments = [...(item.reviewComments || []), newComment];
  return updateContent(id, { reviewComments: comments });
}

/** Delete content */
export function deleteContent(id: string): boolean {
  const deleted = contentItems.delete(id);
  if (deleted) {
    saveToDisk();
  }
  return deleted;
}

/** Query content with filters */
export function queryContent(
  filter?: QueueFilter,
  sort?: QueueSort,
  pagination?: Partial<Pagination>,
): QueueResult {
  let items = Array.from(contentItems.values());

  // Apply filters
  if (filter) {
    if (filter.status && filter.status.length > 0) {
      items = items.filter((item) => filter.status!.includes(item.status));
    }
    if (filter.platforms && filter.platforms.length > 0) {
      items = items.filter((item) =>
        item.platforms.some((p) => filter.platforms!.includes(p)),
      );
    }
    if (filter.contentTypes && filter.contentTypes.length > 0) {
      items = items.filter((item) =>
        filter.contentTypes!.includes(item.contentType),
      );
    }
    if (filter.dateFrom) {
      items = items.filter((item) => item.createdAt >= filter.dateFrom!);
    }
    if (filter.dateTo) {
      items = items.filter((item) => item.createdAt <= filter.dateTo!);
    }
    if (filter.search) {
      const search = filter.search.toLowerCase();
      items = items.filter(
        (item) =>
          item.title.toLowerCase().includes(search) ||
          item.body.toLowerCase().includes(search) ||
          item.summary?.toLowerCase().includes(search),
      );
    }
    if (filter.tags && filter.tags.length > 0) {
      items = items.filter((item) =>
        item.tags?.some((t) => filter.tags!.includes(t)),
      );
    }
    if (filter.priority && filter.priority.length > 0) {
      items = items.filter((item) => filter.priority!.includes(item.priority));
    }
  }

  // Apply sorting
  const sortField = sort?.field || "createdAt";
  const sortDir = sort?.direction || "desc";

  items.sort((a, b) => {
    let aVal: number | string;
    let bVal: number | string;

    switch (sortField) {
      case "title":
        aVal = a.title;
        bVal = b.title;
        break;
      case "priority":
        aVal = a.priority;
        bVal = b.priority;
        break;
      case "updatedAt":
        aVal = a.updatedAt;
        bVal = b.updatedAt;
        break;
      case "scheduledAt":
        aVal = a.scheduledAt || 0;
        bVal = b.scheduledAt || 0;
        break;
      default:
        aVal = a.createdAt;
        bVal = b.createdAt;
    }

    if (typeof aVal === "string") {
      return sortDir === "asc"
        ? aVal.localeCompare(bVal as string)
        : (bVal as string).localeCompare(aVal);
    }

    return sortDir === "asc"
      ? (aVal as number) - (bVal as number)
      : (bVal as number) - (aVal as number);
  });

  // Calculate stats
  const stats = calculateStats(items);

  // Apply pagination
  const page = pagination?.page || 1;
  const pageSize = pagination?.pageSize || 20;
  const total = items.length;
  const totalPages = Math.ceil(total / pageSize);
  const start = (page - 1) * pageSize;
  const paginatedItems = items.slice(start, start + pageSize);

  return {
    items: paginatedItems,
    pagination: {
      page,
      pageSize,
      total,
      totalPages,
    },
    stats,
  };
}

/** Calculate content statistics */
function calculateStats(items: ContentItem[]): ContentStats {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  const weekMs = 7 * dayMs;
  const monthMs = 30 * dayMs;

  const byStatus: Record<ContentStatus, number> = {
    draft: 0,
    reviewing: 0,
    approved: 0,
    rejected: 0,
    scheduled: 0,
    published: 0,
    archived: 0,
  };

  const byPlatform: Record<string, number> = {};
  const byContentType: Record<string, number> = {};

  let todayCreated = 0;
  let weekCreated = 0;
  let monthCreated = 0;

  for (const item of items) {
    // By status
    byStatus[item.status]++;

    // By platform
    for (const platform of item.platforms) {
      byPlatform[platform] = (byPlatform[platform] || 0) + 1;
    }

    // By content type
    byContentType[item.contentType] =
      (byContentType[item.contentType] || 0) + 1;

    // Time-based
    const age = now - item.createdAt;
    if (age < dayMs) {
      todayCreated++;
    }
    if (age < weekMs) {
      weekCreated++;
    }
    if (age < monthMs) {
      monthCreated++;
    }
  }

  return {
    total: items.length,
    byStatus,
    byPlatform,
    byContentType,
    todayCreated,
    weekCreated,
    monthCreated,
  };
}

/** Get all content (for stats) */
export function getAllContent(): ContentItem[] {
  return Array.from(contentItems.values());
}

/** Get content ready for publishing */
export function getReadyToPublish(): ContentItem[] {
  return Array.from(contentItems.values()).filter(
    (item) => item.status === "approved" || item.status === "scheduled",
  );
}

/** Get pending review content */
export function getPendingReview(): ContentItem[] {
  return Array.from(contentItems.values()).filter(
    (item) => item.status === "draft" || item.status === "reviewing",
  );
}

/** Bulk update status */
export function bulkUpdateStatus(
  ids: string[],
  status: ContentStatus,
): number {
  let updated = 0;
  for (const id of ids) {
    if (updateContentStatus(id, status)) {
      updated++;
    }
  }
  return updated;
}

/** Archive old published content */
export function archiveOldContent(olderThanDays: number): number {
  const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
  let archived = 0;

  for (const item of contentItems.values()) {
    if (
      item.status === "published" &&
      item.publishedAt &&
      item.publishedAt < cutoff
    ) {
      updateContentStatus(item.id, "archived");
      archived++;
    }
  }

  return archived;
}
