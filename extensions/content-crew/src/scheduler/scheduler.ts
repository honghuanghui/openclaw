/**
 * Content Scheduler
 * 24/7 automated content generation scheduler
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type {
  ContentTask,
  JobExecution,
  Schedule,
  SystemStatus,
} from "./types.js";

/** Scheduled tasks storage */
let tasks: Map<string, ContentTask> = new Map();
let schedules: Map<string, Schedule> = new Map();
let executions: Map<string, JobExecution> = new Map();

/** Scheduler state */
let isRunning = false;
let schedulerInterval: ReturnType<typeof setInterval> | null = null;
let startTime = 0;
let storagePath: string | null = null;

/** Callback for executing content generation */
type ExecuteCallback = (task: ContentTask, schedule: Schedule) => Promise<{
  workflowId?: string;
  contentId?: string;
  error?: string;
}>;

let executeCallback: ExecuteCallback | null = null;

/** Initialize scheduler with storage path */
export function initScheduler(dataDir: string): void {
  storagePath = dataDir;
  loadFromDisk();
}

/** Set execution callback */
export function setExecuteCallback(callback: ExecuteCallback): void {
  executeCallback = callback;
}

/** Load data from disk */
function loadFromDisk(): void {
  if (!storagePath) return;

  try {
    const tasksFile = path.join(storagePath, "tasks.json");
    if (fs.existsSync(tasksFile)) {
      const data = JSON.parse(fs.readFileSync(tasksFile, "utf-8"));
      tasks = new Map(data.map((t: ContentTask) => [t.id, t]));
    }

    const schedulesFile = path.join(storagePath, "schedules.json");
    if (fs.existsSync(schedulesFile)) {
      const data = JSON.parse(fs.readFileSync(schedulesFile, "utf-8"));
      schedules = new Map(data.map((s: Schedule) => [s.id, s]));
    }

    const executionsFile = path.join(storagePath, "executions.json");
    if (fs.existsSync(executionsFile)) {
      const data = JSON.parse(fs.readFileSync(executionsFile, "utf-8"));
      // Only keep recent executions (last 7 days)
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      const recent = data.filter((e: JobExecution) => e.startedAt > cutoff);
      executions = new Map(recent.map((e: JobExecution) => [e.id, e]));
    }
  } catch {
    // Ignore errors
  }
}

/** Save data to disk */
function saveToDisk(): void {
  if (!storagePath) return;

  try {
    if (!fs.existsSync(storagePath)) {
      fs.mkdirSync(storagePath, { recursive: true });
    }

    fs.writeFileSync(
      path.join(storagePath, "tasks.json"),
      JSON.stringify(Array.from(tasks.values()), null, 2),
    );

    fs.writeFileSync(
      path.join(storagePath, "schedules.json"),
      JSON.stringify(Array.from(schedules.values()), null, 2),
    );

    fs.writeFileSync(
      path.join(storagePath, "executions.json"),
      JSON.stringify(Array.from(executions.values()), null, 2),
    );
  } catch {
    // Ignore errors
  }
}

/** Start the scheduler */
export function startScheduler(): void {
  if (isRunning) return;

  isRunning = true;
  startTime = Date.now();

  // Check schedules every minute
  schedulerInterval = setInterval(() => {
    checkSchedules();
  }, 60 * 1000);

  // Initial check
  checkSchedules();
}

/** Stop the scheduler */
export function stopScheduler(): void {
  isRunning = false;
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
  }
}

/** Check and execute due schedules */
async function checkSchedules(): Promise<void> {
  const now = Date.now();

  for (const schedule of schedules.values()) {
    if (!schedule.active) continue;

    const task = tasks.get(schedule.taskId);
    if (!task || !task.enabled) continue;

    // Check if schedule is due
    if (schedule.nextRunAt && schedule.nextRunAt <= now) {
      await executeSchedule(schedule, task);
    }
  }
}

