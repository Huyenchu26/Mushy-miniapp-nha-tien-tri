#!/usr/bin/env node
// Portable replacement for sync-template.sh — chạy được trên Windows (không cần rsync).
// Behavior: giống sync-template.sh — copy shared infra từ canonical template
// về downstream, preserve src/lib/app/* (app-specific subfolder), skip files
// app downstream tự tạo trong src/lib/ ngoài src/lib/app/ (warn + exit nếu có).
//
// Usage:
//   node scripts/sync-template.mjs <path-to-Mushy/miniapp-template>
// Hoặc force xoá file extra:
//   FORCE_DELETE=1 node scripts/sync-template.mjs <path>
//
// Khác sh:
// - Không dùng rsync — duyệt cây + cp/mkdir thuần Node fs.
// - --delete behavior: file tồn tại ở downstream nhưng không có ở template
//   sẽ bị xoá (trừ src/lib/app/* và scripts/sync-template.{sh,mjs}).
// - Pre-flight check: file trong src/lib/ root không thuộc template → abort.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const FULL_DIRS = ['src/lib', 'scripts'];
const SINGLE_FILES = [
  'src/components/Dialog.jsx',
  'src/components/Select.jsx',
  'api/_verify.js',
  '.env.example',
];
const CLAUDE_MD = 'CLAUDE.md';
// Files trong scripts/ KHÔNG sync (legacy .sh không cần ở Windows). .mjs tự
// copy về downstream — script đọc source 1 lần ở khởi đầu, ghi đè self OK.
const SCRIPT_EXCLUDE = new Set(['sync-template.sh']);

async function walk(dir, baseLen) {
  const out = [];
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch { return out; }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(full, baseLen));
    else if (e.isFile()) out.push(full.slice(baseLen + 1).replace(/\\/g, '/'));
  }
  return out;
}

async function exists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

async function main() {
  const templateDir = process.argv[2];
  if (!templateDir) {
    console.error('Usage: node scripts/sync-template.mjs <path-to-Mushy/miniapp-template>');
    process.exit(1);
  }
  if (!await exists(path.join(templateDir, 'CLAUDE.md'))) {
    console.error(`❌ ${templateDir} không phải miniapp-template (thiếu CLAUDE.md)`);
    process.exit(1);
  }

  const cwd = process.cwd();
  console.log(`→ Sync from ${templateDir}`);

  // -------- Pre-flight: detect file app-specific trong src/lib root --------
  const extraFiles = [];
  for (const d of FULL_DIRS) {
    const srcDir = path.join(templateDir, d);
    const dstDir = path.join(cwd, d);
    if (!await exists(srcDir) || !await exists(dstDir)) continue;
    const srcFiles = new Set(await walk(srcDir, srcDir.length));
    const dstFiles = await walk(dstDir, dstDir.length);
    for (const rel of dstFiles) {
      if (d === 'scripts' && SCRIPT_EXCLUDE.has(rel)) continue;
      // Convention (CLAUDE.md 11.3.1): app/ subfolder = app-specific,
      // không bị --delete touch. Áp dụng cho cả src/lib/app/ và scripts/app/.
      if (rel.startsWith('app/')) continue;
      if (!srcFiles.has(rel)) extraFiles.push(`${d}/${rel}`);
    }
  }

  if (extraFiles.length && !process.env.FORCE_DELETE) {
    console.error('');
    console.error(`⚠️  Phát hiện ${extraFiles.length} file app-specific trong shared dirs:`);
    for (const f of extraFiles) console.error(`     - ${f}`);
    console.error('');
    console.error('Sync sẽ XOÁ các file này. 2 lựa chọn:');
    console.error('  A) Move ra src/lib/app/ (recommended):');
    console.error('     mkdir src/lib/app && mv <file> src/lib/app/');
    console.error('  B) Confirm xoá:');
    console.error('     FORCE_DELETE=1 node scripts/sync-template.mjs ' + templateDir);
    process.exit(1);
  }

  // -------- Sync full dirs (mirror — copy mới + xoá file thừa) --------
  for (const d of FULL_DIRS) {
    const srcDir = path.join(templateDir, d);
    const dstDir = path.join(cwd, d);
    if (!await exists(srcDir)) continue;
    await fs.mkdir(dstDir, { recursive: true });

    const srcFiles = await walk(srcDir, srcDir.length);
    // Copy
    for (const rel of srcFiles) {
      if (d === 'scripts' && SCRIPT_EXCLUDE.has(rel)) continue;
      const from = path.join(srcDir, rel);
      const to = path.join(dstDir, rel);
      await copyFile(from, to);
    }
    // Delete extras (đã pre-flight check; chỉ chạy nếu FORCE_DELETE hoặc clean)
    const srcSet = new Set(srcFiles);
    const dstFiles = await walk(dstDir, dstDir.length);
    for (const rel of dstFiles) {
      if (d === 'scripts' && SCRIPT_EXCLUDE.has(rel)) continue;
      if (rel.startsWith('app/')) continue; // preserve app/ subfolder
      if (!srcSet.has(rel)) {
        await fs.unlink(path.join(dstDir, rel));
      }
    }
    console.log(`  ✓ synced ${d}/`);
  }

  // -------- Sync single files --------
  for (const f of SINGLE_FILES) {
    const from = path.join(templateDir, f);
    if (!await exists(from)) continue;
    await copyFile(from, path.join(cwd, f));
    console.log(`  ✓ synced ${f}`);
  }

  // -------- CLAUDE.md (copy if differs) --------
  const tplClaude = path.join(templateDir, CLAUDE_MD);
  if (await exists(tplClaude)) {
    const dst = path.join(cwd, CLAUDE_MD);
    let changed = true;
    if (await exists(dst)) {
      const [a, b] = await Promise.all([fs.readFile(tplClaude, 'utf8'), fs.readFile(dst, 'utf8')]);
      changed = a !== b;
    }
    if (changed) {
      await fs.copyFile(tplClaude, dst);
      console.log('  ✓ updated CLAUDE.md');
    }
  }

  console.log('');
  console.log('✓ Sync xong. Tiếp theo:');
  console.log('  git status');
  console.log('  git diff --stat');
  console.log('  npm install   # nếu package.json template có dep mới');
  console.log('  npm run dev:setup && npm run dev');
  console.log('');
  console.log('⚠️  package.json + vite.config.js + vercel.json KHÔNG auto-sync.');
  console.log('    Diff thủ công nếu nghi template có dep mới.');
}

main().catch((e) => { console.error(e); process.exit(1); });
