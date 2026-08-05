import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const endpoint = process.env.PROBE_WS || "ws://127.0.0.1:18375";
const transport = new StdioClientTransport({
  command: "E:\\rjd\\nvm\\v22.15.0\\node.exe",
  args: ["E:\\rjd\\mcp\\weapp-dev-mcp\\dist\\index.js"],
  env: { ...process.env, WEAPP_WS_ENDPOINT: endpoint }
});
const client = new Client({ name: "probe", version: "1.0" });
await client.connect(transport);
const { tools } = await client.listTools();
console.log("=== TOOLS ===");
for (const t of tools) {
  console.log(`\n## ${t.name}`);
  if (t.description) console.log(t.description.slice(0, 200));
  if (t.inputSchema && t.inputSchema.properties) {
    console.log("  params:", Object.keys(t.inputSchema.properties).join(", "));
  }
}
await client.close();