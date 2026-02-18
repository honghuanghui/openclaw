/**
 * Continuous Worker System
 * 24/7 non-stop content generation with worker pools
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { ContentTask } from "./types.js";

/** Worker state */
export type WorkerState = "idle" | "working" | "paused" | "error";

/** Topic in the queue */
export interface TopicItem {
  id: string;
  topic: string;
  contentType: string;
  platforms: string[];
  audience?: string;
  tone?: string;
  wordCount?: number;
  language?: string;
  priority: number;
  createdAt: number;
  source: "manual" | "generated" | "trending";
}

/** Worker instance */
export interface Worker {
  id: string;
  name: string;
  state: WorkerState;
  currentTopic?: TopicItem;
  startedAt?: number;
  completedTasks: number;
  errors: number;
  lastActivityAt: number;
}

/** Worker pool configuration */
export interface WorkerPoolConfig {
  /** Number of concurrent workers */
  workerCount: number;
  /** Minimum topics to maintain in queue */
  minQueueSize: number;
  /** Delay between task completion and next task (ms) */
  taskDelay: number;
  /** Auto-generate topics when queue is low */
  autoGenerateTopics: boolean;
  /** Topic generation keywords */
  topicKeywords: string[];
  /** Default content settings */
  defaultContentType: string;
  defaultPlatforms: string[];
  defaultLanguage: string;
}

/** System state */
interface SystemState {
  isRunning: boolean;
  workers: Map<string, Worker>;
  topicQueue: TopicItem[];
  completedCount: number;
  errorCount: number;
  startedAt: number;
  config: WorkerPoolConfig;
}

// System state
let state: SystemState = {
  isRunning: false,
  workers: new Map(),
  topicQueue: [],
  completedCount: 0,
  errorCount: 0,
  startedAt: 0,
  config: {
    workerCount: 2,
    minQueueSize: 10,
    taskDelay: 5000,
    autoGenerateTopics: true,
    topicKeywords: [],
    defaultContentType: "article",
    defaultPlatforms: [],
    defaultLanguage: "Chinese",
  },
};

let storagePath: string | null = null;
let mainLoopInterval: ReturnType<typeof setInterval> | null = null;

/** Callbacks */
type GenerateContentCallback = (topic: TopicItem) => Promise<{
  success: boolean;
  contentId?: string;
  error?: string;
}>;

type GenerateTopicsCallback = (keywords: string[], count: number) => Promise<string[]>;

let generateContentCallback: GenerateContentCallback | null = null;
let generateTopicsCallback: GenerateTopicsCallback | null = null;

/** Initialize the worker system */
export function initWorkerSystem(dataDir: string, config?: Partial<WorkerPoolConfig>): void {
  storagePath = path.join(dataDir, "worker-system.json");

  // Merge config
  if (config) {
    state.config = { ...state.config, ...config };
  }

  // Load state from disk
  loadState();

  // Initialize workers
  initWorkers();
}

/** Load state from disk */
function loadState(): void {
  if (!storagePath || !fs.existsSync(storagePath)) {
    return;
  }

  try {
    const data = JSON.parse(fs.readFileSync(storagePath, "utf-8"));
    state.topicQueue = data.topicQueue || [];
    state.completedCount = data.completedCount || 0;
    state.errorCount = data.errorCount || 0;
    if (data.config) {
      state.config = { ...state.config, ...data.config };
    }
  } catch {
    // Ignore errors
  }
}

