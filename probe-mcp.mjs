import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const transport = new StdioClientTransport({
  command: "E:\\rjd\\nvm\\v22.15.0\\node.exe",
  args: ["E:\\rjd\\mcp\\weapp-dev-mcp\\dist\\index.js"],
  env: { ...process.env, WEAPP_WS_ENDPOINT: "ws://127.0.0.1:17499" }
});
const client = new Client({ name: "probe", version: "1.0" });
await client.connect(transport);
const { tools } = await client.listTools();
console.log(tools.map(t => t.name).join("\n"));
await client.close();