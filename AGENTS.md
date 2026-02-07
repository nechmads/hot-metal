# General Workflow

## Pre-Development Phase

If the .agents folder exists:

- Always make sure you read `.agents/prd.md` to understand the project scope. Make sure to also read the `.agents/TECHNICAL_REQUIREMENTS.md` to understand the technologies and requirements used in the project.
  You can also read `.agents/todos.md` to see what was done so far.

## Planning Phase (MANDATORY)

- **ALWAYS start by creating a detailed plan** before making any code changes
- **Decompose complex tasks** into smaller, manageable subtasks when possible
- Each subtask should be focused and specific (e.g., "Create user model", "Add authentication middleware", "Build login component")
- Mark the first task as "in_progress" and begin working

## Development Phase

- Always create a new branch before working on a new feature and commit changes when finished working
- Work on **one subtask at a time** from your plan
- After completing each coding subtask, **run a code review** focusing on the code that was just changed

## Code Review & Iteration Loop

- **After each coding task**, run a code review on the changes made
- If the reviewer suggests improvements:
  - **Implement the suggested changes immediately**
  - **Re-run the code review** on the updated code
  - **Continue this loop** until no important improvements are suggested
- Only move to the next subtask after the current one passes review

## Task Completion

- When finishing coding always run the build and check for any errors. If there are errors fix them before completing the task
- When finishing coding always check for type errors and fix any existing ones
- When finishing a task, make sure to mark it as completed in `.agents/todos.md` (add it if it's not there yet)
- When finishing a big section of the app (auth, db, api, etc) always add an .md file to the docs folder documenting what you did and how to use that code


# Codex Specific Instructions

## Planning

Create a clear plan by listing out the tasks you need to complete. Track your progress in `.agents/todos.md` or use comments in your code.

## Code Review

To run code reviews, invoke the `senior-code-reviewer` skill after completing each coding subtask. The skill will be automatically activated when you ask for a code review.

The skill will analyze the code for:
- Code quality and best practices
- Potential bugs or issues
- Performance considerations
- Security vulnerabilities


---

# Project Guidelines

These guidelines apply to all work in this project.

## Coding style best practices

- **Follow Existing Patterns First**: Match the project’s established architecture, naming, error-handling, logging, and folder conventions before introducing new patterns.
- **Consistent Naming Conventions**: Use consistent, descriptive names for variables, functions, types/classes, and files.
- **Meaningful Names**: Prefer names that reveal intent; avoid abbreviations unless they’re widely standard in the domain.
- **Self-Documenting Code**: Write code that explains itself through clear structure and naming.
- **Automated Formatting**: Use auto-formatters/linters to enforce indentation, spacing, imports, and line breaks.
- **Small, Focused Units**: Keep functions/modules focused on a single responsibility; build systems from composable pieces.
- **Readable Over Clever**: Prefer straightforward solutions over “smart” ones; optimize for clarity and maintainability.
- **DRY, But Don’t Over-Abstract**: Reduce real duplication, but avoid premature abstractions that make code harder to follow.
- **Remove Dead Code**: Delete unused code, commented-out blocks, and unused imports rather than leaving clutter.
- **Explicit Inputs/Outputs**: Keep function boundaries clear; minimize hidden side effects and shared mutable state.
- **Clear Error Handling**: Handle errors at the right layer; don’t swallow failures; use actionable error messages.
- **Validate at Boundaries**: Treat inputs from users/files/network/DB as untrusted; validate/sanitize at the edges.
- **Security & Secrets Hygiene**: Never hardcode secrets; avoid logging sensitive data; prefer least-privilege access patterns.
- **Logging & Observability**: Add logs/metrics where they help debugging; keep them consistent; avoid noisy logs.
- **Document the “Why”**: Comment on intent, constraints, and tradeoffs; document non-obvious behavior and invariants.
- **Consistent Project Structure**: Organize files and directories in a predictable, logical structure that team members can navigate easily. Always read current project structure to learn about its conventions, and follow them.

## Constraints / assumptions

- **Backward compatibility only when required**: Unless specifically instructed otherwise, assume you do not need to add compatibility shims or legacy support.


---

## Error handling best practices

- **User-Friendly Messages**: Provide clear, actionable messages to users; avoid exposing stack traces, internals, or sensitive data.
- **Fail Fast and Explicitly**: Validate inputs and preconditions early; prevent invalid state from propagating.
- **Use Specific Error Types**: Throw/return specific error types (or error codes) rather than generic ones to enable targeted handling.
- **Preserve Context**: When rethrowing/wrapping, keep the original error/cause and add useful context (operation, identifiers, parameters).
- **Don’t Catch What You Can’t Handle**: Avoid broad catch-all handlers except at explicit boundaries; never swallow errors silently.
- **Centralize at Boundaries**: Convert internal errors into user/API-safe responses at boundaries (API/controller/CLI entrypoints), not deep inside core logic.
- **Log with Structure (and Care)**: Log actionable context (request id, component, operation) while redacting secrets/PII; avoid noisy logs.
- **Define Error Contracts**: Document which errors a module/API can emit and how callers should handle them (retryable vs permanent, user-facing vs internal).
- **Retry Only Transient Failures**: Use exponential backoff + jitter for retryable failures; cap retries/time; avoid retrying on validation/auth/permission errors.
- **Timeouts and Cancellation**: Use explicit timeouts for I/O; propagate cancellation (where supported) to avoid hung requests and resource leaks.
- **Idempotency and Safe Retries**: Ensure retried operations are idempotent or protected (idempotency keys, dedupe) to prevent duplicates.
- **Resource Cleanup**: Always release resources (files, locks, sockets, transactions) via finally/defer/using/context managers.
- **Avoid Exceptions for Normal Control Flow**: Prefer explicit return values/results for expected “not found/empty” paths when idiomatic in the codebase.


---

## Validation Guidelines

- **Validate on Server Side**: Always validate on the server; never trust client-side validation alone for security or data integrity
- **Client-Side for UX**: Use client-side validation to provide immediate user feedback, but duplicate checks server-side

