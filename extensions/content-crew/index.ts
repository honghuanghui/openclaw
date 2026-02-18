/**
 * Content Crew - Multi-Agent Collaborative Content Creation
 *
 * This plugin provides a multi-agent system for content creation,
 * with specialized roles for planning, writing, editing, reviewing,
 * and polishing content.
 */

import type { OpenClawPluginApi } from "../../src/plugins/types.js";

import { createContentCrewTool } from "./src/content-crew-tool.js";
import type { ContentCrewConfig } from "./src/types.js";

export default function register(api: OpenClawPluginApi) {
  // Get plugin configuration
  const config = (api.config?.plugins?.["content-crew"] || {}) as ContentCrewConfig;

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

  // Log registration
  if (api.logger?.info) {
    api.logger.info("Content Crew plugin registered");
  }
}

// Export types for external use
export type { ContentCrewConfig, ContentRequest, ContentType, WorkflowResult } from "./src/types.js";
export { getAllRoles, getRoleConfig, getDefaultWorkflowSequence } from "./src/roles.js";