/** Save state to disk */
function saveState(): void {
  if (!storagePath) return;

  try {
    const dir = path.dirname(storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const data = {
      topicQueue: state.topicQueue,
      completedCount: state.completedCount,
      errorCount: state.errorCount,
      config: state.config,
    };

    fs.writeFileSync(storagePath, JSON.stringify(data, null, 2));
  } catch {
    // Ignore errors
  }
}

/** Initialize workers */
function initWorkers(): void {
  state.workers.clear();

  for (let i = 0; i < state.config.workerCount; i++) {
    const worker: Worker = {
      id: crypto.randomUUID(),
      name: `Worker-${i + 1}`,
      state: "idle",
      completedTasks: 0,
      errors: 0,
      lastActivityAt: Date.now(),
    };
    state.workers.set(worker.id, worker);
  }
}

/** Set content generation callback */
export function setGenerateContentCallback(callback: GenerateContentCallback): void {
  generateContentCallback = callback;
}

/** Set topic generation callback */
export function setGenerateTopicsCallback(callback: GenerateTopicsCallback): void {
  generateTopicsCallback = callback;
}

/** Start the continuous worker system */
export function startSystem(): void {
  if (state.isRunning) return;

  state.isRunning = true;
  state.startedAt = Date.now();

  // Reset worker states
  for (const worker of state.workers.values()) {
    worker.state = "idle";
  }

  // Start main loop (check every second)
  mainLoopInterval = setInterval(() => {
    mainLoop();
  }, 1000);

  // Initial run
  mainLoop();
}

/** Stop the worker system */
export function stopSystem(): void {
  state.isRunning = false;

  if (mainLoopInterval) {
    clearInterval(mainLoopInterval);
    mainLoopInterval = null;
  }

  // Set all workers to paused
  for (const worker of state.workers.values()) {
    if (worker.state !== "working") {
      worker.state = "paused";
    }
  }

  saveState();
}

/** Pause the system (finish current tasks, don't start new ones) */
export function pauseSystem(): void {
  state.isRunning = false;

  if (mainLoopInterval) {
    clearInterval(mainLoopInterval);
    mainLoopInterval = null;
  }
}

/** Main loop - assigns work to idle workers */
async function mainLoop(): Promise<void> {
  if (!state.isRunning) return;

  // Check if we need to generate more topics
  if (
    state.config.autoGenerateTopics &&
    state.topicQueue.length < state.config.minQueueSize &&
    generateTopicsCallback
  ) {
    await generateMoreTopics();
  }

  // Find idle workers and assign tasks
  for (const worker of state.workers.values()) {
    if (worker.state === "idle" && state.topicQueue.length > 0) {
      // Get next topic from queue
      const topic = state.topicQueue.shift();
      if (topic) {
        // Start working on this topic
        processTopicWithWorker(worker, topic);
      }
    }
  }

  saveState();
}

/** Process a topic with a worker */
async function processTopicWithWorker(worker: Worker, topic: TopicItem): Promise<void> {
  if (!generateContentCallback) {
    worker.state = "error";
    return;
  }

  worker.state = "working";
  worker.currentTopic = topic;
  worker.startedAt = Date.now();
  worker.lastActivityAt = Date.now();

  try {
    const result = await generateContentCallback(topic);

    if (result.success) {
      worker.completedTasks++;
      state.completedCount++;
    } else {
      worker.errors++;
      state.errorCount++;
    }
  } catch (error) {
    worker.errors++;
    state.errorCount++;
  }

  // Clear current topic
  worker.currentTopic = undefined;
  worker.startedAt = undefined;
  worker.lastActivityAt = Date.now();

  // Small delay before next task
  await new Promise((resolve) => setTimeout(resolve, state.config.taskDelay));

  // Return to idle if system is still running
  if (state.isRunning) {
    worker.state = "idle";
  } else {
    worker.state = "paused";
  }
}

/** Generate more topics */
async function generateMoreTopics(): Promise<void> {
  if (!generateTopicsCallback) {
    // Use default topics if no callback
    const defaultTopics = [
      "人工智能最新发展趋势",
      "科技创业成功案例分析",
      "职场效率提升技巧",
      "个人成长与自我管理",
      "数字化转型实践",
      "远程办公最佳实践",
      "可持续发展与绿色科技",
      "Web3和区块链应用",
      "健康生活方式指南",
      "投资理财基础知识",
    ];

    const needed = state.config.minQueueSize - state.topicQueue.length;
    for (let i = 0; i < needed && i < defaultTopics.length; i++) {
      addTopic({
        topic: defaultTopics[i],
        source: "generated",
      });
    }
    return;
  }

  try {
    const needed = state.config.minQueueSize - state.topicQueue.length;
    const topics = await generateTopicsCallback(
      state.config.topicKeywords,
      needed,
    );

    for (const topic of topics) {
      addTopic({
        topic,
        source: "generated",
      });
    }
  } catch {
    // Ignore errors
  }
}

/** Add a topic to the queue */
export function addTopic(params: {
  topic: string;
  contentType?: string;
  platforms?: string[];
  audience?: string;
  tone?: string;
  wordCount?: number;
  language?: string;
  priority?: number;
  source?: "manual" | "generated" | "trending";
}): TopicItem {
  const item: TopicItem = {
    id: crypto.randomUUID(),
    topic: params.topic,
    contentType: params.contentType || state.config.defaultContentType,
    platforms: params.platforms || state.config.defaultPlatforms,
    audience: params.audience,
    tone: params.tone,
    wordCount: params.wordCount,
    language: params.language || state.config.defaultLanguage,
    priority: params.priority || 3,
    source: params.source || "manual",
    createdAt: Date.now(),
  };

  // Insert by priority (lower number = higher priority)
  const insertIndex = state.topicQueue.findIndex(
    (t) => t.priority > item.priority,
  );

  if (insertIndex === -1) {
    state.topicQueue.push(item);
  } else {
    state.topicQueue.splice(insertIndex, 0, item);
  }

  saveState();
  return item;
}

/** Add multiple topics */
export function addTopics(topics: string[]): TopicItem[] {
  return topics.map((topic) => addTopic({ topic, source: "manual" }));
}

/** Remove a topic from queue */
export function removeTopic(id: string): boolean {
  const index = state.topicQueue.findIndex((t) => t.id === id);
  if (index !== -1) {
    state.topicQueue.splice(index, 1);
    saveState();
    return true;
  }
  return false;
}

/** Clear the topic queue */
export function clearQueue(): void {
  state.topicQueue = [];
  saveState();
}

/** Get queue contents */
export function getQueue(): TopicItem[] {
  return [...state.topicQueue];
}

/** Get worker status */
export function getWorkers(): Worker[] {
  return Array.from(state.workers.values());
}

/** Get system status */
export function getSystemStatus(): {
  isRunning: boolean;
  uptime: number;
  workers: Worker[];
  queueSize: number;
  completedCount: number;
  errorCount: number;
  config: WorkerPoolConfig;
} {
  return {
    isRunning: state.isRunning,
    uptime: state.isRunning ? Math.floor((Date.now() - state.startedAt) / 1000) : 0,
    workers: getWorkers(),
    queueSize: state.topicQueue.length,
    completedCount: state.completedCount,
    errorCount: state.errorCount,
    config: state.config,
  };
}

/** Update configuration */
export function updateConfig(config: Partial<WorkerPoolConfig>): void {
  state.config = { ...state.config, ...config };

  // Adjust worker count if changed
  if (config.workerCount !== undefined) {
    const currentCount = state.workers.size;
    if (config.workerCount > currentCount) {
      // Add more workers
      for (let i = currentCount; i < config.workerCount; i++) {
        const worker: Worker = {
          id: crypto.randomUUID(),
          name: `Worker-${i + 1}`,
          state: state.isRunning ? "idle" : "paused",
          completedTasks: 0,
          errors: 0,
          lastActivityAt: Date.now(),
        };
        state.workers.set(worker.id, worker);
      }
    } else if (config.workerCount < currentCount) {
      // Remove excess workers (only idle ones)
      const workers = Array.from(state.workers.values());
      let removed = 0;
      for (const worker of workers) {
        if (removed >= currentCount - config.workerCount) break;
        if (worker.state === "idle" || worker.state === "paused") {
          state.workers.delete(worker.id);
          removed++;
        }
      }
    }
  }

  saveState();
}

/** Reset statistics */
export function resetStats(): void {
  state.completedCount = 0;
  state.errorCount = 0;
  for (const worker of state.workers.values()) {
    worker.completedTasks = 0;
    worker.errors = 0;
  }
  saveState();
}
