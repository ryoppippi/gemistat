import type { TokenUsageEvent, ApiResponseEvent } from "./telemetry-watcher";
import { calculateCost } from "./pricing";

interface ModelStats {
  model: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  thoughtsTokens: number;
  toolTokens: number;
  totalTokens: number;
  totalCost: number;
  lastUpdated: Date;
}

export class StatsDisplay {
  private stats = new Map<string, ModelStats>();
  private sessionStartTime = new Date();
  private lastDisplayTime = 0;
  private displayInterval = 1000; // Update display every 1 second max

  constructor() {
    // Initialize pricing data on startup
    this.initializePricing();
  }

  getStats(): Map<string, ModelStats> {
    return this.stats;
  }

  private async initializePricing() {
    const { fetchPricingData } = await import("./pricing");
    await fetchPricingData();
  }

  updateTokenUsage(event: TokenUsageEvent) {
    const stats = this.getOrCreateStats(event.model);
    
    switch (event.type) {
      case "input":
        stats.inputTokens += event.count;
        break;
      case "output":
        stats.outputTokens += event.count;
        break;
      case "cache":
        stats.cachedTokens += event.count;
        break;
      case "thought":
        stats.thoughtsTokens += event.count;
        break;
      case "tool":
        stats.toolTokens += event.count;
        break;
    }
    
    stats.totalTokens = 
      stats.inputTokens + 
      stats.outputTokens + 
      stats.cachedTokens + 
      stats.thoughtsTokens + 
      stats.toolTokens;
    
    stats.lastUpdated = new Date();
    this.updateCost(stats);
    this.maybeDisplay();
  }

  async updateApiResponse(event: ApiResponseEvent) {
    const stats = this.getOrCreateStats(event.model);
    
    stats.requests++;
    stats.inputTokens += event.inputTokenCount;
    stats.outputTokens += event.outputTokenCount;
    stats.cachedTokens += event.cachedTokenCount || 0;
    stats.thoughtsTokens += event.thoughtsTokenCount || 0;
    stats.toolTokens += event.toolTokenCount || 0;
    stats.totalTokens = event.totalTokenCount || (
      stats.inputTokens + 
      stats.outputTokens + 
      stats.cachedTokens + 
      stats.thoughtsTokens + 
      stats.toolTokens
    );
    
    stats.lastUpdated = new Date();
    await this.updateCost(stats);
    this.maybeDisplay();
  }

  private getOrCreateStats(model: string): ModelStats {
    if (!this.stats.has(model)) {
      this.stats.set(model, {
        model,
        requests: 0,
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        thoughtsTokens: 0,
        toolTokens: 0,
        totalTokens: 0,
        totalCost: 0,
        lastUpdated: new Date(),
      });
    }
    return this.stats.get(model)!;
  }

  private async updateCost(stats: ModelStats) {
    const cost = await calculateCost(
      stats.model,
      stats.inputTokens,
      stats.outputTokens,
      stats.cachedTokens,
      stats.thoughtsTokens,
      stats.toolTokens
    );
    
    if (cost) {
      stats.totalCost = cost.totalCost;
    }
  }

  private maybeDisplay() {
    const now = Date.now();
    if (now - this.lastDisplayTime > this.displayInterval) {
      this.display();
      this.lastDisplayTime = now;
    }
  }

  private display() {
    // Clear previous output
    console.clear();
    
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("                        Gemini Usage Monitor                       ");
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log();
    
    if (this.stats.size === 0) {
      console.log("  Waiting for API calls...");
      console.log();
      return;
    }

    // Display table header
    console.log("┌─────────────────────────┬──────────┬────────────┬────────────┬────────────┬────────────┐");
    console.log("│ Model                   │ Requests │   Input    │   Output   │   Total    │    Cost    │");
    console.log("├─────────────────────────┼──────────┼────────────┼────────────┼────────────┼────────────┤");
    
    let totalRequests = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let totalTokens = 0;
    let totalCost = 0;

    // Sort by most recent activity
    const sortedStats = Array.from(this.stats.values())
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());

