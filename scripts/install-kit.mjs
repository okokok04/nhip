#!/usr/bin/env node
// Copies the vibe kit (.agents/ + AGENTS.md) into another repository.
//
// Usage:
//   node scripts/install-kit.mjs --target ../my-other-repo
//   node scripts/install-kit.mjs --target ../repo --skills vibe-kickoff,systematic-debugging
//   node scripts/install-kit.mjs --target ../repo --dry-run
//   node scripts/install-kit.mjs --target ../repo --force
//
// Safety defaults:
//   - Never overwrites existing files unless --force is passed.
//   - AGENTS.md is only written when absent; otherwise a merge note is printed.
//   - Paths outside the target are never touched.

import { cp, mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const KIT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS_DIR = path.join(KIT_ROOT, '.agents', 'skills');
const RULES_DIR = path.join(KIT_ROOT, '.agents', 'rules');
const HOOKS_DIR = path.join(KIT_ROOT, '.agents', 'hooks');
const AGENTS_FILE = path.join(KIT_ROOT, 'AGENTS.md');
const HOOKS_FILE = path.join(KIT_ROOT, '.agents', 'hooks.json');

function parseArgs(argv) {
  const opts = { target: '', skills: null, rules: true, hooks: true, dryRun: false, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`Missing value for ${arg}`);
      return argv[i];
    };
    switch (arg) {
      case '--target': opts.target = next(); break;
      case '--skills': opts.skills = next().split(',').map((s) => s.trim()).filter(Boolean); break;
      case '--no-rules': opts.rules = false; break;
      case '--no-hooks': opts.hooks = false; break;
      case '--dry-run': opts.dryRun = true; break;
      case '--force': opts.force = true; break;
      case '--help': case '-h': opts.help = true; break;
      default: throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return opts;
}

const HELP = `
vibe-kit installer

  node scripts/install-kit.mjs --target <path> [options]

Options
  --target <path>     Repository to install into (required)
  --skills <a,b,c>    Install only these skills (default: all)
  --no-rules          Skip .agents/rules
  --no-hooks          Skip .agents/hooks.json and .agents/hooks
  --dry-run           Print the plan without writing
  --force             Overwrite existing files
  --help              Show this message

Installs
  <target>/AGENTS.md                (only if absent)
  <target>/.agents/rules/*.md
  <target>/.agents/skills/<name>/   (selected skills)
  <target>/.agents/hooks.json
  <target>/.agents/hooks/guard-command.mjs
`;

async function listSkillNames() {
  const entries = await readdir(SKILLS_DIR, { withFileTypes: true });
  return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
}

async function copyTree(from, to, { dryRun, force }) {
  if (existsSync(to) && !force) {
    console.log(`skip   ${to} (already exists, use --force)`);
    return 0;
  }
  if (dryRun) {
    console.log(`copy   ${from} -> ${to}`);
    return 1;
  }
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true, force: true, errorOnExist: false });
  console.log(`copy   ${to}`);
  return 1;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.target) {
    console.log(HELP.trim());
    if (!opts.help) process.exitCode = 1;
    return;
  }

  const target = path.resolve(opts.target);
  if (!existsSync(target) || !(await stat(target)).isDirectory()) {
    throw new Error(`Target is not an existing directory: ${target}`);
  }
  if (target === KIT_ROOT) {
    throw new Error('Target is the kit itself; pick another repository.');
  }

  const all = await listSkillNames();
  const selected = opts.skills ? all.filter((s) => opts.skills.includes(s)) : all;
  const missing = opts.skills ? opts.skills.filter((s) => !all.includes(s)) : [];
  if (missing.length) {
    console.warn(`warn   unknown skill(s): ${missing.join(', ')}`);
  }

  console.log(`target ${target}`);
  console.log(`skills ${selected.join(', ') || '(none)'}`);
  if (opts.dryRun) console.log('mode   dry-run\n');

  let count = 0;

  const agentsTarget = path.join(target, 'AGENTS.md');
  if (existsSync(agentsTarget)) {
    console.log('skip   AGENTS.md (exists — merge .agents/rules manually if needed)');
  } else if (opts.dryRun) {
    console.log('copy   AGENTS.md');
    count += 1;
  } else {
    await writeFile(agentsTarget, await readFile(AGENTS_FILE, 'utf8'), 'utf8');
    console.log('copy   AGENTS.md');
    count += 1;
  }

  if (opts.rules) {
    for (const rule of await readdir(RULES_DIR)) {
      count += await copyTree(
        path.join(RULES_DIR, rule),
        path.join(target, '.agents', 'rules', rule),
        opts,
      );
    }
  }

  for (const skill of selected) {
    count += await copyTree(
      path.join(SKILLS_DIR, skill),
      path.join(target, '.agents', 'skills', skill),
      opts,
    );
  }

  if (opts.hooks) {
    count += await copyTree(HOOKS_FILE, path.join(target, '.agents', 'hooks.json'), opts);
    count += await copyTree(HOOKS_DIR, path.join(target, '.agents', 'hooks'), opts);
  }

  console.log(`\n${opts.dryRun ? 'would install' : 'installed'} ${count} item(s).`);
  if (!opts.dryRun) {
    console.log('Next: open the repo and run your agent; skills appear under .agents/skills/.');
  }
}

main().catch((error) => {
  console.error(`error  ${error.message}`);
  process.exitCode = 1;
});
