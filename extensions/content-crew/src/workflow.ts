/**
 * Workflow Orchestration for Content Crew
 * Manages the sequential execution of agent roles
 */

import crypto from "node:crypto";

import type {
  AgentRole,
  ContentCrewConfig,
  ContentRequest,
  StageStatus,
  WorkflowResult,
  WorkflowStage,
  WorkflowState,
} from "./types.js";
import { getDefaultWorkflowSequence, getRoleConfig } from "./roles.js";

/** In-memory workflow storage */
const workflows = new Map<string, WorkflowState>();

/** Create a new workflow instance */
export function createWorkflow(request: ContentRequest): WorkflowState {
  const id = crypto.randomUUID();
  const sequence = getDefaultWorkflowSequence();

  const stages: WorkflowStage[] = sequence.map((role) => ({
    role,
    status: "pending" as StageStatus,
  }));

  const workflow: WorkflowState = {
    id,
    request,
    stages,
    currentStage: 0,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  workflows.set(id, workflow);
  return workflow;
}

/** Get workflow by ID */
export function getWorkflow(id: string): WorkflowState | undefined {
  return workflows.get(id);
}

/** Update workflow stage */
export function updateStage(
  workflowId: string,
  stageIndex: number,
  update: Partial<WorkflowStage>,
): void {
  const workflow = workflows.get(workflowId);
  if (!workflow || stageIndex >= workflow.stages.length) {
    return;
  }

  workflow.stages[stageIndex] = {
    ...workflow.stages[stageIndex],
    ...update,
  };
  workflow.updatedAt = Date.now();
}

/** Mark workflow as completed */
export function completeWorkflow(workflowId: string, finalContent: string): void {
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    return;
  }

  workflow.status = "completed";
  workflow.finalContent = finalContent;
  workflow.updatedAt = Date.now();
}

/** Mark workflow as failed */
export function failWorkflow(workflowId: string, error: string): void {
  const workflow = workflows.get(workflowId);
  if (!workflow) {
    return;
  }

  workflow.status = "failed";
  workflow.stages[workflow.currentStage].status = "failed";
  workflow.stages[workflow.currentStage].error = error;
  workflow.updatedAt = Date.now();
}

/** Build task prompt for a specific stage */
export function buildStageTask(
  workflow: WorkflowState,
  stageIndex: number,
): { role: AgentRole; task: string; systemPrompt: string } {
  const stage = workflow.stages[stageIndex];
  const roleConfig = getRoleConfig(stage.role);
  const request = workflow.request;

  // Build context from previous stages
  const previousOutputs: string[] = [];
  for (let i = 0; i < stageIndex; i++) {
    const prevStage = workflow.stages[i];
    if (prevStage.output) {
      previousOutputs.push(`## ${getRoleConfig(prevStage.role).name} Output:\n${prevStage.output}`);
    }
  }

  // Build the task based on role
  let task: string;

  switch (stage.role) {
    case "planner":
      task = buildPlannerTask(request);
      break;
    case "writer":
      task = buildWriterTask(request, previousOutputs);
      break;
    case "editor":
      task = buildEditorTask(request, previousOutputs);
      break;
    case "reviewer":
      task = buildReviewerTask(request, previousOutputs);
      break;
    case "polisher":
      task = buildPolisherTask(request, previousOutputs);
      break;
    default:
      task = `Process the content according to your role.`;
  }

  return {
    role: stage.role,
    task,
    systemPrompt: roleConfig.systemPrompt,
  };
}

