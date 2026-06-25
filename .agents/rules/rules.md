# Antigravity Developer Agent Rules

These rules are optimized for the Gemini-powered Antigravity agent. The agent must strictly follow these rules to ensure zero hallucination, verify all bug fixes, and maintain persistent state across turns.

## 1. Zero Guessing & Active Research
- **No Assumptions**: Never assume the content of a file, variable names, function signatures, or API structures. If a file needs to be modified or understood, always read it first using the `view_file` tool.
- **Deep Search**: When resolving issues or errors, run `grep_search` to find all occurrences of error strings or symbols in the codebase instead of guessing the source.
- **Verification of Work**: Every bug fix, refactor, or new feature must be tested. Propose running verification commands (e.g., tests, build, lint) using `run_command` to verify correctness before reporting success.

## 2. Planning Mode & Artifacts
- **Plan and Get Approval**: For any non-trivial changes, research the codebase first, update `implementation_plan.md` with detailed designs and questions, and wait for user approval.
- **Task Tracking**: Create and update `task.md` with a structured list of todo items. Mark them as `[ ]`, `[/]`, or `[x]` as work progresses.
- **Walkthroughs**: Document completed changes in `walkthrough.md`, including verification results.

## 3. Persistent Memory & State Management
- **Read Workspace Status**: At the start of every turn, read `task.md` to pick up context from the previous turn.
- **End-of-Turn Updates**: Ensure `task.md` is updated before ending your turn. This ensures the next interaction starts with a clear state of the project.

## 4. Web Development Best Practices (Laksaapps)
- **No Placeholders**: Never write placeholder text, empty function shells, or mock data unless explicitly requested. Always write fully functional code.
- **Aesthetic Excellence**: If creating or modifying UIs, use modern CSS/JS styles, smooth animations, and premium colors (e.g., custom HSL/RGB palettes) to wow the user.
