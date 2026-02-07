---
name: workflow-development
description: Run the complete Development workflow with 2 sequential steps. Use when you need to execute this structured process from start to finish.
metadata:
  short-description: Complete Development workflow (2 steps)
---

# Development Workflow

Complete Development workflow with 2 steps. Follow each step in order.

## How to Use This Workflow

This workflow guides you through a structured process. Execute each step in order.

**To run the complete workflow**, follow the steps below. Each step has detailed instructions in its own rule.

## Workflow Steps

### Step 99: Next Todo

If you didn't do it already, read .agents/prd.md, .agents/technical_requirements.md and .agents/todos.md to understand the project and current prog...

**Invoke**: $workflow-development-99-next-todo

---

### Step 99: Start Session

First read the .agents/PRD.md, .agents/TECHNICAL_REQUIREMENTS.md and .agents/todos.md files to orient yourself on the project and what was done so ...

**Invoke**: $workflow-development-99-start-session

---

## Execution Instructions

1. Start with Step 1 and complete it fully before moving to the next step
2. Each step may require user input or produce artifacts
3. Steps build on previous outputs, so order matters
4. If a step references a file that doesn't exist, complete the prerequisite step first