/** Execute a scheduled task */
async function executeSchedule(
  schedule: Schedule,
  task: ContentTask,
): Promise<void> {
  if (!executeCallback) return;

  const execution: JobExecution = {
    id: crypto.randomUUID(),
    scheduleId: schedule.id,
    taskId: task.id,
    status: "running",
    startedAt: Date.now(),
    logs: [`[${new Date().toISOString()}] Starting execution for task: ${task.name}`],
  };

  executions.set(execution.id, execution);

  // Update schedule
  schedule.lastRunAt = Date.now();
  schedule.nextRunAt = calculateNextRun(schedule);
  schedules.set(schedule.id, schedule);
  saveToDisk();

  try {
    execution.logs.push(`[${new Date().toISOString()}] Executing content generation...`);

    const result = await executeCallback(task, schedule);

    execution.workflowId = result.workflowId;
    execution.contentId = result.contentId;

    if (result.error) {
      execution.status = "failed";
      execution.error = result.error;
      execution.logs.push(`[${new Date().toISOString()}] Error: ${result.error}`);
    } else {
      execution.status = "completed";
      execution.logs.push(`[${new Date().toISOString()}] Completed successfully`);
    }
  } catch (err) {
    execution.status = "failed";
    execution.error = err instanceof Error ? err.message : String(err);
    execution.logs.push(`[${new Date().toISOString()}] Error: ${execution.error}`);
  }

  execution.completedAt = Date.now();
  executions.set(execution.id, execution);
  saveToDisk();
}

/** Calculate next run time for a schedule */
function calculateNextRun(schedule: Schedule): number {
  const now = new Date();
  const [hours, minutes] = (schedule.timeOfDay || "09:00").split(":").map(Number);

  switch (schedule.frequency) {
    case "hourly": {
      const next = new Date(now);
      next.setMinutes(minutes, 0, 0);
      if (next <= now) {
        next.setHours(next.getHours() + 1);
      }
      return next.getTime();
    }

    case "daily": {
      const next = new Date(now);
      next.setHours(hours, minutes, 0, 0);
      if (next <= now) {
        next.setDate(next.getDate() + 1);
      }
      return next.getTime();
    }

    case "weekly": {
      const dayMap: Record<string, number> = {
        sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6,
      };
      const targetDays = (schedule.daysOfWeek || ["mon"]).map((d) => dayMap[d]);
      const currentDay = now.getDay();

      let daysUntilNext = 7;
      for (const targetDay of targetDays) {
        const diff = (targetDay - currentDay + 7) % 7;
        if (diff === 0) {
          // Check if today's time has passed
          const todayTime = new Date(now);
          todayTime.setHours(hours, minutes, 0, 0);
          if (todayTime > now) {
            daysUntilNext = 0;
            break;
          }
        } else if (diff < daysUntilNext) {
          daysUntilNext = diff;
        }
      }

      if (daysUntilNext === 7) {
        daysUntilNext = Math.min(...targetDays.map((d) => (d - currentDay + 7) % 7 || 7));
      }

      const next = new Date(now);
      next.setDate(next.getDate() + daysUntilNext);
      next.setHours(hours, minutes, 0, 0);
      return next.getTime();
    }

    case "monthly": {
      const targetDay = schedule.dayOfMonth || 1;
      const next = new Date(now);
      next.setDate(targetDay);
      next.setHours(hours, minutes, 0, 0);
      if (next <= now) {
        next.setMonth(next.getMonth() + 1);
      }
      return next.getTime();
    }

    case "custom": {
      // For custom cron, use a simple next-hour approach
      // Full cron parsing would require a library
      const next = new Date(now);
      next.setHours(next.getHours() + 1, 0, 0, 0);
      return next.getTime();
    }

    default:
      return now.getTime() + 24 * 60 * 60 * 1000;
  }
}

// ===== Task Management =====

export function createTask(
  task: Omit<ContentTask, "id" | "createdAt" | "updatedAt">,
): ContentTask {
  const now = Date.now();
  const newTask: ContentTask = {
    ...task,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  };
  tasks.set(newTask.id, newTask);
  saveToDisk();
  return newTask;
}

export function getTask(id: string): ContentTask | undefined {
  return tasks.get(id);
}

