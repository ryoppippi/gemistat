# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is `gemistat`, a wrapper for [gemini-cli](https://github.com/google-gemini/gemini-cli) that tracks token usage and costs in real-time. The project uses Bun as the runtime and TypeScript for type safety.

## Guide for lsmcp mcp

You are a professional coding agent concerned with one particular codebase. You have
access to semantic coding tools on which you rely heavily for all your work, as well as collection of memory
files containing general information about the codebase. You operate in a frugal and intelligent manner, always
keeping in mind to not read or generate content that is not needed for the task at hand.

When reading code in order to answer a user question or task, you should try reading only the necessary code.
Some tasks may require you to understand the architecture of large parts of the codebase, while for others,
it may be enough to read a small set of symbols or a single file.
Generally, you should avoid reading entire files unless it is absolutely necessary, instead relying on
intelligent step-by-step acquisition of information. Use the symbol indexing tools to efficiently navigate the codebase.

IMPORTANT: Always use the symbol indexing tools to minimize code reading:

- Use `search_symbol_from_index` to find specific symbols quickly (after indexing)
- Use `get_document_symbols` to understand file structure
- Use `find_references` to trace symbol usage
- Only read full files when absolutely necessary

You can achieve intelligent code reading by:

1. Using `index_files` to build symbol index for fast searching
2. Using `search_symbol_from_index` with filters (name, kind, file, container) to find symbols
3. Using `get_document_symbols` to understand file structure
4. Using `get_definitions`, `find_references` to trace relationships
5. Using standard file operations when needed

## Working with Symbols

Symbols are identified by their name, kind, file location, and container. Use these tools:

- `index_files` - Build symbol index for files matching pattern (e.g., '\*_/_.ts')
- `search_symbol_from_index` - Fast search by name, kind (Class, Function, etc.), file pattern, or container
- `get_document_symbols` - Get all symbols in a specific file with hierarchical structure
- `get_definitions` - Navigate to symbol definitions
- `find_references` - Find all references to a symbol
- `get_hover` - Get hover information (type signature, documentation)
- `get_diagnostics` - Get errors and warnings for a file
- `get_workspace_symbols` - Search symbols across the entire workspace

Always prefer indexed searches (tools with `_from_index` suffix) over reading entire files.

## Development Commands

- `bun run start` - Run the main application (wrapper for gemini-cli)
- `bun run typecheck` - Type check TypeScript files using tsgo
- `bun run lint` - Run ESLint to check code quality
- `bun run format` - Run ESLint with --fix to format code
- `bun run test` - Run vitest tests (supports in-source testing with global imports)

## Running the Application

The main entry point is `index.ts` which acts as a wrapper around gemini-cli:

```bash
# Run directly
bun run index.ts

# Or with arguments (any gemini-cli arguments work)
bun run index.ts --model gemini-2.0-flash-exp
./index.ts chat
```

## Configuration

The application supports environment variables for configuring output directories and files:

- `GEMISTAT_OUTPUT_DIR` - Directory to save telemetry files (default: `~/.gemini/usage`)
- `GEMISTAT_TELEMETRY_FILE` - Telemetry file name (default: `gemini-telemetry.jsonl`)

Examples:

```bash
# Use default directory (~/.gemini/usage)
./index.ts chat

# Custom directory
GEMISTAT_OUTPUT_DIR=/tmp/gemini-logs ./index.ts chat

# Custom directory and file names
GEMISTAT_OUTPUT_DIR=/tmp/logs GEMISTAT_TELEMETRY_FILE=my-telemetry.jsonl ./index.ts chat
```

## Architecture

The codebase follows a modular architecture with three main components:

### Core Files

- `index.ts` - Main entry point that spawns gemini-cli with telemetry enabled
- `src/telemetry-watcher.ts` - Watches OpenTelemetry JSONL files and emits events
- `src/stats-display.ts` - Manages real-time display of token usage and costs
- `src/pricing.ts` - Fetches and caches model pricing data from LiteLLM

### Key Concepts

1. **Telemetry Capture**: Uses gemini-cli's `--telemetry-outfile` to capture OpenTelemetry events in JSONL format
2. **Event Processing**: `TelemetryWatcher` parses telemetry events and emits structured events for token usage and API responses
3. **Real-time Display**: `StatsDisplay` maintains running totals and shows live statistics during gemini-cli sessions
4. **Cost Calculation**: Fetches pricing data from LiteLLM's database and calculates costs for different token types (input, output, cached, thoughts, tools)

