// Cập nhật kho lưu trữ số giờ mưa và khung giờ mưa hằng ngày tại phường Xuân Hương – Đà Lạt.
// Chạy bởi GitHub Actions mỗi ngày (hoặc chạy tay: `node scripts/cap-nhat-mua.mjs`).
// Yêu cầu Node.js 18+ (dùng fetch có sẵn), không cần cài thêm thư viện.
//
// Nguồn: Open-Meteo Historical Weather API, mô hình ECMWF IFS HRES 9 km (lượng mưa từng giờ,
// có từ 2017, cập nhật mỗi 6 giờ). Ngày trước 2017 dùng ERA5-Land (0,1°).
//
// Biến môi trường tuỳ chọn:
//   BACKFILL_FROM=YYYY-MM-DD  -> bổ sung/làm lại dữ liệu từ ngày này. Chỉ ghi các ngày còn thiếu
//                                hoặc chưa có khung giờ mưa.

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';

const LOCATION = {
  name: 'Phường Xuân Hương - Đà Lạt, Lâm Đồng',
  latitude: 11.9422,
  longitude: 108.4469,
  timezone: 'Asia/Ho_Chi_Minh',
};
const JSON_PATH = 'data/so-gio-mua.json';
const CSV_PATH = 'data/so-gio-mua.csv';
const DEFAULT_DAYS = 92;   // kho trống -> lấy 92 ngày gần nhất
const OVERWRITE_DAYS = 7;  // các ngày gần đây có thể được hiệu chỉnh -> ghi đè
const RAIN_MM = 0.1;       // ngưỡng tính 1 giờ có mưa
const IFS_FROM = '2017-01-01';

const vnToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
function addDays(date, n) {
  const t = new Date(date + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const round1 = (v) => Math.round(v * 10) / 10;
const hhmm = (h) => String(h).padStart(2, '0') + ':00';

async function getJson(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return await res.json();
    } catch (err) {
      if (i >= tries) throw err;
      console.warn(`Lần thử ${i} thất bại (${err.message}), thử lại...`);
      await sleep(5000 * i);
    }
  }
}

