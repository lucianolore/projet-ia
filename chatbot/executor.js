// Executor: routes tool calls to appropriate adapters
// Tool name format: "source:toolName" → dispatch to adapter

class ToolExecutor {
  constructor() {
    this.adapters = new Map();
    this.toolRegistry = [];
  }

  registerAdapter(source, adapter) {
    this.adapters.set(source, adapter);
  }

  registerTools(tools) {
    this.toolRegistry = tools;
  }

  async execute(toolName, params) {
    const [source, tool] = toolName.split(':');
    const adapter = this.adapters.get(source);

    if (!adapter) {
      throw new Error(`Adapter not found: ${source}`);
    }

    try {
      console.log(`[EXEC] ${toolName}`, JSON.stringify(params, null, 2));
      const result = await adapter.execute(tool, params);
      console.log(`[OK] ${toolName}`);
      return result;
    } catch (err) {
      console.error(`[ERR] ${toolName}:`, err.message);
      throw err;
    }
  }

  getToolDefinitions() {
    // Return tool defs for Claude system prompt
    return this.toolRegistry;
  }
}

module.exports = ToolExecutor;
