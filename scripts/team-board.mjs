#!/usr/bin/env node
/**
 * In trạng thái task hiện tại từ docs/tasks/*.md.
 *
 * Mục đích: để agent (và người) không phải đọc cả file task list chỉ để biết
 * việc tiếp theo là gì. `leader` chạy lệnh này trước khi chia việc.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TASKS_DIR = path.join(ROOT, 'docs', 'tasks');

if (!existsSync(TASKS_DIR)) {
  console.log('docs/tasks/ chưa có. Chưa có task nào được chia.');
  process.exit(0);
}

const files = (await readdir(TASKS_DIR)).filter((name) => name.endsWith('.md') && !name.startsWith('_'));

if (files.length === 0) {
  console.log('docs/tasks/ rỗng. Chưa có task nào được chia.');
  process.exit(0);
}

let totalOpen = 0;
let totalDone = 0;

for (const file of files.sort()) {
  const text = await readFile(path.join(TASKS_DIR, file), 'utf8');
  const title = /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? file;
  const status = /^Trạng thái:\s*(.+)$/m.exec(text)?.[1]?.trim() ?? '(không rõ)';

  const tasks = [];
  const taskPattern = /^-\s+\[([ x])\]\s+(T\d+)\s+—\s+(.+)$/gm;
  let match;
  while ((match = taskPattern.exec(text)) !== null) {
    tasks.push({ done: match[1] === 'x', id: match[2], name: match[3].trim() });
  }

  const done = tasks.filter((task) => task.done).length;
  totalDone += done;
  totalOpen += tasks.length - done;

  console.log(`\n${title}`);
  console.log(`  trạng thái: ${status}`);
  console.log(`  tiến độ:    ${done}/${tasks.length}`);

  for (const task of tasks) {
    const mark = task.done ? '✔' : '·';
    const next = !task.done && tasks.indexOf(task) === tasks.findIndex((t) => !t.done) ? '  ← tiếp theo' : '';
    console.log(`    ${mark} ${task.id}  ${task.name}${next}`);
  }
}

console.log(`\ntổng: ${totalDone} xong · ${totalOpen} còn lại`);
