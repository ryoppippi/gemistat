import { spawn } from "node:child_process";
import { join } from "node:path";

const geminiPath = Bun.which("gemini") 
if(!geminiPath) throw new Error("Gemini CLI not found. Please install it using `bun add gemini`.");

const interceptorPath = join(import.meta.dir, "network-interceptor.mjs");

// Get command line arguments 
// When using bun, process.argv structure is: [bun-path, script-path, ...args]
// When using node, it's: [node-path, script-path, ...args]
const args = process.argv.slice(2);

const child = spawn("node", [
	"--import", interceptorPath,
	geminiPath,
	...args  // Pass all arguments to gemini CLI
], {
	stdio: "inherit",
});

child.on("exit", (code) => {
	process.exit(code || 0);
});
