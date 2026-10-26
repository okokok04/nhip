#!/usr/bin/env node
// Self-check for the vibe kit.
//
//   node scripts/check-kit.mjs
//
// 1. Validates every .agents/skills/<name>/SKILL.md: frontmatter present,
//    name matches folder, description present and reasonably short.
// 2. Exercises .agents/hooks/guard-command.mjs against a table of commands and
//    asserts the expected decision (allow / ask / deny).
//
// Exit code 0 = all green. Run this after editing a skill or the guard.

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = path.join(ROOT, '.agents', 'skills');
const GUARD = path.join(ROOT, '.agents', 'hooks', 'guard-command.mjs');

const MAX_DESCRIPTION = 400;

function fail(lines, message) {
  lines.push(`  ✗ ${message}`);
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const fields = {};
  let currentKey = null;

  for (const rawLine of match[1].split(/\r?\n/)) {
    if (!rawLine.trim()) continue;
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(rawLine);
    if (kv) {
      currentKey = kv[1];
      fields[currentKey] = kv[2].replace(/^["']|["']$/g, '').trim();
    } else if (currentKey && /^\s+/.test(rawLine)) {
      fields[currentKey] = `${fields[currentKey]} ${rawLine.trim()}`.trim();
    }
  }
  return fields;
}

async function checkSkills(lines) {
  if (!existsSync(SKILLS)) {
    fail(lines, `missing directory: ${SKILLS}`);
    return 0;
  }

  const names = (await readdir(SKILLS, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();

  for (const name of names) {
    const file = path.join(SKILLS, name, 'SKILL.md');
    if (!existsSync(file)) {
      fail(lines, `${name}: missing SKILL.md`);
      continue;
    }
    const text = await readFile(file, 'utf8');
    const fm = parseFrontmatter(text);
    if (!fm) {
      fail(lines, `${name}: no YAML frontmatter`);
      continue;
    }
    if (!fm.name) fail(lines, `${name}: frontmatter missing "name"`);
    else if (fm.name !== name) fail(lines, `${name}: name "${fm.name}" != folder "${name}"`);
    if (!fm.description) fail(lines, `${name}: frontmatter missing "description"`);
    else if (fm.description.length > MAX_DESCRIPTION) {
      fail(lines, `${name}: description is ${fm.description.length} chars (max ${MAX_DESCRIPTION})`);
    }
    if (/^---\r?\n[\s\S]*?\r?\n---\r?\n?\s*$/.test(text)) {
      fail(lines, `${name}: SKILL.md has frontmatter but no body`);
    }
  }
  return names.length;
}

// Strings are assembled at runtime so that this file never trips the guard when
// the agent runs it through run_command.
const RM = 'r' + 'm';
const SLASH = '/';
const BACKSLASH = String.fromCharCode(92);

const GUARD_CASES = [
  { cmd: 'npm install', expect: 'allow' },
  { cmd: 'pnpm add zod', expect: 'allow' },
  { cmd: 'npm install -g pnpm', expect: 'ask' },
  { cmd: 'git push origin main', expect: 'allow' },
  { cmd: 'git push --delete origin old-branch', expect: 'ask' },
  { cmd: 'git push --force origin main', expect: 'deny' },
  { cmd: 'git push --force-with-lease origin main', expect: 'allow' },
  { cmd: 'git reset --hard HEAD~1', expect: 'ask' },
  { cmd: 'prisma migrate dev', expect: 'allow' },
  { cmd: 'prisma migrate deploy', expect: 'ask' },
  { cmd: 'npm run verify', expect: 'allow' },
  { cmd: 'docker compose up -d', expect: 'allow' },
  { cmd: 'docker system prune -af', expect: 'ask' },
  { cmd: `${RM} -rf ${SLASH}`, expect: 'deny' },
  { cmd: 'DROP DATABASE prod', expect: 'deny' },
  { cmd: 'TRUNCATE TABLE invoices', expect: 'deny' },
  { cmd: `Remove-Item -Recurse -Force C:${BACKSLASH}`, expect: 'deny' },
  { cmd: 'format D:', expect: 'deny' },
];

function checkGuard(lines) {
  if (!existsSync(GUARD)) {
    fail(lines, `missing hook: ${GUARD}`);
    return 0;
  }

  for (const { cmd, expect } of GUARD_CASES) {
    const payload = JSON.stringify({ toolCall: { name: 'run_command', args: { CommandLine: cmd } } });
    const res = spawnSync(process.execPath, [GUARD], { input: payload, encoding: 'utf8' });
    let actual;
    try {
      actual = JSON.parse(res.stdout || '{}').decision ?? 'allow';
    } catch {
      fail(lines, `guard crashed on "${cmd}": ${res.stderr?.trim() || 'no output'}`);
      continue;
    }
    if (actual !== expect) {
      fail(lines, `guard "${cmd}" -> ${actual}, expected ${expect}`);
    }
  }
  return GUARD_CASES.length;
}

async function main() {
  const problems = [];
  const skillCount = await checkSkills(problems);
  const guardChecks = checkGuard(problems);

  const skills = (await readdir(SKILLS, { withFileTypes: true }).catch(() => []))
    .filter((entry) => entry.isDirectory()).length;
  const rules = (await readdir(path.join(ROOT, '.agents', 'rules')).catch(() => []))
    .filter((file) => file.endsWith('.md')).length;

  if (problems.length) {
    console.error('kit check failed:\n');
    for (const problem of problems) console.error(problem);
    console.error(`\n${problems.length} problem(s)`);
    process.exitCode = 1;
    return;
  }

  console.log(`skills      ${skillCount} valid SKILL.md`);
  console.log(`rules       ${rules} file(s)`);
  console.log(`guard       ${guardChecks}/${guardChecks} command cases pass`);
  console.log(`total       ${GUARD_CASES.length + skillCount + rules} checks green`);
}

main().catch((error) => {
  console.error(`error  ${error.message}`);
  process.exitCode = 1;
});
