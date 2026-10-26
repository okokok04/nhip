#!/usr/bin/env node
/**
 * Chặn các vi phạm bất biến ở ROLE.md mục 2 — phần có thể phát hiện bằng máy.
 *
 * Triết lý: rule ở đây phải **không báo động giả**. Một linter kêu oan sẽ bị tắt,
 * và khi bị tắt thì nó không chặn được gì nữa. Thà ít rule mà đúng, còn hơn
 * nhiều rule mà phải thêm `eslint-disable` khắp nơi.
 */

import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SCAN_DIRS = ['packages', 'apps', 'scripts', 'tests'];
const SKIP_DIRS = new Set(['node_modules', 'dist', 'coverage', '.git']);

/** @type {{id: string, why: string, onlyIn?: string[], test: (line: string, file: string) => boolean}[]} */
const RULES = [
  {
    id: 'B2-parseUnits-18',
    why: 'USDC trên Arc là 6 decimals ở interface ERC-20. parseUnits(x, 18) làm sai 10^12 lần.',
    test: (line, file) =>
      !file.endsWith('.md') && /parseUnits\s*\([^)]*,\s*18\s*\)/.test(line) && /usdc/i.test(line),
  },
  {
    id: 'B2-parseUnits-18-any',
    why: 'Chỉ USDC được dùng trong dự án này. parseUnits với 18 decimals gần như chắc chắn là nhầm.',
    test: (line) => /parseUnits\s*\(/.test(line) && /,\s*18\s*\)/.test(line),
  },
  {
    id: 'B2-eip7528-sentinel',
    why: 'Không alias 0xEeee…EEeE sang USDC. Docs Arc cảnh báo trực tiếp; USDC không có wrapper.',
    test: (line) => /0x[Ee]{4}[^"'`\s]*[Ee]{4}/.test(line) && !/0x[0-9a-fA-F]{40}/.test(line.replace(/0x[Ee]{4}[^"'`\s]*[Ee]{4}/g, '')),
  },
  {
    id: 'B3-zero-address',
    why: 'Gửi tới address(0) revert trên Arc. Phải validate trước, không để lọt xuống chain.',
    test: (line, file) =>
      !file.endsWith('.test.ts') &&
      !file.endsWith('address.ts') &&
      /(['"`])0x0{40}\1/.test(line) &&
      /to\s*[:=]|recipient|payTo|beneficiary/i.test(line),
  },
  {
    id: 'B4-gas-floor',
    why: 'maxFeePerGas dưới 20 Gwei bị treo. Trong code phải thấy hằng số sàn hoặc comment lý do.',
    test: (line) => /maxFeePerGas\s*:/.test(line) && /0n|0\b/.test(line) && !/max\(|MIN_|FLOOR/.test(line),
  },
  {
    id: 'no-console-debug',
    why: 'console.log debug không được vào code sản phẩm. Dùng logger có cấu trúc.',
    // Chỉ áp dụng cho code sản phẩm. Script CLI in ra stdout là chức năng của nó,
    // không phải debug — gắn cờ chúng là báo động giả.
    onlyIn: ['packages', 'apps'],
    test: (line, file) => !file.endsWith('.test.ts') && /^\s*console\.(log|debug|trace)\s*\(/.test(line),
  },
  {
    id: 'no-todo',
    why: 'TODO trong code được coi là hoàn thành. Dự án này không nhận placeholder.',
    test: (line) => /\/\/\s*(TODO|FIXME|XXX|HACK)\b/.test(line) || /\bimplement later\b/i.test(line),
  },
  {
    id: 'no-float-money',
    why: 'number cho tiền là bug, không phải style. Phải dùng Micro (bigint).',
    test: (line) => /\b(amount|total|fee|balance)\w*\s*:\s*number\b/i.test(line),
  },
];

async function* walk(dir) {
  if (!existsSync(dir)) return;
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|tsx|mjs|js)$/.test(entry.name)) {
      yield full;
    }
  }
}

const problems = [];
let scanned = 0;

for (const dir of SCAN_DIRS) {
  for await (const file of walk(path.join(ROOT, dir))) {
    // Không tự kiểm chính thư viện luật: nó chứa pattern và sẽ tự khớp.
    if (file.endsWith(path.join('scripts', 'lint-guards.mjs'))) continue;
    if (file.endsWith(path.join('scripts', 'check-kit.mjs'))) continue;
    const relative = path.relative(ROOT, file).replaceAll('\\', '/');
    scanned++;
    const text = await readFile(file, 'utf8');
    const lines = text.split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const rule of RULES) {
        if (rule.onlyIn && !rule.onlyIn.some((dir) => relative.startsWith(`${dir}/`))) continue;
        if (rule.test(line, file)) {
          problems.push({
            rule: rule.id,
            why: rule.why,
            where: `${relative}:${index + 1}`,
            line: line.trim().slice(0, 120),
          });
        }
      }
    });
  }
}

if (problems.length) {
  console.error(`lint-guards: ${problems.length} vi phạm\n`);
  for (const p of problems) {
    console.error(`  [${p.rule}] ${p.where}`);
    console.error(`    ${p.line}`);
    console.error(`    → ${p.why}\n`);
  }
  process.exitCode = 1;
} else {
  console.log(`lint-guards  ${RULES.length} rule(s) · ${scanned} file(s) sạch`);
}
