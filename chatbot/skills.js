// Generic skill loader - reads a SKILL.md (YAML frontmatter + markdown body)
// from skills/<name>/SKILL.md. New skills: add a folder, no code change here
// (same open/closed pattern as adapters/).

const fs = require('fs');
const path = require('path');

function loadSkill(skillName) {
  const skillPath = path.join(__dirname, 'skills', skillName, 'SKILL.md');
  const raw = fs.readFileSync(skillPath, 'utf-8');

  const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: raw.trim() };

  const [, frontmatterRaw, body] = match;
  const frontmatter = {};
  for (const line of frontmatterRaw.split('\n')) {
    const m = line.match(/^(\w+):\s*"?(.*?)"?\s*$/);
    if (m) frontmatter[m[1]] = m[2];
  }

  return { frontmatter, body: body.trim() };
}

module.exports = { loadSkill };
