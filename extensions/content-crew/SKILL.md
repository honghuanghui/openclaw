---
name: Content Crew
description: Multi-agent collaborative content creation system with 24/7 automation
enabled: true
---

# Content Crew - 自媒体内容自动运营系统

你可以使用 **Content Crew** 多智能体系统来自动化内容创作和管理。

## 系统架构

```
┌─────────────────────────────────────────────────────────┐
│                   Web UI Dashboard                       │
│              http://127.0.0.1:3847                       │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│               24/7 Content Scheduler                     │
│     定时任务 → 内容生成 → 审核队列 → 待发布              │
└─────────────────────────────────────────────────────────┘
                          │
┌─────────────────────────────────────────────────────────┐
│              Multi-Agent Content Crew                    │
│   策划师 → 写手 → 编辑 → 审稿人 → 润色师                 │
└─────────────────────────────────────────────────────────┘
```

## 5个专业智能体

| 角色 | 职责 |
|------|------|
| **策划师 (Planner)** | 分析需求、研究主题、创建大纲 |
| **写手 (Writer)** | 根据大纲撰写初稿 |
| **编辑 (Editor)** | 改进结构、清晰度、流畅性 |
| **审稿人 (Reviewer)** | 审核质量、准确性、完整性 |
| **润色师 (Polisher)** | 最终语法、风格、格式润色 |

## 使用 content_crew 工具

### 创建内容
```
content_crew(
  action: "create",
  type: "article" | "blog" | "social" | "marketing",
  topic: "主题描述",
  audience: "目标受众",
  tone: "formal | casual | professional",
  wordCount: 1500,
  language: "Chinese"
)
```

### 查询状态
```
content_crew(
  action: "status",
  workflowId: "workflow-uuid"
)
```

## Web UI 管理界面

访问 `http://127.0.0.1:3847` 可以:

- **仪表盘**: 查看系统状态、待审内容、统计数据
- **内容队列**: 管理所有生成的内容，审核通过/拒绝
- **任务管理**: 创建和管理内容生成任务
- **定时调度**: 设置自动执行计划（每天/每周/自定义）
- **执行历史**: 查看任务执行记录

## 工作流程

1. **创建任务**: 定义内容类型、主题、目标平台
2. **设置调度**: 配置执行时间（如每天9:00）
3. **自动生成**: 系统24/7自动运行，生成内容
4. **审核内容**: 在Web UI中审核生成的内容
5. **手动发布**: 审核通过后，手动发布到各平台

## 配置示例

```yaml
plugins:
  content-crew:
    defaultModel: "claude-3-opus"
    server:
      enabled: true
      port: 3847
    roles:
      planner: "claude-3-opus"
      writer: "claude-3-sonnet"
      editor: "claude-3-sonnet"
      reviewer: "claude-3-opus"
      polisher: "claude-3-haiku"
```

## 支持的内容类型

- **article**: 深度文章
- **blog**: 博客文章
- **essay**: 论述文
- **report**: 报告
- **story**: 故事/小说
- **script**: 脚本/剧本
- **documentation**: 技术文档
- **marketing**: 营销文案
- **social**: 社交媒体内容

## 内容状态流转

```
草稿(draft) → 审核中(reviewing) → 已通过(approved) → 待发布(scheduled) → 已发布(published)
                    ↓
               已拒绝(rejected) → 返回修改
```
