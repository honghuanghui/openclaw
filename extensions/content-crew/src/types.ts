/**
 * Content Crew Multi-Agent System Types
 */

/** Agent role identifiers */
export type AgentRole = "planner" | "writer" | "editor" | "reviewer" | "polisher";

/** Content type categories */
export type ContentType =
  | "article"
  | "blog"
  | "essay"
  | "report"
  | "story"
  | "script"
  | "documentation"
  | "marketing"
  | "social"
  | "other";

/** Content creation request */
export interface ContentRequest {
  /** Type of content to create */
  type: ContentType;
  /** Topic or subject */
  topic: string;
  /** Target audience */
  audience?: string;
  /** Desired tone (formal, casual, professional, etc.) */
  tone?: string;
  /** Target word count */
  wordCount?: number;
  /** Additional requirements or constraints */
  requirements?: string[];
  /** Reference materials or sources */
  references?: string[];
  /** Output language */
  language?: string;
}

/** Workflow stage status */
export type StageStatus = "pending" | "running" | "completed" | "failed" | "skipped";

/** Individual workflow stage */
export interface WorkflowStage {
  role: AgentRole;
  status: StageStatus;
  startedAt?: number;
  completedAt?: number;
  input?: string;
  output?: string;
  error?: string;
  runId?: string;
}

/** Complete workflow state */
export interface WorkflowState {
  id: string;
  request: ContentRequest;
  stages: WorkflowStage[];
  currentStage: number;
  status: "pending" | "running" | "completed" | "failed";
  createdAt: number;
  updatedAt: number;
  finalContent?: string;
}

/** Agent task definition */
export interface AgentTask {
  role: AgentRole;
  systemPrompt: string;
  task: string;
  context?: Record<string, string>;
  model?: string;
  timeoutSeconds?: number;
}

/** Role configuration */
export interface RoleConfig {
  name: string;
  description: string;
  systemPrompt: string;
  model?: string;
}

/** Plugin configuration */
export interface ContentCrewConfig {
  defaultModel?: string;
  roles?: Partial<Record<AgentRole, string>>;
  maxConcurrentAgents?: number;
  timeoutSeconds?: number;
  outputDir?: string;
}

/** Workflow result */
export interface WorkflowResult {
  success: boolean;
  workflowId: string;
  content?: string;
  stages: Array<{
    role: AgentRole;
    status: StageStatus;
    duration?: number;
  }>;
  error?: string;
  totalDuration: number;
}
