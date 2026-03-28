/**
 * Content Queue Types
 */

/** Content status in the queue */
export type ContentStatus =
  | "draft"        // Initial draft from agents
  | "reviewing"    // Under review
  | "approved"     // Approved, ready for publishing
  | "rejected"     // Rejected, needs revision
  | "scheduled"    // Scheduled for publishing
  | "published"    // Already published
  | "archived";    // Archived

/** Content item in the queue */
export interface ContentItem {
  id: string;
  /** Task that generated this content */
  taskId?: string;
  /** Workflow ID from content crew */
  workflowId?: string;
  /** Content title */
  title: string;
  /** Content summary/excerpt */
  summary?: string;
  /** Full content body */
  body: string;
  /** Content type */
  contentType: string;
  /** Target platforms */
  platforms: string[];
  /** Platform-specific versions */
  platformVersions?: Record<string, PlatformContent>;
  /** Current status */
  status: ContentStatus;
  /** Tags/keywords */
  tags?: string[];
  /** SEO metadata */
  seo?: SEOMetadata;
  /** Media attachments */
  media?: MediaAttachment[];
  /** Review comments */
  reviewComments?: ReviewComment[];
  /** Scheduled publish time */
  scheduledAt?: number;
  /** Actual publish time */
  publishedAt?: number;
  /** Creation timestamp */
  createdAt: number;
  /** Last updated timestamp */
  updatedAt: number;
  /** Created by (agent or user) */
  createdBy: string;
  /** Priority (1-5, 1 is highest) */
  priority: number;
}

/** Platform-specific content version */
export interface PlatformContent {
  platform: string;
  title: string;
  body: string;
  /** Platform-specific formatting applied */
  formatted: boolean;
  /** Character/word count */
  wordCount: number;
  /** Platform-specific metadata */
  metadata?: Record<string, unknown>;
}

/** SEO metadata */
export interface SEOMetadata {
  metaTitle?: string;
  metaDescription?: string;
  keywords?: string[];
  canonicalUrl?: string;
  ogImage?: string;
}

/** Media attachment */
export interface MediaAttachment {
  id: string;
  type: "image" | "video" | "audio" | "document";
  url: string;
  filename: string;
  mimeType: string;
  size: number;
  alt?: string;
  caption?: string;
}

/** Review comment */
export interface ReviewComment {
  id: string;
  author: string;
  content: string;
  type: "comment" | "suggestion" | "approval" | "rejection";
  createdAt: number;
}

/** Content statistics */
export interface ContentStats {
  total: number;
  byStatus: Record<ContentStatus, number>;
  byPlatform: Record<string, number>;
  byContentType: Record<string, number>;
  todayCreated: number;
  weekCreated: number;
  monthCreated: number;
}

/** Queue filter options */
export interface QueueFilter {
  status?: ContentStatus[];
  platforms?: string[];
  contentTypes?: string[];
  dateFrom?: number;
  dateTo?: number;
  search?: string;
  tags?: string[];
  priority?: number[];
}

/** Queue sort options */
export interface QueueSort {
  field: "createdAt" | "updatedAt" | "scheduledAt" | "priority" | "title";
  direction: "asc" | "desc";
}

/** Pagination options */
export interface Pagination {
  page: number;
  pageSize: number;
  total?: number;
  totalPages?: number;
}

/** Queue query result */
export interface QueueResult {
  items: ContentItem[];
  pagination: Pagination;
  stats: ContentStats;
}