    for (const stats of sortedStats) {
      const modelName = stats.model.length > 23 
        ? stats.model.substring(0, 20) + "..." 
        : stats.model;
      
      const requests = stats.requests.toString().padStart(8);
      const input = this.formatTokens(stats.inputTokens);
      const output = this.formatTokens(stats.outputTokens);
      const total = this.formatTokens(stats.totalTokens);
      const cost = this.formatCost(stats.totalCost);
      
      console.log(`│ ${modelName.padEnd(23)} │ ${requests} │ ${input} │ ${output} │ ${total} │ ${cost} │`);
      
      // Show details if there are special tokens
      if (stats.cachedTokens > 0 || stats.thoughtsTokens > 0 || stats.toolTokens > 0) {
        let details = "│   ";
        if (stats.cachedTokens > 0) {
          details += `cached: ${this.formatTokens(stats.cachedTokens)} `;
        }
        if (stats.thoughtsTokens > 0) {
          details += `thoughts: ${this.formatTokens(stats.thoughtsTokens)} `;
        }
        if (stats.toolTokens > 0) {
          details += `tools: ${this.formatTokens(stats.toolTokens)} `;
        }
        console.log(details.padEnd(97) + "│");
      }
      
      totalRequests += stats.requests;
      totalInput += stats.inputTokens;
      totalOutput += stats.outputTokens;
      totalTokens += stats.totalTokens;
      totalCost += stats.totalCost;
    }
    
    // Display totals
    console.log("├─────────────────────────┼──────────┼────────────┼────────────┼────────────┼────────────┤");
    console.log(`│ TOTAL                   │ ${totalRequests.toString().padStart(8)} │ ${this.formatTokens(totalInput)} │ ${this.formatTokens(totalOutput)} │ ${this.formatTokens(totalTokens)} │ ${this.formatCost(totalCost)} │`);
    console.log("└─────────────────────────┴──────────┴────────────┴────────────┴────────────┴────────────┘");
    
    // Display session info
    const sessionDuration = this.formatDuration(Date.now() - this.sessionStartTime.getTime());
    console.log();
    console.log(`Session Duration: ${sessionDuration}`);
    console.log(`Last Updated: ${new Date().toLocaleTimeString()}`);
    console.log();
  }

  showFinalStats() {
    // Don't clear or overwrite the terminal - just append stats at the end
    // This preserves gemini's output
    
    if (this.stats.size === 0) {
      // No stats to show, exit silently
      return;
    }
    
    console.log();
    console.log("═══════════════════════════════════════════════════════════════════");
    console.log("                     Gemini Usage Summary                          ");
    console.log("═══════════════════════════════════════════════════════════════════");
    
    // Display table header
    console.log("┌─────────────────────────┬──────────┬────────────┬────────────┬────────────┬────────────┐");
    console.log("│ Model                   │ Requests │   Input    │   Output   │   Total    │    Cost    │");
    console.log("├─────────────────────────┼──────────┼────────────┼────────────┼────────────┼────────────┤");
    
    let totalRequests = 0;
    let totalInput = 0;
    let totalOutput = 0;
    let totalTokens = 0;
    let totalCost = 0;

    // Sort by most recent activity
    const sortedStats = Array.from(this.stats.values())
      .sort((a, b) => b.lastUpdated.getTime() - a.lastUpdated.getTime());

    for (const stats of sortedStats) {
      const modelName = stats.model.length > 23 
        ? stats.model.substring(0, 20) + "..." 
        : stats.model;
      
      const requests = stats.requests.toString().padStart(8);
      const input = this.formatTokens(stats.inputTokens);
      const output = this.formatTokens(stats.outputTokens);
      const total = this.formatTokens(stats.totalTokens);
      const cost = this.formatCost(stats.totalCost);
      
      console.log(`│ ${modelName.padEnd(23)} │ ${requests} │ ${input} │ ${output} │ ${total} │ ${cost} │`);
      
      totalRequests += stats.requests;
      totalInput += stats.inputTokens;
      totalOutput += stats.outputTokens;
      totalTokens += stats.totalTokens;
      totalCost += stats.totalCost;
    }
    
    // Display totals
    console.log("├─────────────────────────┼──────────┼────────────┼────────────┼────────────┼────────────┤");
    console.log(`│ TOTAL                   │ ${totalRequests.toString().padStart(8)} │ ${this.formatTokens(totalInput)} │ ${this.formatTokens(totalOutput)} │ ${this.formatTokens(totalTokens)} │ ${this.formatCost(totalCost)} │`);
    console.log("└─────────────────────────┴──────────┴────────────┴────────────┴────────────┴────────────┘");
    
    // Display session info
    const sessionDuration = this.formatDuration(Date.now() - this.sessionStartTime.getTime());
    console.log(`Session Duration: ${sessionDuration}`);
    console.log();
  }

  private formatTokens(count: number): string {
    if (count >= 1000000) {
      return `${(count / 1000000).toFixed(2)}M`.padStart(10);
    } else if (count >= 1000) {
      return `${(count / 1000).toFixed(1)}K`.padStart(10);
    } else {
      return count.toString().padStart(10);
    }
  }

  private formatCost(cost: number): string {
    if (cost === 0) {
      return "Free".padStart(10);
    } else if (cost < 0.01) {
      return `<$0.01`.padStart(10);
    } else {
      return `$${cost.toFixed(2)}`.padStart(10);
    }
  }

  private formatDuration(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }
}