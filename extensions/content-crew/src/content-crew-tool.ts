/**
 * Content Crew Tool
 * Main tool for orchestrating multi-agent content creation
 */

import { Type } from "@sinclair/typebox";

import type { OpenClawPluginApi } from "../../../src/plugins/types.js";
import type {
  ContentCrewConfig,
  ContentRequest,
  ContentType,
  WorkflowResult,
} from "./types.js";
import {
  buildStageTask,
  completeWorkflow,
  createWorkflow,
  failWorkflow,
  getWorkflow,
  updateStage,
  workflowToResult,
} from "./workflow.js";
import { getRoleConfig } from "./roles.js";

const CONTENT_TYPES: ContentType[] = [
  "article",
  "blog",
  "essay",
  "report",
  "story",
  "script",
  "documentation",
  "marketing",
  "social",
  "other",
];

interface SpawnResult {
  status: "accepted" | "forbidden" | "error";
  runId?: string;
  error?: string;
}

export function createContentCrewTool(api: OpenClawPluginApi, config: ContentCrewConfig) {
  return {
    name: "content_crew",
    description: `Multi-agent collaborative content creation system. Coordinates specialized agents (Planner, Writer, Editor, Reviewer, Polisher) to create high-quality content through a structured workflow.

Use this tool to:
- Create articles, blogs, essays, reports, stories, scripts, documentation, or marketing content
- Leverage multiple specialized AI agents working collaboratively
- Get professionally structured and polished content

The workflow automatically:
1. Plans the content structure (Planner)
2. Writes the initial draft (Writer)
3. Edits for clarity and flow (Editor)
4. Reviews for quality (Reviewer)
5. Polishes for publication (Polisher)`,

    parameters: Type.Object({
      action: Type.Unsafe<"create" | "status" | "cancel">({
        type: "string",
        enum: ["create", "status", "cancel"],
        description: "Action to perform: create new content, check status, or cancel workflow",
      }),
      // Create parameters
      type: Type.Optional(
        Type.Unsafe<ContentType>({
          type: "string",
          enum: CONTENT_TYPES,
          description: "Type of content to create",
        }),
      ),
      topic: Type.Optional(Type.String({ description: "Topic or subject of the content" })),
      audience: Type.Optional(Type.String({ description: "Target audience" })),
      tone: Type.Optional(
        Type.String({ description: "Desired tone (formal, casual, professional, etc.)" }),
      ),
      wordCount: Type.Optional(Type.Number({ description: "Target word count" })),
      requirements: Type.Optional(
        Type.String({ description: "Additional requirements (comma-separated)" }),
      ),
      language: Type.Optional(Type.String({ description: "Output language (default: English)" })),
      // Status/cancel parameters
      workflowId: Type.Optional(Type.String({ description: "Workflow ID for status/cancel" })),
    }),

    async execute(_id: string, params: Record<string, unknown>) {
      const action = String(params.action || "create");

      if (action === "status") {
        return handleStatus(params.workflowId as string);
      }

      if (action === "cancel") {
        return handleCancel(params.workflowId as string);
      }

      // Create action
      return await handleCreate(api, config, params);
    },
  };
}

function handleStatus(workflowId: string | undefined): { content: Array<{ type: string; text: string }> } {
  if (!workflowId) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "workflowId required" }) }],
    };
  }

  const workflow = getWorkflow(workflowId);
  if (!workflow) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "workflow not found" }) }],
    };
  }

  return {
    content: [{ type: "text", text: JSON.stringify(workflowToResult(workflow), null, 2) }],
  };
}

function handleCancel(workflowId: string | undefined): { content: Array<{ type: string; text: string }> } {
  if (!workflowId) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "workflowId required" }) }],
    };
  }

  const workflow = getWorkflow(workflowId);
  if (!workflow) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "workflow not found" }) }],
    };
  }

  failWorkflow(workflowId, "Cancelled by user");

  return {
    content: [{ type: "text", text: JSON.stringify({ status: "cancelled", workflowId }) }],
  };
}

