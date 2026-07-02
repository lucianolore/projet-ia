// Chatbot server: Express + Claude orchestration
// Claude calls tools via MCP/HTTP adapters, we execute them, send results back
//
// Single-provider by design: projet-ia/CLAUDE.md specifies "Claude API" for
// the NL interface. See chatbot/README.md for the prototype/validation status
// of this whole folder.

require('dotenv').config();

const express = require('express');
const { buildExecutor, TOOL_DEFINITIONS } = require('./bootstrap');
const { chat } = require('./claude-integration');

const app = express();
app.use(express.json());

const executor = buildExecutor();

// === Endpoints ===

app.post('/chat', async (req, res) => {
  const { message } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  try {
    const { finalText, history } = await chat(message, executor);
    res.json({ response: finalText, history });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/tool-call', async (req, res) => {
  const { toolName, params } = req.body;

  try {
    const result = await executor.execute(toolName, params);
    res.json({ toolName, params, result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/tools', (req, res) => {
  res.json({ tools: TOOL_DEFINITIONS });
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', adapters: Array.from(executor.adapters.keys()) });
});

// === Start Server ===

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Chatbot server running on port ${PORT}`);
  console.log(`Tools registered: ${executor.toolRegistry.length}`);
  console.log(`Adapters: ${Array.from(executor.adapters.keys()).join(', ')}`);
});

module.exports = app;
