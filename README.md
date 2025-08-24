# gemini-usage

A wrapper for [gemini-cli](https://github.com/google-gemini/gemini-cli) that tracks token usage and costs in real-time.

## Features

- 🎯 **Accurate token tracking** - Uses gemini-cli's native telemetry system for 100% accuracy
- 💰 **Real-time cost calculation** - Shows costs based on current LiteLLM pricing data
- 📊 **Live statistics display** - Updates token usage and costs as you chat
- 🔍 **Debug logging** - Detailed event logs for troubleshooting
- 🚀 **Zero configuration** - Works out of the box with your existing gemini-cli setup

## Installation

```bash
# Clone the repository
git clone https://github.com/ryoppippi/gemini-usage
cd gemini-usage

# Install dependencies
bun install

# Make executable
chmod +x index.ts
```

## Prerequisites

- [Bun](https://bun.sh) runtime
- [gemini-cli](https://github.com/google-gemini/gemini-cli) installed and configured

## Usage

Use it exactly like gemini-cli:

```bash
# Run with any gemini-cli command
./index.ts [gemini-cli-options]

# Examples
./index.ts
./index.ts --model gemini-2.0-flash-exp
./index.ts chat
```

The wrapper will display real-time token usage and costs while preserving all gemini-cli functionality.

## How it works

1. **Telemetry capture**: Uses `--telemetry-outfile` to capture gemini-cli's OpenTelemetry events
2. **Event parsing**: Watches the telemetry file and parses token usage events
3. **Cost calculation**: Fetches latest pricing from LiteLLM and calculates costs
4. **Live display**: Shows statistics in real-time without interfering with gemini-cli's output

## Configuration

You can customize where files are saved using environment variables:

- `GEMINI_USAGE_OUTPUT_DIR` - Directory to save telemetry and debug files (default: `~/.gemini/usage`)
- `GEMINI_USAGE_TELEMETRY_FILE` - Telemetry file name (default: `gemini-telemetry.jsonl`)
- `GEMINI_USAGE_DEBUG_FILE` - Debug log file name (default: `gemini-usage-debug.log`)

Examples:

```bash
# Use default directory (~/.gemini/usage)
./index.ts chat

# Custom directory
GEMINI_USAGE_OUTPUT_DIR=/tmp/gemini-logs ./index.ts chat

# Custom directory and file names
GEMINI_USAGE_OUTPUT_DIR=/tmp/logs GEMINI_USAGE_TELEMETRY_FILE=my-telemetry.jsonl ./index.ts chat
```

## Output files

- `gemini-telemetry.jsonl` - Raw OpenTelemetry events from gemini-cli
- `gemini-usage-debug.log` - Detailed debug information including all events and cost calculations

Files are saved to the configured directory (default: `~/.gemini/usage`).

## Session Summary

After your session ends, you'll see a summary table like this:

```
═══════════════════════════════════════════════════════════════════
                     Gemini Usage Summary
═══════════════════════════════════════════════════════════════════
┌─────────────────────────┬──────────┬────────────┬────────────┬────────────┬────────────┐
│ Model                   │ Requests │   Input    │   Output   │   Total    │    Cost    │
├─────────────────────────┼──────────┼────────────┼────────────┼────────────┼────────────┤
│ gemini-2.5-pro          │        2 │     11.1K  │        59  │      5.1K  │    $0.02   │
└─────────────────────────┴──────────┴────────────┴────────────┴────────────┴────────────┘
Session Duration: 7s
```

## Supported Models

Pricing data is automatically fetched from [LiteLLM's model database](https://github.com/BerriAI/litellm/blob/main/model_prices_and_context_window.json). Experimental models (like gemini-2.0-flash-exp) are tracked but show as "Free" during their experimental phase.

## Development

```bash
# Run TypeScript checks
bun run tsc --noEmit

# Clean up generated files
rm -f gemini-usage-debug.log gemini-telemetry.jsonl
```

## License

MIT

## Credits

- Built for [gemini-cli](https://github.com/google-gemini/gemini-cli)
- Pricing data from [LiteLLM](https://github.com/BerriAI/litellm)
- Inspired by [ccusage](https://github.com/ryoppippi/ccusage)

---

This project was created using `bun init` in bun v1.2.19. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
