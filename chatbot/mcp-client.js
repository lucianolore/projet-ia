// MCP client: connects this standalone Node app to the official data.gouv.fr
// MCP server (https://github.com/datagouv/datagouv-mcp).
//
// This process is NOT running inside Claude Code's own MCP session - it is an
// independent app, so it must open its own client connection to the server.
//
// The server is remote HTTP (Streamable HTTP) only - no stdio/SSE.
// Default endpoint: https://mcp.data.gouv.fr/mcp
//
// Configure via env vars (see .env.example):
//   DATAGOUV_MCP_URL     = server URL (default: https://mcp.data.gouv.fr/mcp)
//   DATAGOUV_MCP_API_KEY = bearer token, only if you run a private/gated instance

const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');

const DEFAULT_URL = 'https://mcp.data.gouv.fr/mcp';

class MCPClient {
  constructor(config = {}) {
    this.config = config;
    this.client = null;
    this.connected = false;
  }

  async connect() {
    if (this.connected) return;

    const url = this.config.url || process.env.DATAGOUV_MCP_URL || DEFAULT_URL;
    const apiKey = this.config.apiKey || process.env.DATAGOUV_MCP_API_KEY;

    const transport = new StreamableHTTPClientTransport(new URL(url), {
      requestInit: apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : undefined,
    });

    this.client = new Client({ name: 'wim-chatbot', version: '1.0.0' }, { capabilities: {} });
    await this.client.connect(transport);
    this.connected = true;
  }

  async call(toolId, params) {
    await this.connect();

    const cleanParams = Object.fromEntries(
      Object.entries(params || {}).filter(([, v]) => v !== undefined),
    );

    const result = await this.client.callTool({ name: toolId, arguments: cleanParams });

    if (result.isError) {
      const message = result.content?.map((c) => c.text).join('\n') || 'MCP tool call failed';
      throw new Error(message);
    }

    // MCP tool results come back as content blocks; unwrap text/JSON blocks
    const textBlocks = (result.content || []).filter((c) => c.type === 'text').map((c) => c.text);
    if (textBlocks.length === 1) {
      try {
        return JSON.parse(textBlocks[0]);
      } catch {
        return textBlocks[0];
      }
    }
    return textBlocks;
  }

  async close() {
    if (this.client && this.connected) {
      await this.client.close();
      this.connected = false;
    }
  }
}

module.exports = MCPClient;