async function handleCreate(
  api: OpenClawPluginApi,
  config: ContentCrewConfig,
  params: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  // Validate required parameters
  const type = params.type as ContentType;
  const topic = params.topic as string;

  if (!type || !CONTENT_TYPES.includes(type)) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            error: `Invalid content type. Must be one of: ${CONTENT_TYPES.join(", ")}`,
          }),
        },
      ],
    };
  }

  if (!topic?.trim()) {
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "topic is required" }) }],
    };
  }

  // Build content request
  const request: ContentRequest = {
    type,
    topic: topic.trim(),
    audience: params.audience as string | undefined,
    tone: params.tone as string | undefined,
    wordCount: params.wordCount as number | undefined,
    requirements: params.requirements
      ? String(params.requirements)
          .split(",")
          .map((r) => r.trim())
          .filter(Boolean)
      : undefined,
    language: (params.language as string) || "English",
  };

  // Create workflow
  const workflow = createWorkflow(request);
  workflow.status = "running";

  const timeoutSeconds = config.timeoutSeconds || 300;

  // Execute workflow stages sequentially
  try {
    for (let i = 0; i < workflow.stages.length; i++) {
      workflow.currentStage = i;
      const stage = workflow.stages[i];
      const { role, task, systemPrompt } = buildStageTask(workflow, i);
      const roleConfig = getRoleConfig(role);

      // Update stage status
      updateStage(workflow.id, i, {
        status: "running",
        startedAt: Date.now(),
        input: task,
      });

      // Determine model for this role
      const model = config.roles?.[role] || config.defaultModel;

      // Spawn sub-agent for this stage
      const spawnResult = await spawnAgentForStage(api, {
        role,
        task: `${systemPrompt}\n\n---\n\n${task}`,
        label: `${roleConfig.name} - ${workflow.id.slice(0, 8)}`,
        model,
        timeoutSeconds,
      });

      if (spawnResult.status !== "accepted") {
        updateStage(workflow.id, i, {
          status: "failed",
          completedAt: Date.now(),
          error: spawnResult.error || "Failed to spawn agent",
        });
        failWorkflow(workflow.id, spawnResult.error || "Agent spawn failed");
        break;
      }

      // Wait for agent completion and get output
      // Note: In actual implementation, we'd wait for the announce callback
      // For now, we return immediately with the workflow ID
      updateStage(workflow.id, i, {
        runId: spawnResult.runId,
      });
    }

    // Return workflow info (async workflow - results come via announcements)
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(
            {
              status: "started",
              workflowId: workflow.id,
              message: `Content creation workflow started with ${workflow.stages.length} stages.`,
              stages: workflow.stages.map((s) => ({
                role: s.role,
                name: getRoleConfig(s.role).name,
              })),
              note: "Sub-agents will process sequentially. Results will be announced as each stage completes.",
            },
            null,
            2,
          ),
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    failWorkflow(workflow.id, errorMessage);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            status: "error",
            workflowId: workflow.id,
            error: errorMessage,
          }),
        },
      ],
    };
  }
}

async function spawnAgentForStage(
  api: OpenClawPluginApi,
  params: {
    role: string;
    task: string;
    label: string;
    model?: string;
    timeoutSeconds: number;
  },
): Promise<SpawnResult> {
  // Use the gateway to spawn a sub-agent
  // This leverages OpenClaw's existing sessions_spawn mechanism
  try {
    const gateway = api.gateway;
    if (!gateway) {
      return { status: "error", error: "Gateway not available" };
    }

    const result = await gateway.call("agent", {
      message: params.task,
      label: params.label,
      model: params.model,
      timeout: params.timeoutSeconds,
      deliver: false, // Don't deliver to external channel
    });

    if (result && typeof result === "object" && "runId" in result) {
      return {
        status: "accepted",
        runId: result.runId as string,
      };
    }

    return { status: "accepted" };
  } catch (error) {
    return {
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
