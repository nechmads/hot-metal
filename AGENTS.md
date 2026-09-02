# General Workflow

## Pre-Development Phase

If the .agentspack folder exists:

- Always make sure you read `.agentspack/prd.md` to understand the project scope. Make sure to also read the `.agentspack/TECHNICAL_REQUIREMENTS.md` to understand the technologies and requirements used in the project.
  You can also read `.agentspack/todos.md` to see what was done so far.

## Planning Phase (MANDATORY)

- **ALWAYS start by creating a detailed plan** before making any code changes
- **Decompose complex tasks** into smaller, manageable subtasks when possible
- Each subtask should be focused and specific (e.g., "Create user model", "Add authentication middleware", "Build login component")
- Mark the first task as "in_progress" and begin working

## Development Phase

- Always create a new branch before working on a new feature and commit changes when finished working
- Work on **one subtask at a time** from your plan
- After completing each coding subtask, **run a code review** focusing on the code that was just changed
- Never be lazy or take unexplained shortcuts. Think carefully, do complete work, and validate that each change actually solves the subtask.

## Code Review & Iteration Loop

- **After each coding task**, run a code review on the changes made
- If the reviewer suggests improvements:
  - **Implement the suggested changes immediately**
  - **Re-run the code review** on the updated code
  - **Continue this loop** until no important improvements are suggested
- Only move to the next subtask after the current one passes review

## Debugging & QA

- When investigating issues, do not jump to conclusions from the first symptom; gather evidence before selecting a fix.
- Rethink your current conclusion at least once and challenge whether alternative explanations better fit the evidence.
- Make sure you researched all relevant code paths, configs, logs, and assumptions before declaring a root cause.
- After applying a fix, verify with reproducible checks/tests that the original issue is resolved and no regression was introduced.
- If evidence conflicts with your current conclusion, stop, revise your hypothesis, and continue investigating.

## Post API Task

After finishing coding or updating any API endpoint:

- **Update the Postman collection** in the `postman/` folder at the project root. If the collection doesn't exist yet, create it. Ensure every endpoint includes full documentation: descriptions, all request parameters, headers, body schemas, and realistic example requests/responses for every field.
- **Update the `docs/API_GUIDE.md`** file with clear, easy-to-follow instructions on how to use the API. Include all endpoints, HTTP methods, URL parameters, query parameters, request bodies, response formats, and example usage. If the file doesn't exist yet, create it.

## Task Completion

