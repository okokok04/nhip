#!/usr/bin/env node
/**
 * Kiểm "tổ chức" của dự án: ROLE.md, role cards, CHAT.md.
 *
 * Mục đích không phải là kiểm code, mà là kiểm **cách nhóm làm việc**. Ba thứ
 * hay hỏng lặng lẽ khi nhiều agent cùng chạy:
 *
 * 1. Role card mất/thiếu → một vai không biết mình sở hữu gì → sửa lẫn.
 * 2. CHAT.md sai định dạng → không parse được → không ai đọc được ai.
 * 3. Hai role card khai cùng một thư mục sở hữu → xung đột quyền, và cả hai
 *    đều nghĩ mình được sửa.
 *
 * Exit 0 = tổ chức lành.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ROLES_DIR = path.join(ROOT, '.agents', 'roles');
const ROLE_MD = path.join(ROOT, 'ROLE.md');
const CHAT_MD = path.join(ROOT, 'CHAT.md');

const MESSAGE_TYPES = new Set(['STATUS', 'ASK', 'BLOCK', 'HANDOFF', 'DONE', 'DECIDE', 'REVIEW']);
const AGENTS = new Set(['leader', 'core-dev', 'db-dev', 'api-dev', 'web-dev', 'qa', 'all', 'owner']);

const problems = [];
const fail = (message) => problems.push(message);

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const fields = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(rawLine);
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

// ---------- 1. ROLE.md ----------

async function checkRoleDoc() {
  if (!existsSync(ROLE_MD)) {
    fail('ROLE.md: không tồn tại. File này là nguồn sự thật của dự án.');
    return;
  }
  const text = await readFile(ROLE_MD, 'utf8');

  // Tám bất biến phải còn đủ. Mất một cái là mất một lớp phòng vệ.
  for (let index = 1; index <= 8; index++) {
    if (!new RegExp(`\\*\\*B${index}\\*\\*`).test(text)) {
      fail(`ROLE.md: thiếu bất biến **B${index}**`);
    }
  }

  for (const section of ['Vì sao', 'Quyền sở hữu', 'Giao thức', 'Định nghĩa']) {
    if (!text.includes(section)) fail(`ROLE.md: thiếu mục "${section}"`);
  }
}

// ---------- 2. Role cards ----------

async function checkRoleCards() {
  if (!existsSync(ROLES_DIR)) {
    fail('.agents/roles/: không tồn tại');
    return { count: 0 };
  }

  const files = (await readdir(ROLES_DIR)).filter((name) => name.endsWith('.md'));
  const ownersByPath = new Map();

  for (const file of files) {
    const full = path.join(ROLES_DIR, file);
    const text = await readFile(full, 'utf8');
    const fm = parseFrontmatter(text);
    const stem = path.basename(file, '.md');

    if (!fm) {
      fail(`.agents/roles/${file}: thiếu frontmatter`);
      continue;
    }
    if (fm.name !== stem) {
      fail(`.agents/roles/${file}: name "${fm.name}" != tên file "${stem}"`);
    }
    if (!fm.owns) {
      fail(`.agents/roles/${file}: thiếu "owns" — vai không có quyền sở hữu thì không rõ trách nhiệm`);
      continue;
    }

    const paths = fm.owns.split(',').map((value) => value.trim()).filter(Boolean);
    if (paths.length === 0) fail(`.agents/roles/${file}: "owns" rỗng`);

    for (const owned of paths) {
      const normalized = owned.replace(/\/$/, '');
      const previous = ownersByPath.get(normalized);
      if (previous) {
        fail(
          `xung đột sở hữu: "${normalized}" bị cả "${previous}" và "${stem}" khai. ` +
            'Một file chỉ một chủ.',
        );
      } else {
        ownersByPath.set(normalized, stem);
      }
    }

    // Card phải có phần "Xong khi" — nếu không, vai không biết khi nào dừng.
    if (!/##\s*Xong khi|##\s*Đầu ra/.test(text)) {
      fail(`.agents/roles/${file}: thiếu mục "Xong khi" hoặc "Đầu ra"`);
    }
  }

  return { count: files.length };
}

// ---------- 3. CHAT.md ----------

async function checkChat() {
  if (!existsSync(CHAT_MD)) {
    fail('CHAT.md: không tồn tại');
    return { count: 0 };
  }

  const text = await readFile(CHAT_MD, 'utf8');
  const headerPattern = /^##\s+(msg-\d{4})\s+·\s+([^\s·]+)\s+·\s+(\S+)\s+→\s+(\S+)\s+·\s+([A-Z]+)\s+·\s+(.+)$/gm;

  const ids = new Set();
  let match;
  let count = 0;

  while ((match = headerPattern.exec(text)) !== null) {
    const [, id, , from, to, type] = match;
    count++;

    if (ids.has(id)) fail(`CHAT.md: trùng id tin "${id}" — id phải tăng đơn điệu`);
    ids.add(id);

    if (!AGENTS.has(from)) fail(`CHAT.md: ${id} người gửi không rõ "${from}"`);
    if (!AGENTS.has(to)) fail(`CHAT.md: ${id} người nhận không rõ "${to}"`);
    if (!MESSAGE_TYPES.has(type)) {
      fail(`CHAT.md: ${id} loại tin không hợp lệ "${type}" (hợp lệ: ${[...MESSAGE_TYPES].join(', ')})`);
    }
  }

  // Đếm số dòng bắt đầu bằng "## msg-" nhưng KHÔNG khớp pattern → tin sai định dạng.
  const looseHeaders = text.split(/\r?\n/).filter((line) => /^##\s+msg-/.test(line));
  if (looseHeaders.length !== count) {
    fail(
      `CHAT.md: ${looseHeaders.length - count} tin sai định dạng. ` +
        'Đúng: "## msg-0001 · 2026-10-27T09:12+07:00 · from → to · STATUS · re:xxx"',
    );
  }

  // Mọi tin DONE phải có bằng chứng: nhắc tới một lệnh hoặc output.
  const doneBlocks = text.split(/^##\s+/m).filter((block) => /·\s*DONE\s*·/.test(block.split('\n')[0] ?? ''));
  for (const block of doneBlocks) {
    const id = /msg-\d{4}/.exec(block)?.[0] ?? '?';
    if (!/npm run |node --test|node scripts\/|\$ |→|exit code|✔|pass /.test(block)) {
      fail(`CHAT.md: ${id} là DONE nhưng không có bằng chứng (lệnh hoặc output)`);
    }
  }

  return { count };
}

// ---------- main ----------

const roleDocOk = await checkRoleDoc();
await roleDocOk;
const cards = await checkRoleCards();
const chat = await checkChat();

if (problems.length) {
  console.error(`team-check: ${problems.length} vấn đề\n`);
  for (const problem of problems) console.error(`  ✗ ${problem}`);
  console.error('');
  process.exitCode = 1;
} else {
  console.log(`roles       ${cards.count} card(s), không xung đột sở hữu`);
  console.log(`chat        ${chat.count} tin hợp lệ`);
  console.log(`role.md     8 bất biến, đủ mục`);
  console.log(`total       ${3 + cards.count + chat.count} kiểm tra xanh`);
}
