/**
 * Content Crew - Multi-Agent Collaborative Content Creation
 *
 * This plugin provides a multi-agent system for content creation,
 * with specialized roles for planning, writing, editing, reviewing,
 * and polishing content.
 *
 * Features:
 * - 5 specialized agent roles (Planner, Writer, Editor, Reviewer, Polisher)
 * - 24/7 automated content scheduling
 * - Content queue management with approval workflow
 * - Web UI dashboard for system management
 */

import path from "node:path";
import os from "node:os";

import type { OpenClawPluginApi } from "../../src/plugins/types.js";

import { createContentCrewTool } from "./src/content-crew-tool.js";
import { startServer, stopServer } from "./src/api/server.js";
import * as scheduler from "./src/scheduler/scheduler.js";
import * as queue from "./src/queue/content-queue.js";
import type { ContentCrewConfig } from "./src/types.js";

/** Extended configuration with server options */
interface ExtendedConfig extends ContentCrewConfig {
  server?: {
    enabled?: boolean;
    port?: number;
    host?: string;
  };
  dataDir?: string;
}

export default function register(api: OpenClawPluginApi) {
  // Get plugin configuration
  const config = (api.config?.plugins?.["content-crew"] || {}) as ExtendedConfig;

  // Data directory for persistence
  const dataDir = config.dataDir || path.join(os.homedir(), ".openclaw", "content-crew");

  // Initialize queue and scheduler
  queue.initQueue(dataDir);
  scheduler.initScheduler(dataDir);

  // Set up execution callback to connect scheduler with content generation
  scheduler.setExecuteCallback(async (task, _schedule) => {
    try {
      // Create content using the content crew workflow
      const content = queue.createContent({
        title: `${task.name} - ${new Date().toLocaleDateString("zh-CN")}`,
        body: "",
        contentType: task.contentType,
        platforms: task.platforms,
        status: "draft",
        priority: 3,
        createdBy: "scheduler",
        taskId: task.id,
      });

      return {
        contentId: content.id,
      };
    } catch (error) {
      return {
        error: error instanceof Error ? error.message : String(error),
      };
    }
  });

  // Register the content creation tool
  api.registerTool(
    (ctx) => {
      // Only available in non-sandboxed contexts
      if (ctx.sandboxed) {
        return null;
      }
      return createContentCrewTool(api, config);
    },
    { optional: true },
  );

  // Start API server if enabled
  if (config.server?.enabled !== false) {
    const serverConfig = {
      port: config.server?.port || 3847,
      host: config.server?.host || "127.0.0.1",
      dataDir,
      staticDir: path.join(import.meta.dirname, "src", "web"),
    };

    try {
      startServer(serverConfig);
      api.logger?.info?.(`Content Crew Web UI: http://${serverConfig.host}:${serverConfig.port}`);
    } catch (error) {
      api.logger?.warn?.(`Failed to start Content Crew server: ${error}`);
    }
  }

  // Start scheduler
  scheduler.startScheduler();

  // Log registration
  api.logger?.info?.("Content Crew plugin registered with scheduler and Web UI");

  // Cleanup on shutdown
  process.on("SIGTERM", () => {
    scheduler.stopScheduler();
    stopServer();
  });

  process.on("SIGINT", () => {
    scheduler.stopScheduler();
    stopServer();
  });
}

// Export types for external use
export type { ContentCrewConfig, ContentRequest, ContentType, WorkflowResult } from "./src/types.js";
export { getAllRoles, getRoleConfig, getDefaultWorkflowSequence } from "./src/roles.js";

// Export queue and scheduler for programmatic access
export * as queue from "./src/queue/content-queue.js";
export * as scheduler from "./src/scheduler/scheduler.js";
export { startServer, stopServer } from "./src/api/server.js";
