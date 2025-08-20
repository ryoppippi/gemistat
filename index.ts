#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { appendFileSync } from "node:fs";
import { TelemetryWatcher } from "./src/telemetry-watcher";
import { StatsDisplay } from "./src/stats-display";

const geminiPath = Bun.which("gemini");
if (!geminiPath) {
  throw new Error("Gemini CLI not found. Please install it first.");
}

// Use current directory for telemetry and debug files
const telemetryFile = "gemini-telemetry.jsonl";
const debugLogFile = "gemini-usage-debug.log";

const logDebug = (message: string) => {
  const timestamp = new Date().toISOString();
  appendFileSync(debugLogFile, `[${timestamp}] ${message}\n`);
};

logDebug(`Starting gemini-usage wrapper`);
logDebug(`Telemetry file: ${telemetryFile}`);

// Parse command line arguments
const args = process.argv.slice(2);

// Add telemetry flags if not already present
const telemetryArgs = [
  "--telemetry",
  "--telemetry-target=local",
  "--telemetry-otlp-endpoint=",
  `--telemetry-outfile=${telemetryFile}`,
];

// Merge args, preserving user's flags if they conflict
const finalArgs = [...args];
for (const arg of telemetryArgs) {
  const flagName = arg.split("=")[0];
  if (flagName && !finalArgs.some((a) => a.startsWith(flagName))) {
    finalArgs.push(arg);
  }
}

logDebug(`Final args: ${JSON.stringify(finalArgs)}`);

// Initialize telemetry watcher and stats display
const watcher = new TelemetryWatcher(telemetryFile);
const display = new StatsDisplay();

// Connect watcher events to display
watcher.on("token-usage", (data) => {
  logDebug(`Token usage event: ${JSON.stringify(data)}`);
  display.updateTokenUsage(data);
});

watcher.on("api-response", async (data) => {
  logDebug(`API response event: ${JSON.stringify(data)}`);
  await display.updateApiResponse(data);
  
  // Log cost calculation
  const { calculateCost } = await import("./src/pricing");
  const cost = await calculateCost(
    data.model,
    data.inputTokenCount,
    data.outputTokenCount,
    data.cachedTokenCount || 0,
    data.thoughtsTokenCount || 0,
    data.toolTokenCount || 0
  );
  
  if (cost) {
    logDebug(`Cost calculation for ${data.model}: ${JSON.stringify(cost)}`);
    logDebug(`Total cost so far: $${cost.totalCost.toFixed(6)}`);
  } else {
    logDebug(`No pricing data available for model: ${data.model}`);
  }
});

watcher.on("raw-event", (event) => {
  logDebug(`Raw telemetry event: ${JSON.stringify(event)}`);
});

// Start watching for telemetry data
watcher.start();

// Spawn gemini CLI with telemetry enabled
const child = spawn(geminiPath, finalArgs, {
  stdio: "inherit",
  env: {
    ...process.env,
    // Ensure telemetry is enabled even if disabled in settings
    GEMINI_TELEMETRY_ENABLED: "true",
  },
});

// Clean up on exit
const cleanup = async () => {
  logDebug("Cleaning up...");
  watcher.stop();
  
  // Log final statistics to debug file
  const stats = display.getStats();
  if (stats.size > 0) {
    logDebug("=== Final Session Statistics ===");
    let totalCost = 0;
    for (const [model, modelStats] of stats) {
      logDebug(`Model: ${model}`);
      logDebug(`  Requests: ${modelStats.requests}`);
      logDebug(`  Input tokens: ${modelStats.inputTokens}`);
      logDebug(`  Output tokens: ${modelStats.outputTokens}`);
      logDebug(`  Total tokens: ${modelStats.totalTokens}`);
      logDebug(`  Cost: $${modelStats.totalCost.toFixed(6)}`);
      totalCost += modelStats.totalCost;
    }
    logDebug(`Total session cost: $${totalCost.toFixed(6)}`);
    logDebug("================================");
  }
  
  display.showFinalStats();
  logDebug("Cleanup complete");
};

child.on("exit", (code) => {
  cleanup();
  process.exit(code || 0);
});

process.on("SIGINT", () => {
  child.kill("SIGINT");
  cleanup();
  process.exit(0);
});

process.on("SIGTERM", () => {
  child.kill("SIGTERM");
  cleanup();
  process.exit(0);
});