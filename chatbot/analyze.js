// AI analysis of data already displayed to the user (a table, a comparison,
// a chart's underlying rows) - backed by the fiscal-analysis skill.
// Distinct from chat(): this is not "find me data", it's "interpret the data
// I'm already looking at", so the skill's methodology/glossary/caveats are
// injected into the system prompt for this call only.

require('dotenv').config();

const { chat } = require('./claude-integration');
const { loadSkill } = require('./skills');

async function analyzeData({ data, question }, executor, priorHistory = []) {
  if (data === undefined) {
    throw new Error('analyzeData requires "data" (the displayed data to interpret)');
  }

  const skill = loadSkill('fiscal-analysis');
  const extraSystemPrompt = `# Skill active : ${skill.frontmatter.name || 'fiscal-analysis'}\n\n${skill.body}`;

  const userMessage = [
    question || 'Analyse ces données affichées à l\'utilisateur.',
    '',
    'Données actuellement affichées à l\'écran (JSON) :',
    '```json',
    JSON.stringify(data, null, 2),
    '```',
  ].join('\n');

  return chat(userMessage, executor, priorHistory, extraSystemPrompt);
}

module.exports = { analyzeData };
