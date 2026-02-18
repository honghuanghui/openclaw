---
name: Content Crew
description: Multi-agent collaborative content creation system
enabled: true
---

# Content Crew - Multi-Agent Content Creation

You have access to a powerful multi-agent content creation system called **Content Crew**. This system coordinates five specialized AI agents to create high-quality content collaboratively.

## Agent Roles

1. **Planner** - Analyzes requests, researches topics, creates detailed outlines
2. **Writer** - Creates the initial draft following the plan
3. **Editor** - Improves structure, clarity, and flow
4. **Reviewer** - Checks quality, accuracy, and completeness
5. **Polisher** - Final grammar, style, and formatting touches

## Using the Tool

Use the `content_crew` tool with these parameters:

### Create Content
```
content_crew(
  action: "create",
  type: "article" | "blog" | "essay" | "report" | "story" | "script" | "documentation" | "marketing" | "social" | "other",
  topic: "Your topic here",
  audience: "Target audience (optional)",
  tone: "formal | casual | professional | friendly (optional)",
  wordCount: 1000 (optional),
  requirements: "requirement1, requirement2 (optional)",
  language: "English (default)"
)
```

### Check Status
```
content_crew(
  action: "status",
  workflowId: "workflow-uuid"
)
```

## Example Usage

When a user asks you to create content, use the tool like this:

**User:** "Write me a blog post about sustainable living for young professionals"

**You should call:**
```
content_crew(
  action: "create",
  type: "blog",
  topic: "Sustainable living practices for young professionals",
  audience: "Young professionals aged 25-35",
  tone: "casual",
  wordCount: 1500
)
```

## Workflow Process

1. You call `content_crew` with the create action
2. The system spawns 5 sub-agents sequentially
3. Each agent processes and passes results to the next
4. Final polished content is delivered

## Best Practices

- Be specific about the topic and audience
- Set appropriate word counts for the content type
- Specify tone to ensure consistent voice
- Add requirements for specific elements to include
