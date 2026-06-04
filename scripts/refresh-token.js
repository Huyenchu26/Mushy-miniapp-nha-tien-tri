#!/usr/bin/env node
/**
 * JWT của Supabase hết hạn sau 1 giờ. Script này login lại và update
 * VITE_DEV_TOKEN trong .env.
 */
import './_node-shim.js';
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const envPath = join(root, '.env');
const configPath = join(root, 'mushy.config.json');

if (!existsSync(configPath)) {
  console.error('❌ Thiếu mushy.config.json ở root repo.');
  process.exit(1);
}
const config = JSON.parse(readFileSync(configPath, 'utf8'));
const SUPABASE_URL = config.supabase?.url;
const ANON_KEY = config.supabase?.anonKey;

if (!SUPABASE_URL || !ANON_KEY || ANON_KEY.includes('REPLACE_WITH')) {
  console.error('❌ mushy.config.json thiếu/placeholder supabase URL hoặc anon key.');
  process.exit(1);
}

const rl = readline.createInterface({ input, output });
const sb = createClient(SUPABASE_URL, ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// Mushy bỏ password (2026-05-12) — login qua OTP qua Edge Function
// `auth-login-otp` (superapp mig 033) → hỗ trợ dual email (login email /
// work_email / personal_email verified). Trước dùng signInWithOtp trực
// tiếp chỉ work với auth.users.email gốc.
console.log('Chấp nhận email cá nhân, email công ty đã verify, hoặc email login Mushy.\n');
const email = ((await rl.question('Email Mushy: ')) || '').trim().toLowerCase();
if (!email || !email.includes('@')) { console.error('❌ Email không hợp lệ.'); process.exit(1); }

const otpEndpoint = `${SUPABASE_URL}/functions/v1/auth-login-otp`;
console.log('Đang gửi mã OTP tới', email, '...');
const requestRes = await fetch(otpEndpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ANON_KEY}`,
    apikey: ANON_KEY,
  },
  body: JSON.stringify({ action: 'request', email }),
});
const requestBody = await requestRes.json().catch(() => ({}));
if (!requestRes.ok || !requestBody?.sent) {
  console.error('❌ Gửi OTP thất bại:', requestBody?.error || `HTTP_${requestRes.status}`);
  if (requestBody?.detail) console.error('   →', requestBody.detail);
  process.exit(1);
}
console.log('✓ Đã gửi. Kiểm tra mail (kể cả Spam) — mã 6 chữ số.\n');

const token = ((await rl.question('Mã OTP 6 chữ số: ')) || '').trim();
if (!/^\d{6}$/.test(token)) { console.error('❌ Mã OTP phải đúng 6 chữ số.'); process.exit(1); }

const verifyRes = await fetch(otpEndpoint, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${ANON_KEY}`,
    apikey: ANON_KEY,
  },
  body: JSON.stringify({ action: 'verify', email, code: token }),
});
const verifyBody = await verifyRes.json().catch(() => ({}));
if (!verifyRes.ok || !verifyBody?.access_token) {
  console.error('❌ Xác minh OTP thất bại:', verifyBody?.error || `HTTP_${verifyRes.status}`);
  if (verifyBody?.detail) console.error('   →', verifyBody.detail);
  process.exit(1);
}
const accessToken = verifyBody.access_token;

const lines = existsSync(envPath) ? readFileSync(envPath, 'utf8').split('\n') : [];
const out = lines.map((l) =>
  l.startsWith('VITE_DEV_TOKEN=') ? `VITE_DEV_TOKEN=${accessToken}` : l
);
if (!out.some((l) => l.startsWith('VITE_DEV_TOKEN='))) {
  out.push(`VITE_DEV_TOKEN=${accessToken}`);
}
writeFileSync(envPath, out.join('\n'));
console.log('✓ Refreshed VITE_DEV_TOKEN');
rl.close();