async function loadDb() {
  try {
    return JSON.parse(await readFile(JSON_PATH, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return null;
    throw err;
  }
}

/**
 * Lấy mưa từng giờ cho [start, end] và gom thành từng ngày.
 * Giá trị tại mốc hh:00 của Open-Meteo = lượng mưa trong 1 giờ trước đó, nên mốc
 * D+1 00:00 thuộc giờ 23–24 của ngày D -> lấy dư 1 ngày ở cuối.
 */
async function fetchDays(start, end, model) {
  const q = new URLSearchParams({
    latitude: LOCATION.latitude,
    longitude: LOCATION.longitude,
    timezone: LOCATION.timezone,
    hourly: 'precipitation',
    models: model,
    start_date: start,
    end_date: addDays(end, 1),
  });
  const ar = await getJson(`https://archive-api.open-meteo.com/v1/archive?${q}`);
  /** @type {Map<string, (number|null)[]>} */
  const byDate = new Map();
  ar.hourly.time.forEach((t, i) => {
    const s = new Date(Date.parse(t + 'Z') - 3600e3).toISOString(); // giờ bắt đầu của khoảng
    const date = s.slice(0, 10);
    if (date < start || date > end) return;
    if (!byDate.has(date)) byDate.set(date, Array(24).fill(null));
    byDate.get(date)[Number(s.slice(11, 13))] = ar.hourly.precipitation[i];
  });
  const out = [];
  for (const [date, mm] of byDate) {
    if (mm.some((v) => v == null)) continue; // thiếu số liệu -> bỏ qua, lần sau lấy lại
    out.push(summarize(date, mm, model));
  }
  return out;
}

/** Từ 24 giá trị mm -> số giờ mưa, tổng lượng mưa và các khung giờ mưa liên tục. */
function summarize(date, mm, source) {
  const periods = [];
  let cur = null;
  mm.forEach((v, h) => {
    if (v >= RAIN_MM) {
      if (cur) { cur[1] = h + 1; cur[2] += v; }
      else { cur = [h, h + 1, v]; periods.push(cur); }
    } else cur = null;
  });
  periods.forEach((p) => { p[2] = round1(p[2]); });
  return {
    date,
    hours: mm.filter((v) => v >= RAIN_MM).length,
    mm: round1(mm.reduce((s, v) => s + v, 0)),
    periods, // [giờ bắt đầu, giờ kết thúc, lượng mưa mm]
    source,
  };
}

async function main() {
  const today = vnToday();
  const yesterday = addDays(today, -1);
  const db = await loadDb();
  /** @type {Map<string, any>} */
  const days = new Map((db?.days ?? []).map((d) => [d.date, d]));

  const backfillFrom = (process.env.BACKFILL_FROM || '').trim();
  if (backfillFrom && (!/^\d{4}-\d{2}-\d{2}$/.test(backfillFrom) || backfillFrom >= today)) {
    throw new Error(`BACKFILL_FROM không hợp lệ: "${backfillFrom}" (định dạng YYYY-MM-DD, trước hôm nay)`);
  }

  // Ngày cần (làm lại): còn thiếu, chưa có khung giờ mưa, hoặc thuộc 7 ngày gần nhất.
  const firstKnown = [...days.keys()].sort()[0];
  const from = [backfillFrom, firstKnown, addDays(today, -DEFAULT_DAYS)].filter(Boolean).sort()[0];
  const recentFrom = addDays(today, -OVERWRITE_DAYS);
  const needs = (date) => date >= recentFrom || !days.get(date)?.periods;
  let start = from;
  while (start <= yesterday && !needs(start)) start = addDays(start, 1);

  let added = 0, updated = 0;
  // Chia theo từng năm cho nhẹ request; ERA5-Land cho phần trước 2017.
  while (start <= yesterday) {
    const model = start < IFS_FROM ? 'era5_land' : 'ecmwf_ifs';
    const yearEnd = start.slice(0, 4) + '-12-31';
    const stop = [yearEnd, yesterday, model === 'era5_land' ? addDays(IFS_FROM, -1) : yesterday].sort()[0];
    console.log(`Lấy ${start} → ${stop} (${model}) ...`);
    for (const d of await fetchDays(start, stop, model)) {
      if (!needs(d.date)) continue;
      const old = days.get(d.date);
      if (!old) added++;
      else if (JSON.stringify(old) !== JSON.stringify(d)) updated++;
      days.set(d.date, d);
    }
    start = addDays(stop, 1);
    while (start <= yesterday && !needs(start)) start = addDays(start, 1);
    await sleep(1000);
  }

  const list = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out = {
    location: LOCATION,
    metric: 'Số giờ trong ngày có lượng mưa ≥ 0,1 mm; khung giờ mưa = các giờ có mưa liên tục (giờ Việt Nam)',
    sources: {
      ecmwf_ifs: 'Open-Meteo Historical Weather API – ECMWF IFS HRES 9 km, mưa từng giờ',
      era5_land: 'Open-Meteo Historical Weather API – tái phân tích ERA5-Land 0,1°',
    },
    updatedAt: new Date().toISOString(),
    count: list.length,
  };

  await mkdir('data', { recursive: true });
  // Mỗi ngày một dòng cho file gọn và dễ xem diff.
  const json = JSON.stringify(out, null, 1).replace(/\n}$/, ',\n "days": [\n' +
    list.map((d) => '  ' + JSON.stringify(d)).join(',\n') + '\n ]\n}');
  await writeFile(JSON_PATH, json + '\n');
  const csv = ['ngay,so_gio_mua,luong_mua_mm,khung_gio_mua,nguon', ...list.map((d) =>
    [d.date, d.hours, d.mm, d.periods.map((p) => `${hhmm(p[0])}-${hhmm(p[1])}`).join('; '), d.source].join(','))].join('\n');
  await writeFile(CSV_PATH, '﻿' + csv + '\n');

  const last = list.at(-1);
  const msg = `Đã lưu ${list.length} ngày (thêm ${added}, cập nhật ${updated}). ` + (last
    ? `Ngày gần nhất: ${last.date} = ${last.hours} giờ mưa` +
      (last.periods.length ? ` (${last.periods.map((p) => `${hhmm(p[0])}–${hhmm(p[1])}`).join(', ')}).` : '.')
    : '');
  console.log(msg);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 🌧️ ${msg}\n`);
}

main().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