export function updateTask(
  id: string,
  updates: Partial<Omit<ContentTask, "id" | "createdAt">>,
): ContentTask | undefined {
  const task = tasks.get(id);
  if (!task) return undefined;

  const updated: ContentTask = {
    ...task,
    ...updates,
    updatedAt: Date.now(),
  };
  tasks.set(id, updated);
  saveToDisk();
  return updated;
}

export function deleteTask(id: string): boolean {
  const deleted = tasks.delete(id);
  if (deleted) {
    // Also delete associated schedules
    for (const schedule of schedules.values()) {
      if (schedule.taskId === id) {
        schedules.delete(schedule.id);
      }
    }
    saveToDisk();
  }
  return deleted;
}

export function getAllTasks(): ContentTask[] {
  return Array.from(tasks.values());
}

// ===== Schedule Management =====

export function createSchedule(
  schedule: Omit<Schedule, "id" | "createdAt" | "nextRunAt">,
): Schedule {
  const newSchedule: Schedule = {
    ...schedule,
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    nextRunAt: 0,
  };
  newSchedule.nextRunAt = calculateNextRun(newSchedule);
  schedules.set(newSchedule.id, newSchedule);
  saveToDisk();
  return newSchedule;
}

export function getSchedule(id: string): Schedule | undefined {
  return schedules.get(id);
}

export function updateSchedule(
  id: string,
  updates: Partial<Omit<Schedule, "id" | "createdAt">>,
): Schedule | undefined {
  const schedule = schedules.get(id);
  if (!schedule) return undefined;

  const updated: Schedule = {
    ...schedule,
    ...updates,
  };
  updated.nextRunAt = calculateNextRun(updated);
  schedules.set(id, updated);
  saveToDisk();
  return updated;
}

export function deleteSchedule(id: string): boolean {
  const deleted = schedules.delete(id);
  if (deleted) {
    saveToDisk();
  }
  return deleted;
}

export function getAllSchedules(): Schedule[] {
  return Array.from(schedules.values());
}

export function getSchedulesForTask(taskId: string): Schedule[] {
  return Array.from(schedules.values()).filter((s) => s.taskId === taskId);
}

// ===== Execution History =====

export function getExecutions(limit: number = 50): JobExecution[] {
  return Array.from(executions.values())
    .sort((a, b) => b.startedAt - a.startedAt)
    .slice(0, limit);
}

export function getExecution(id: string): JobExecution | undefined {
  return executions.get(id);
}

// ===== System Status =====

export function getSystemStatus(): SystemStatus {
  const now = Date.now();
  const dayAgo = now - 24 * 60 * 60 * 1000;

  const recentExecutions = Array.from(executions.values()).filter(
    (e) => e.startedAt > dayAgo,
  );

  return {
    schedulerRunning: isRunning,
    activeJobs: recentExecutions.filter((e) => e.status === "running").length,
    pendingContent: Array.from(schedules.values()).filter((s) => s.active).length,
    lastActivityAt: Math.max(0, ...recentExecutions.map((e) => e.startedAt)),
    uptimeSeconds: isRunning ? Math.floor((now - startTime) / 1000) : 0,
    recentErrors: recentExecutions.filter((e) => e.status === "failed").length,
  };
}

/** Manually trigger a task */
export async function triggerTask(taskId: string): Promise<JobExecution | null> {
  const task = tasks.get(taskId);
  if (!task) return null;

  // Find associated schedule or create a dummy one
  let schedule = Array.from(schedules.values()).find((s) => s.taskId === taskId);
  if (!schedule) {
    schedule = {
      id: "manual",
      taskId,
      name: "Manual Trigger",
      frequency: "custom",
      timezone: "UTC",
      active: false,
      createdAt: Date.now(),
    };
  }

  await executeSchedule(schedule, task);

  // Return the latest execution
  const latestExecution = Array.from(executions.values())
    .filter((e) => e.taskId === taskId)
    .sort((a, b) => b.startedAt - a.startedAt)[0];

  return latestExecution || null;
}
