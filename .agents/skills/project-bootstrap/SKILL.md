---
name: project-bootstrap
description: >-
  Dùng khi bắt đầu repo mới hoặc chuẩn hoá repo cũ trước khi vibe coding.
  Dựng khung tối thiểu: script chất lượng, env mẫu, cấu trúc thư mục, CI, và
  tài liệu để agent làm việc ổn định.
---

# Project Bootstrap

Mục tiêu: sau ~30 phút, repo có đủ "đường ray" để agent (và người) làm việc mà không
phải hỏi lại từ đầu.

## Nguyên tắc

- Ít công cụ, chạy được ngay. Không dựng hệ thống build phức tạp cho dự án 3 trang.
- Mọi thứ phải chạy bằng **một lệnh** và được ghi vào `README`.
- Không thêm gì mà không có người dùng thật trong 2 tuần tới.

## 1. Kiểm tra hiện trạng

```bash
ls -a
cat package.json 2>/dev/null || cat pyproject.toml 2>/dev/null || cat go.mod 2>/dev/null
git log --oneline -5
```

Xác định: ngôn ngữ, package manager (khoá bằng lockfile), đã có lint/test/build chưa.

## 2. Bốn script bắt buộc

Trong `package.json` (hoặc `Makefile` / `pyproject`):

```json
{
  "scripts": {
    "dev": "...",
    "build": "...",
    "lint": "...",
    "typecheck": "tsc --noEmit",
    "test": "...",
    "verify": "npm run lint && npm run typecheck && npm test"
  }
}
```

`verify` là lệnh duy nhất agent cần nhớ trước khi báo xong. Nếu repo chưa có, tạo.

Với Python: `ruff check`, `mypy`/`pyright`, `pytest -q`.
Với Go: `go vet ./...`, `go test ./...`, `gofmt -l .`.

## 3. Cấu hình chuẩn

```markdown
- [ ] `.gitignore` có: node_modules, dist, .env, .env.*, *.log, .DS_Store, __pycache__, .venv
- [ ] `.env.example` liệt kê **tên** biến, không kèm giá trị thật
- [ ] `.editorconfig`: indent, charset utf-8, final newline
- [ ] Formatter (prettier/ruff format) + cấu hình trong repo, không phụ thuộc IDE
- [ ] TypeScript: `strict: true`
- [ ] Lockfile được commit
```

## 4. Cấu trúc thư mục

Chọn theo quy mô, đừng copy template lớn:

**Nhỏ (≤ 20 file):**
```
src/
  index.ts
  lib/
tests/
docs/
```

**Vừa (feature-first):**
```
src/
  features/
    invoices/
      handler.ts
      service.ts
      repo.ts
      schema.ts
      service.test.ts
    users/
  lib/          # dùng chung, không chứa logic nghiệp vụ
  app/          # wiring: route, config, entry
```

Không tạo `utils/` chung chung. Mỗi helper phải thuộc một chủ đề.

## 5. Tài liệu tối thiểu

```markdown
- [ ] README: dự án làm gì, chạy thế nào (3 lệnh), biến env cần gì
- [ ] AGENTS.md: quy ước cho agent (dùng kit này)
- [ ] docs/specs/, docs/tasks/, docs/notes/ — thư mục rỗng + .gitkeep
```

README phải trả lời được: "clone về, chạy 3 lệnh gì để thấy app?" Nếu > 3 lệnh → đơn giản hoá.

## 6. CI tối thiểu

Một workflow chạy đúng những gì `verify` chạy:

```yaml
name: verify
on: [push, pull_request]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: npm }
      - run: npm ci
      - run: npm run verify
```

Không cần matrix nhiều version khi mới bắt đầu.

## 7. Commit đầu tiên

```bash
git add -A
git commit -m "chore: bootstrap project skeleton"
```

Rồi bắt đầu bằng skill `vibe-kickoff` cho tính năng đầu tiên — **không** code luôn.

## Checklist hoàn tất

```markdown
- [ ] `npm run verify` (hoặc tương đương) chạy xanh từ máy sạch
- [ ] Clone mới + đọc README là chạy được, không cần hỏi
- [ ] `.env.example` khớp với biến thật đang dùng
- [ ] CI xanh trên push đầu tiên
- [ ] AGENTS.md + .agents/ đã có
```
