/**
 * Web API Server for Content Crew Management
 */

import type { Server } from "node:http";

import express, { type Request, type Response, type NextFunction } from "express";
import path from "node:path";

import * as queue from "../queue/content-queue.js";
import * as scheduler from "../scheduler/scheduler.js";
import type { ContentStatus } from "../queue/types.js";
import type { ScheduleFrequency, DayOfWeek } from "../scheduler/types.js";

export interface ServerConfig {
  port: number;
  host: string;
  dataDir: string;
  staticDir?: string;
}

let server: Server | null = null;

/** Start the API server */
export function startServer(config: ServerConfig): Server {
  const app = express();

  // Middleware
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // CORS for development
  app.use((req: Request, res: Response, next: NextFunction) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") {
      res.sendStatus(200);
      return;
    }
    next();
  });

  // Initialize storage
  queue.initQueue(config.dataDir);
  scheduler.initScheduler(config.dataDir);

  // ===== Health & Status =====

  app.get("/api/health", (_req: Request, res: Response) => {
    res.json({ status: "ok", timestamp: Date.now() });
  });

  app.get("/api/status", (_req: Request, res: Response) => {
    const systemStatus = scheduler.getSystemStatus();
    const contentStats = queue.queryContent().stats;
    res.json({
      system: systemStatus,
      content: contentStats,
    });
  });

  // ===== Content Queue API =====

  app.get("/api/content", (req: Request, res: Response) => {
    const filter = {
      status: req.query.status
        ? (String(req.query.status).split(",") as ContentStatus[])
        : undefined,
      platforms: req.query.platforms
        ? String(req.query.platforms).split(",")
        : undefined,
      search: req.query.search ? String(req.query.search) : undefined,
    };

    const sort = {
      field: (req.query.sortBy as "createdAt" | "updatedAt" | "priority") || "createdAt",
      direction: (req.query.sortDir as "asc" | "desc") || "desc",
    };

    const pagination = {
      page: parseInt(String(req.query.page || "1"), 10),
      pageSize: parseInt(String(req.query.pageSize || "20"), 10),
    };

    const result = queue.queryContent(filter, sort, pagination);
    res.json(result);
  });

  app.get("/api/content/:id", (req: Request, res: Response) => {
    const content = queue.getContent(req.params.id);
    if (!content) {
      res.status(404).json({ error: "Content not found" });
      return;
    }
    res.json(content);
  });

  app.post("/api/content", (req: Request, res: Response) => {
    const content = queue.createContent({
      title: req.body.title || "Untitled",
      body: req.body.body || "",
      contentType: req.body.contentType || "article",
      platforms: req.body.platforms || [],
      status: "draft",
      priority: req.body.priority || 3,
      createdBy: req.body.createdBy || "user",
      ...req.body,
    });
    res.status(201).json(content);
  });

  app.put("/api/content/:id", (req: Request, res: Response) => {
    const content = queue.updateContent(req.params.id, req.body);
    if (!content) {
      res.status(404).json({ error: "Content not found" });
      return;
    }
    res.json(content);
  });

  app.put("/api/content/:id/status", (req: Request, res: Response) => {
    const content = queue.updateContentStatus(req.params.id, req.body.status);
    if (!content) {
      res.status(404).json({ error: "Content not found" });
      return;
    }
    res.json(content);
  });

  app.post("/api/content/:id/review", (req: Request, res: Response) => {
    const content = queue.addReviewComment(req.params.id, {
      author: req.body.author || "user",
      content: req.body.content,
      type: req.body.type || "comment",
    });
    if (!content) {
      res.status(404).json({ error: "Content not found" });
      return;
    }
    res.json(content);
  });

  app.delete("/api/content/:id", (req: Request, res: Response) => {
    const deleted = queue.deleteContent(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Content not found" });
      return;
    }
    res.json({ success: true });
  });

  app.post("/api/content/bulk/status", (req: Request, res: Response) => {
    const { ids, status } = req.body;
    const updated = queue.bulkUpdateStatus(ids, status);
    res.json({ updated });
  });

  // ===== Tasks API =====

  app.get("/api/tasks", (_req: Request, res: Response) => {
    const tasks = scheduler.getAllTasks();
    res.json(tasks);
  });

  app.get("/api/tasks/:id", (req: Request, res: Response) => {
    const task = scheduler.getTask(req.params.id);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(task);
  });

  app.post("/api/tasks", (req: Request, res: Response) => {
    const task = scheduler.createTask({
      name: req.body.name || "New Task",
      contentType: req.body.contentType || "article",
      topicTemplate: req.body.topicTemplate || "",
      platforms: req.body.platforms || [],
      enabled: req.body.enabled ?? true,
      ...req.body,
    });
    res.status(201).json(task);
  });

  app.put("/api/tasks/:id", (req: Request, res: Response) => {
    const task = scheduler.updateTask(req.params.id, req.body);
    if (!task) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(task);
  });

  app.delete("/api/tasks/:id", (req: Request, res: Response) => {
    const deleted = scheduler.deleteTask(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json({ success: true });
  });

  app.post("/api/tasks/:id/trigger", async (req: Request, res: Response) => {
    const execution = await scheduler.triggerTask(req.params.id);
    if (!execution) {
      res.status(404).json({ error: "Task not found" });
      return;
    }
    res.json(execution);
  });

  // ===== Schedules API =====

  app.get("/api/schedules", (_req: Request, res: Response) => {
    const schedules = scheduler.getAllSchedules();
    res.json(schedules);
  });

  app.get("/api/schedules/:id", (req: Request, res: Response) => {
    const schedule = scheduler.getSchedule(req.params.id);
    if (!schedule) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }
    res.json(schedule);
  });

  app.post("/api/schedules", (req: Request, res: Response) => {
    const schedule = scheduler.createSchedule({
      taskId: req.body.taskId,
      name: req.body.name || "New Schedule",
      frequency: (req.body.frequency || "daily") as ScheduleFrequency,
      timeOfDay: req.body.timeOfDay || "09:00",
      daysOfWeek: req.body.daysOfWeek as DayOfWeek[] | undefined,
      timezone: req.body.timezone || "UTC",
      active: req.body.active ?? true,
      ...req.body,
    });
    res.status(201).json(schedule);
  });

  app.put("/api/schedules/:id", (req: Request, res: Response) => {
    const schedule = scheduler.updateSchedule(req.params.id, req.body);
    if (!schedule) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }
    res.json(schedule);
  });

  app.delete("/api/schedules/:id", (req: Request, res: Response) => {
    const deleted = scheduler.deleteSchedule(req.params.id);
    if (!deleted) {
      res.status(404).json({ error: "Schedule not found" });
      return;
    }
    res.json({ success: true });
  });

  // ===== Executions API =====

  app.get("/api/executions", (req: Request, res: Response) => {
    const limit = parseInt(String(req.query.limit || "50"), 10);
    const executions = scheduler.getExecutions(limit);
    res.json(executions);
  });

  app.get("/api/executions/:id", (req: Request, res: Response) => {
    const execution = scheduler.getExecution(req.params.id);
    if (!execution) {
      res.status(404).json({ error: "Execution not found" });
      return;
    }
    res.json(execution);
  });

  // ===== Scheduler Control =====

  app.post("/api/scheduler/start", (_req: Request, res: Response) => {
    scheduler.startScheduler();
    res.json({ status: "started" });
  });

  app.post("/api/scheduler/stop", (_req: Request, res: Response) => {
    scheduler.stopScheduler();
    res.json({ status: "stopped" });
  });

  // ===== Static Files (Web UI) =====

  if (config.staticDir) {
    app.use(express.static(config.staticDir));

    // SPA fallback
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(config.staticDir!, "index.html"));
    });
  }

  // Error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    console.error("API Error:", err);
    res.status(500).json({ error: err.message });
  });

  // Start server
  server = app.listen(config.port, config.host, () => {
    console.log(`Content Crew API running at http://${config.host}:${config.port}`);
  });

  return server;
}

/** Stop the API server */
export function stopServer(): void {
  if (server) {
    server.close();
    server = null;
  }
  scheduler.stopScheduler();
}

/** Get server instance */
export function getServer(): Server | null {
  return server;
}
