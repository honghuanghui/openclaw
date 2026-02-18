import { describe, expect, it } from "vitest";

import type { ContentRequest } from "./types.js";
import {
  buildStageTask,
  completeWorkflow,
  createWorkflow,
  failWorkflow,
  getWorkflow,
  updateStage,
  workflowToResult,
} from "./workflow.js";

describe("Content Crew Workflow", () => {
  const sampleRequest: ContentRequest = {
    type: "article",
    topic: "Introduction to Machine Learning",
    audience: "Software developers",
    tone: "professional",
    wordCount: 2000,
    language: "English",
  };

  describe("createWorkflow", () => {
    it("should create a workflow with all stages", () => {
      const workflow = createWorkflow(sampleRequest);

      expect(workflow.id).toBeDefined();
      expect(workflow.request).toEqual(sampleRequest);
      expect(workflow.stages).toHaveLength(5);
      expect(workflow.stages.map((s) => s.role)).toEqual([
        "planner",
        "writer",
        "editor",
        "reviewer",
        "polisher",
      ]);
      expect(workflow.status).toBe("pending");
    });

    it("should initialize all stages as pending", () => {
      const workflow = createWorkflow(sampleRequest);

      for (const stage of workflow.stages) {
        expect(stage.status).toBe("pending");
      }
    });
  });

  describe("getWorkflow", () => {
    it("should retrieve an existing workflow", () => {
      const workflow = createWorkflow(sampleRequest);
      const retrieved = getWorkflow(workflow.id);

      expect(retrieved).toEqual(workflow);
    });

    it("should return undefined for non-existent workflow", () => {
      const retrieved = getWorkflow("non-existent-id");

      expect(retrieved).toBeUndefined();
    });
  });

  describe("updateStage", () => {
    it("should update stage status", () => {
      const workflow = createWorkflow(sampleRequest);
      const startTime = Date.now();

      updateStage(workflow.id, 0, {
        status: "running",
        startedAt: startTime,
      });

      const updated = getWorkflow(workflow.id);
      expect(updated?.stages[0].status).toBe("running");
      expect(updated?.stages[0].startedAt).toBe(startTime);
    });

    it("should update stage output", () => {
      const workflow = createWorkflow(sampleRequest);
      const output = "Generated content here";

      updateStage(workflow.id, 0, {
        status: "completed",
        output,
        completedAt: Date.now(),
      });

      const updated = getWorkflow(workflow.id);
      expect(updated?.stages[0].output).toBe(output);
    });
  });

  describe("buildStageTask", () => {
    it("should build planner task with request details", () => {
      const workflow = createWorkflow(sampleRequest);
      const { role, task, systemPrompt } = buildStageTask(workflow, 0);

      expect(role).toBe("planner");
      expect(task).toContain("Machine Learning");
      expect(task).toContain("Software developers");
      expect(task).toContain("professional");
      expect(systemPrompt).toContain("Content Planner");
    });

    it("should include previous outputs for later stages", () => {
      const workflow = createWorkflow(sampleRequest);

      // Simulate planner output
      updateStage(workflow.id, 0, {
        status: "completed",
        output: "## Outline\n1. Introduction\n2. Basics\n3. Conclusion",
      });

      const { task } = buildStageTask(workflow, 1); // Writer stage

      expect(task).toContain("Content Planner Output");
      expect(task).toContain("## Outline");
    });
  });

  describe("completeWorkflow", () => {
    it("should mark workflow as completed with final content", () => {
      const workflow = createWorkflow(sampleRequest);
      const finalContent = "Final polished article content";

      completeWorkflow(workflow.id, finalContent);

      const completed = getWorkflow(workflow.id);
      expect(completed?.status).toBe("completed");
      expect(completed?.finalContent).toBe(finalContent);
    });
  });

  describe("failWorkflow", () => {
    it("should mark workflow as failed with error", () => {
      const workflow = createWorkflow(sampleRequest);
      workflow.currentStage = 2;

      failWorkflow(workflow.id, "Agent timeout");

      const failed = getWorkflow(workflow.id);
      expect(failed?.status).toBe("failed");
      expect(failed?.stages[2].status).toBe("failed");
      expect(failed?.stages[2].error).toBe("Agent timeout");
    });
  });

  describe("workflowToResult", () => {
    it("should convert successful workflow to result", () => {
      const workflow = createWorkflow(sampleRequest);
      workflow.status = "completed";
      workflow.finalContent = "Final content";

      // Simulate completed stages
      for (let i = 0; i < workflow.stages.length; i++) {
        workflow.stages[i].status = "completed";
        workflow.stages[i].startedAt = Date.now() - 1000;
        workflow.stages[i].completedAt = Date.now();
      }

      const result = workflowToResult(workflow);

      expect(result.success).toBe(true);
      expect(result.workflowId).toBe(workflow.id);
      expect(result.content).toBe("Final content");
      expect(result.stages).toHaveLength(5);
    });

    it("should include error for failed workflow", () => {
      const workflow = createWorkflow(sampleRequest);
      workflow.status = "failed";
      workflow.currentStage = 1;
      workflow.stages[1].error = "Writer failed";

      const result = workflowToResult(workflow);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Writer failed");
    });
  });
});
