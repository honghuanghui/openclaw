/**
 * Scheduler Types for 24/7 Content Automation
 */

/** Schedule frequency options */
export type ScheduleFrequency =
  | "hourly"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom";

/** Day of week for weekly schedules */
export type DayOfWeek = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

/** Content generation task */
export interface ContentTask {
  id: string;
  name: string;
  description?: string;
  /** Content type to generate */
  contentType: string;
  /** Topic template or specific topic */
  topicTemplate: string;
  /** Target platforms */
  platforms: string[];
  /** Target audience */
  audience?: string;
  /** Content tone */
  tone?: string;
  /** Target word count */
  wordCount?: number;
  /** Language */
  language?: string;
  /** Additional requirements */
  requirements?: string[];
  /** Is task enabled */
  enabled: boolean;
  /** Creation timestamp */
  createdAt: number;
  /** Last updated timestamp */
  updatedAt: number;
}

/** Schedule configuration */
export interface Schedule {
  id: string;
  /** Associated task ID */
  taskId: string;
  /** Schedule name */
  name: string;
  /** Frequency type */
  frequency: ScheduleFrequency;
  /** Cron expression for custom schedules */
  cronExpression?: string;
  /** Time of day (HH:MM format) */
  timeOfDay?: string;
  /** Days of week for weekly schedules */
  daysOfWeek?: DayOfWeek[];
  /** Day of month for monthly schedules */
  dayOfMonth?: number;
  /** Timezone */
  timezone: string;
  /** Is schedule active */
  active: boolean;
  /** Last execution timestamp */
  lastRunAt?: number;
  /** Next scheduled execution */
  nextRunAt?: number;
  /** Creation timestamp */
  createdAt: number;
}

/** Scheduled job execution record */
export interface JobExecution {
  id: string;
  scheduleId: string;
  taskId: string;
  /** Workflow ID from content crew */
  workflowId?: string;
  /** Execution status */
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  /** Start timestamp */
  startedAt: number;
  /** End timestamp */
  completedAt?: number;
  /** Generated content ID */
  contentId?: string;
  /** Error message if failed */
  error?: string;
  /** Execution logs */
  logs: string[];
}

/** Topic generator configuration */
export interface TopicGenerator {
  id: string;
  name: string;
  /** Topic generation strategy */
  strategy: "trending" | "evergreen" | "seasonal" | "custom";
  /** Keywords to focus on */
  keywords?: string[];
  /** Topics to exclude */
  excludeKeywords?: string[];
  /** Custom prompt for topic generation */
  customPrompt?: string;
  /** Enabled status */
  enabled: boolean;
}

/** Platform configuration for content adaptation */
export interface PlatformConfig {
  id: string;
  name: string;
  /** Platform display name */
  displayName: string;
  /** Platform-specific word limits */
  maxWordCount?: number;
  /** Platform-specific formatting rules */
  formatRules?: string[];
  /** Required fields for this platform */
  requiredFields?: string[];
  /** Platform icon */
  icon?: string;
  /** Is platform enabled */
  enabled: boolean;
}

/** System status */
export interface SystemStatus {
  /** Is scheduler running */
  schedulerRunning: boolean;
  /** Active jobs count */
  activeJobs: number;
  /** Pending content count */
  pendingContent: number;
  /** Last activity timestamp */
  lastActivityAt?: number;
  /** System uptime in seconds */
  uptimeSeconds: number;
  /** Error count in last 24 hours */
  recentErrors: number;
}
