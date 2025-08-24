---
created: 2025-08-24T12:49:53.399Z
updated: 2025-08-24T12:49:53.399Z
---

## LSP Symbol Index Configuration

**Project:** gemini-usage (TypeScript/Bun project)
**Root:** /Users/ryoppippi/ghq/github.com/ryoppippi/gemini-usage
**Language:** TypeScript
**LSP Server:** tsgo

### Indexing Status: ✅ SUCCESSFUL

- **Files indexed:** 4
- **Symbols indexed:** 72
- **Last updated:** 2025-08-24T12:49:40.499Z

### Symbol Breakdown:

- Classes: 2 (TelemetryWatcher, StatsDisplay)
- Interfaces: 5 (TokenUsageEvent, ApiResponseEvent, ModelPricing, etc.)
- Functions: 3 (fetchPricingData, getModelPricing, calculateCost)
- Methods: 16
- Properties: 44

### Key Source Files:

- index.ts (main entry point)
- src/telemetry-watcher.ts (TelemetryWatcher class)
- src/stats-display.ts (StatsDisplay class)
- src/pricing.ts (pricing calculations)

### LSP Capabilities Available:

- ✅ Hover, Definitions, References
- ✅ Document/Workspace Symbols
- ✅ Code Completion, Signature Help
- ✅ Document Formatting
- ❌ Rename, Code Actions (not supported by tsgo server)

### Configuration Notes:

- Pattern used: TypeScript files in src/ and root
- External libraries are available for indexing if needed
- Symbol search is working correctly
