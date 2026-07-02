// Minimal local backend for the frontend chat widget - single endpoint,
// no other routes. Not for production: in-memory sessions, permissive CORS,
// meant to run alongside `npm run dev` in frontend/ during local development.
//
// Usage: node local-server.js
// Frontend calls it via the Vite dev proxy (/api/* -> this server).

require('dotenv').config();

const express = require('express');
const { chat } = require('./claude-integration');
const { analyzeData } = require('./analyze');
const { buildExecutor } = require('./bootstrap');

const app = express();
app.use(express.json());

// Dev-only permissive CORS (Vite proxy makes this same-origin anyway, but
// this lets you also curl/test the endpoint directly without the frontend).
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

const executor = buildExecutor();

// sessionId -> Anthropic message history. In-memory only, lost on restart -
// fine for local dev, not a real session store.
const sessions = new Map();

app.post('/chat', async (req, res) => {
  const { message, sessionId } = req.body || {};

  if (!message) {
    return res.status(400).json({ error: 'Missing message' });
  }

  const id = sessionId || 'default';
  const priorHistory = sessions.get(id) || [];

  try {
    const { finalText, history } = await chat(message, executor, priorHistory);
    sessions.set(id, history);
    res.json({ response: finalText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/analyze', async (req, res) => {
  const { data, question, sessionId } = req.body || {};

  if (data === undefined) {
    return res.status(400).json({ error: 'Missing data' });
  }

  const id = sessionId || 'default';
  const priorHistory = sessions.get(id) || [];

  try {
    const { finalText, history } = await analyzeData({ data, question }, executor, priorHistory);
    sessions.set(id, history);
    res.json({ response: finalText });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', sessions: sessions.size });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Chatbot local backend on http://localhost:${PORT}`);
});
