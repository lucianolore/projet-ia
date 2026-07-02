// Single source of truth: builds the executor with all adapters registered.
// cli.js imports this instead of duplicating adapter wiring / tool definitions.

const ToolExecutor = require('./executor');
const DatagouvAdapter = require('./adapters/DatagouvAdapter');
const LocalTaxesAdapter = require('./adapters/LocalTaxesAdapter');
const MCPClient = require('./mcp-client');
const TOOL_DEFINITIONS = require('./tool-definitions.json');

function buildExecutor() {
  const executor = new ToolExecutor();

  const datagouvMcpClient = new MCPClient();

  executor.registerAdapter('datagouv', new DatagouvAdapter({ mcpTools: datagouvMcpClient }));
  executor.registerAdapter('taxes', new LocalTaxesAdapter());
  executor.registerTools(TOOL_DEFINITIONS);

  return executor;
}

module.exports = { buildExecutor, TOOL_DEFINITIONS };