- When finishing coding always run the build and check for any errors. If there are errors fix them before completing the task
- When finishing coding always check for type errors and fix any existing ones
- When finishing a task, make sure to mark it as completed in `.agentspack/todos.md` (add it if it's not there yet)
- When finishing a big section of the app (auth, db, api, etc) always add an .md file to the docs folder documenting what you did and how to use that code
- Before closing a task/session, reflect on whether you learned a reusable project-specific technique (debugging flow, error diagnosis pattern, project convention, comment style, etc.)
- If such reusable knowledge was learned, invoke the `create-cross-platform-skill` skill and create or update that skill in each relevant provider folder (`.cursor/skills/`, `.claude/skills/`, `.agents/skills/`) so it is available in future sessions


# Codex Specific Instructions

## Planning

Create a clear plan by listing out the tasks you need to complete. Track your progress in `.agentspack/todos.md` or use comments in your code.

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



<!-- agents-pack:start id=ap-core-instructions version=0.31.0 -->
## Project orientation

Before planning, changing code, or brainstorming with the user, check the
repository root for `PRD.md`, `TECHNICAL_REQUIREMENTS.md`, and `TODOs.md`. Read
any that exist, focusing on sections relevant to the task, to understand the
product intent, technical constraints, and current progress.

Then locate any documentation index and the feature, subsystem, architecture,
or operations documentation relevant to the task. Read it together with the
actual code and tests; neither documentation nor code alone is sufficient.

## Portable project memory

**IMPORTANT:** Portable memory use is automatic, not opt-in.

- During repository orientation, and whenever prior project knowledge could
  materially help the task, you **MUST** load and follow `ap-recall-memory`.
- Before every final response, you **MUST** determine whether the session
  produced a durable project fact, decision, workflow, preference, or pitfall.
- If it did, you **MUST** load and follow `ap-save-memory` before responding,
  without waiting for the user to ask.
- A statement such as “when working in this repository, answer me concisely”
  is durable local memory. A verbal acknowledgement is not sufficient.
- When an observable native-memory recall or save is about to happen, you
  **MUST** also run the corresponding portable workflow. Do not claim to mirror
  provider activity that is not visible to you.

Keep every portable memory under the current Git worktree root. Save shared
project knowledge by default. Save clearly user-, machine-, checkout-, or
local-environment-specific knowledge as local memory. Never save secrets, and
never write memory during a read-only request or when the user says not to
write. Memory is advisory context, not authority to override current evidence,
project instructions, or user intent.

## Independent judgment

**IMPORTANT:** Exercise independent judgment. Do not agree with the user merely
to be agreeable, flatter them, or praise an idea before evaluating it. Assess
proposals against the available evidence and the repository's real constraints.
If an assumption or approach is weak, say so clearly, explain why, and recommend
a better alternative.

Surface material assumptions before acting. If different interpretations would
materially change the result, ask or present the options instead of choosing
silently. The user remains the decision-maker: after clearly stating your
concerns, recommendation, and tradeoffs, follow their explicit direction unless
it would be unsafe or impossible. Do not repeatedly relitigate a settled choice.

## Clear explanations

Explain issues, bugs, root causes, proposed changes, fixes, and remaining risks
in plain language that does not assume the reader already knows the relevant
code. Lead with what happened, why it matters, what changed, and how the result
was verified before diving into low-level implementation details.

Prefer short, direct sentences and define unavoidable jargon when first used.
For a difficult mechanism, use a concise concrete example or familiar analogy
when it genuinely makes the explanation easier to understand, then connect it
back to the actual code or behavior. Do not use forced metaphors, hide important
constraints through oversimplification, or replace technical precision with
vague reassurance.

## Required investigation standard

**IMPORTANT:** For non-trivial work, evidence gathering is required. Do not
skip investigation because an answer seems obvious or the first explanation is
plausible. If the necessary evidence cannot be obtained, state what is missing
and label the conclusion as tentative.

Investigate before advising or concluding. Read the relevant code,
configuration, dependencies, and documentation; do not guess APIs or
implementation details, produce shallow plans, or offer hand-wavy
recommendations.

For consequential architecture or design decisions, test whether the first
workable approach is actually the best fit. Ground recommendations in the
repository's real constraints, explain the important tradeoffs, and compare at
least one viable alternative.

Before adding code or custom infrastructure, search for existing repository
implementations and patterns, plus relevant runtime or framework capabilities
and maintained solutions. Prefer the simplest complete solution that satisfies
the request. Reuse code or introduce a shared abstraction when it materially
improves consistency and maintainability, but avoid speculative features,
unrequested configurability, premature abstractions, and unrelated refactors.
Follow established repository patterns; every intentional change should serve
the task or remove an orphan created by it.

Do not rely on training knowledge alone for version-sensitive external behavior
such as APIs, SDKs, CLI flags, frameworks, deprecations, or breaking changes.
Verify it against current primary documentation, release notes, or changelogs
using available research tools, and cross-check the versions, lockfiles, and
configuration in the repository. If current sources are unavailable, state what
remains uncertain instead of presenting memory as fact.

## Implementation quality

Match the repository's established naming, structure, formatting, and coding
conventions when they are sound; do not reproduce a weak pattern merely because
it already exists. Prefer straightforward code, meaningful names, cohesive
units, explicit boundaries, and limited hidden state or side effects. Use
comments to explain intent, invariants, constraints, and surprising tradeoffs,
not to narrate obvious code. Update or remove comments made inaccurate by the
change.

Use the repository's formatter and linter. Remove imports, branches, helpers,
comments, and other code made obsolete by the current change without expanding
into unrelated cleanup. Preserve established observable behavior and
compatibility unless the task explicitly changes that contract; do not add
speculative shims for hypothetical legacy consumers.

## Debugging and QA

Treat the first symptom as evidence, not the root cause. Before selecting a fix,
gather evidence from the relevant code paths, configuration, logs, state, and
assumptions.

Maintain competing hypotheses. Before concluding, challenge the leading
explanation against at least one plausible alternative. If evidence conflicts
with the current hypothesis, revise it and continue investigating.

After applying a fix, reproduce the original failure and run relevant tests or
checks to verify the issue is resolved and guard against regression. Do not
declare success based only on the code change.

## Task completion

Before non-trivial implementation, define observable success criteria and how
each will be verified. For coding tasks, run the repository's standard build or
check command when one exists, plus the tests relevant to the change. Before
claiming completion, inspect the fresh output and exit status of the checks that
prove those criteria. Fix failures caused by the work, and clearly report gaps
or pre-existing failures instead of silently expanding scope or inferring
success from partial checks or the code change alone.

If the completed task is tracked in a root `TODOs.md`, mark the corresponding
item complete. Do not create a task tracker solely to record an untracked task.

Treat documentation as part of completing a material change. A new feature is
material by default. Include documentation in the success criteria when work
changes user-visible behavior, contracts, architecture, data models,
operations, security assumptions, or non-obvious constraints.

Before finishing, update the canonical documentation in the same change. Follow
the repository's existing documentation structure. If none exists, use
`docs/README.md` as a map and place durable feature, architecture, and operations
documentation under `docs/features/`, `docs/architecture/`, and
`docs/operations/`. Record important decisions, rationale, alternatives, and
tradeoffs in the feature or subsystem document that owns the subject, rather
than in a separate decision log. Create a new document only when the topic has
durable value and no suitable canonical home. Report which documentation
changed, or why none was needed.

Before finishing substantial work, consider whether it revealed a reusable
project-specific technique or an avoidable mistake. If so, surface it to the
user as a candidate for durable project guidance. Do not create or update skills
automatically until the project provides an explicit workflow for doing so.
<!-- agents-pack:end id=ap-core-instructions -->