### Event Flow

```
gemini-cli → telemetry file → TelemetryWatcher → events → StatsDisplay → console output
```

## Output Files

- `gemini-telemetry.jsonl` - Raw OpenTelemetry events (auto-generated, in .gitignore)

## Dependencies

- **Runtime**: Bun (required) - handles TypeScript execution and package management
- **External Tools**: gemini-cli (required) - the wrapped CLI tool
- **Dev Dependencies**: ESLint, TypeScript tooling, MCP servers for enhanced development

## Model Support

- Supports all gemini-cli models with automatic pricing from LiteLLM
- Experimental models (like gemini-2.0-flash-exp) are tracked as "Free" during experimental phase
- Handles various token types: input, output, cached, thoughts, tools

## Code Style Notes

- Uses ESLint for linting and formatting with tab indentation and double quotes
- TypeScript with strict mode and bundler module resolution
- No console.log allowed except where explicitly disabled with eslint-disable
- Error handling: silently skips malformed JSONL lines during parsing
- File paths always use Node.js path utilities for cross-platform compatibility
- **Import conventions**: Use `.ts` extensions for local file imports (e.g., `import { foo } from './utils.ts'`)

**Error Handling:**

- **Prefer @praha/byethrow Result type** over traditional try-catch for functional error handling
  - Documentation: Available via byethrow MCP server
- Use `Result.try()` for wrapping operations that may throw (JSON parsing, etc.)
- Use `Result.isFailure()` for checking errors (more readable than `!Result.isSuccess()`)
- Use early return pattern (`if (Result.isFailure(result)) continue;`) instead of ternary operators
- For async operations: create wrapper function with `Result.try()` then call it
- Keep traditional try-catch only for: file I/O with complex error handling, legacy code that's hard to refactor
- Always use `Result.isFailure()` and `Result.isSuccess()` type guards for better code clarity

**Naming Conventions:**

- Variables: start with lowercase (camelCase) - e.g., `usageDataSchema`, `modelBreakdownSchema`
- Types: start with uppercase (PascalCase) - e.g., `UsageData`, `ModelBreakdown`
- Constants: can use UPPER_SNAKE_CASE - e.g., `DEFAULT_CLAUDE_CODE_PATH`
- Internal files: use underscore prefix - e.g., `_types.ts`, `_utils.ts`, `_consts.ts`

**Export Rules:**

- **IMPORTANT**: Only export constants, functions, and types that are actually used by other modules
- Internal/private constants that are only used within the same file should NOT be exported
- Always check if a constant is used elsewhere before making it `export const` vs just `const`
- This follows the principle of minimizing the public API surface area
- Dependencies should always be added as `devDependencies` unless explicitly requested otherwise

**Post-Code Change Workflow:**

After making any code changes, ALWAYS run these commands in parallel:

- `bun run format` - Auto-fix and format code with ESLint (includes linting)
- `bun typecheck` - Type check with TypeScript
- `bun run test` - Run all tests

This ensures code quality and catches issues immediately after changes.

**LiteLLM Integration Notes:**

- Cost calculations require exact model name matches with LiteLLM's database
- Test failures often indicate model names don't exist in LiteLLM's pricing data
- Future model updates require checking LiteLLM compatibility first
- The application cannot calculate costs for models not supported by LiteLLM

# Tips for Claude Code

- [gunshi](https://gunshi.dev/llms.txt) - Documentation available via Gunshi MCP server
- Context7 MCP server available for library documentation lookup
- do not use console.log. use logger.ts instead
- **IMPORTANT**: When searching for TypeScript functions, types, or symbols in the codebase, ALWAYS use TypeScript MCP (lsmcp) tools like `get_definitions`, `find_references`, `get_hover`, etc. DO NOT use grep/rg for searching TypeScript code structures.
- **CRITICAL VITEST REMINDER**: Vitest globals are enabled - use `describe`, `it`, `expect` directly WITHOUT imports. NEVER use `await import()` dynamic imports anywhere, especially in test blocks.

# important-instruction-reminders

Do what has been asked; nothing more, nothing less.
NEVER create files unless they're absolutely necessary for achieving your goal.
ALWAYS prefer editing an existing file to creating a new one.
NEVER proactively create documentation files (\*.md) or README files. Only create documentation files if explicitly requested by the User.
Dependencies should always be added as devDependencies unless explicitly requested otherwise.