function buildPlannerTask(request: ContentRequest): string {
  const parts = [
    `Create a detailed content plan for the following request:`,
    ``,
    `**Content Type:** ${request.type}`,
    `**Topic:** ${request.topic}`,
  ];

  if (request.audience) {
    parts.push(`**Target Audience:** ${request.audience}`);
  }
  if (request.tone) {
    parts.push(`**Desired Tone:** ${request.tone}`);
  }
  if (request.wordCount) {
    parts.push(`**Target Word Count:** ${request.wordCount}`);
  }
  if (request.language) {
    parts.push(`**Language:** ${request.language}`);
  }
  if (request.requirements && request.requirements.length > 0) {
    parts.push(`**Requirements:**`);
    for (const req of request.requirements) {
      parts.push(`- ${req}`);
    }
  }
  if (request.references && request.references.length > 0) {
    parts.push(`**Reference Materials:**`);
    for (const ref of request.references) {
      parts.push(`- ${ref}`);
    }
  }

  parts.push(``);
  parts.push(`Please create a comprehensive outline and plan for this content.`);

  return parts.join("\n");
}

function buildWriterTask(request: ContentRequest, previousOutputs: string[]): string {
  const parts = [
    `Write the content based on the following plan and requirements:`,
    ``,
    ...previousOutputs,
    ``,
    `**Original Request:**`,
    `- Type: ${request.type}`,
    `- Topic: ${request.topic}`,
  ];

  if (request.wordCount) {
    parts.push(`- Target Word Count: ${request.wordCount}`);
  }
  if (request.tone) {
    parts.push(`- Tone: ${request.tone}`);
  }
  if (request.language) {
    parts.push(`- Language: ${request.language}`);
  }

  parts.push(``);
  parts.push(`Write the complete content following the plan above.`);

  return parts.join("\n");
}

function buildEditorTask(request: ContentRequest, previousOutputs: string[]): string {
  const parts = [
    `Edit and improve the following content:`,
    ``,
    ...previousOutputs,
    ``,
    `**Editing Guidelines:**`,
    `- Maintain the ${request.tone || "professional"} tone`,
    `- Ensure clarity and readability`,
    `- Improve flow and transitions`,
    `- Target audience: ${request.audience || "general"}`,
    ``,
    `Output the fully edited content.`,
  ];

  return parts.join("\n");
}

function buildReviewerTask(request: ContentRequest, previousOutputs: string[]): string {
  const parts = [
    `Review the following content for quality and completeness:`,
    ``,
    ...previousOutputs,
    ``,
    `**Review Criteria:**`,
    `- Content type: ${request.type}`,
    `- Topic coverage: ${request.topic}`,
    `- Target audience: ${request.audience || "general"}`,
    `- Required tone: ${request.tone || "professional"}`,
  ];

  if (request.requirements && request.requirements.length > 0) {
    parts.push(`- Requirements to verify:`);
    for (const req of request.requirements) {
      parts.push(`  - ${req}`);
    }
  }

  parts.push(``);
  parts.push(`Provide your review with a quality score and decision (APPROVE/REVISE/REJECT).`);

  return parts.join("\n");
}

function buildPolisherTask(request: ContentRequest, previousOutputs: string[]): string {
  const parts = [
    `Polish the following content for final publication:`,
    ``,
    ...previousOutputs,
    ``,
    `**Final Polish Requirements:**`,
    `- Fix all grammar and spelling errors`,
    `- Optimize word choice`,
    `- Ensure consistent formatting`,
    `- Language: ${request.language || "English"}`,
    ``,
    `Output the final, publication-ready content.`,
  ];

  return parts.join("\n");
}

/** Convert workflow to result */
export function workflowToResult(workflow: WorkflowState): WorkflowResult {
  const stages = workflow.stages.map((stage) => ({
    role: stage.role,
    status: stage.status,
    duration:
      stage.startedAt && stage.completedAt ? stage.completedAt - stage.startedAt : undefined,
  }));

  return {
    success: workflow.status === "completed",
    workflowId: workflow.id,
    content: workflow.finalContent,
    stages,
    error: workflow.status === "failed" ? workflow.stages[workflow.currentStage]?.error : undefined,
    totalDuration: Date.now() - workflow.createdAt,
  };
}

/** Clean up old workflows */
export function cleanupWorkflows(maxAgeMs: number = 3600000): void {
  const now = Date.now();
  for (const [id, workflow] of workflows) {
    if (now - workflow.updatedAt > maxAgeMs) {
      workflows.delete(id);
    }
  }
}
