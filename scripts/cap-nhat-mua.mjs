// Cập nhật kho lưu trữ số giờ mưa hằng ngày tại phường Xuân Hương – Đà Lạt.
// Chạy bởi GitHub Actions mỗi ngày (hoặc chạy tay: `node scripts/cap-nhat-mua.mjs`).
// Yêu cầu Node.js 18+ (dùng fetch có sẵn), không cần cài thêm thư viện.
//
// Biến môi trường tuỳ chọn:
//   BACKFILL_FROM=YYYY-MM-DD  -> bổ sung dữ liệu cũ từ ngày này (nguồn ERA5 lưu trữ lịch sử
//                                của Open-Meteo, có từ năm 1940). Chỉ điền các ngày còn thiếu.

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
const PAST_DAYS = 92;      // tối đa của Forecast API
const OVERWRITE_DAYS = 7;  // các ngày gần đây có thể được hiệu chỉnh -> ghi đè

const vnToday = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
function addDays(date, n) {
  const t = new Date(date + 'T00:00:00Z');
  t.setUTCDate(t.getUTCDate() + n);
  return t.toISOString().slice(0, 10);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

function query(params) {
  return new URLSearchParams({
    latitude: LOCATION.latitude,
    longitude: LOCATION.longitude,
    timezone: LOCATION.timezone,
    daily: 'precipitation_hours',
    ...params,
  }).toString();
}

async function main() {
  const today = vnToday();
  const db = await loadDb();
  /** @type {Map<string, {date:string, hours:number, source:string}>} */
  const days = new Map((db?.days ?? []).map((d) => [d.date, d]));
  let added = 0, updated = 0;

  // 1) Dữ liệu gần đây (92 ngày qua) từ Forecast API
  const fc = await getJson(`https://api.open-meteo.com/v1/forecast?${query({ past_days: PAST_DAYS, forecast_days: 1 })}`);
  const recentFrom = addDays(today, -OVERWRITE_DAYS);
  fc.daily.time.forEach((date, i) => {
    const hours = fc.daily.precipitation_hours[i];
    if (date >= today || hours == null) return; // chỉ lưu ngày đã kết thúc
    const old = days.get(date);
    if (!old) { days.set(date, { date, hours, source: 'forecast' }); added++; }
    else if (date >= recentFrom && (old.hours !== hours || old.source !== 'forecast')) {
      days.set(date, { date, hours, source: 'forecast' }); updated++;
    }
  });

  // 2) Bổ sung dữ liệu cũ (tuỳ chọn)
  const backfillFrom = (process.env.BACKFILL_FROM || '').trim();
  if (backfillFrom) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(backfillFrom) || backfillFrom >= today) {
      throw new Error(`BACKFILL_FROM không hợp lệ: "${backfillFrom}" (định dạng YYYY-MM-DD, trước hôm nay)`);
    }
    const end = addDays(today, -1);
    // Chia theo từng năm cho nhẹ request
    for (let start = backfillFrom; start <= end; ) {
      const stop = [addDays(start.slice(0, 4) + '-12-31', 0), end].sort()[0];
      console.log(`Bổ sung ${start} → ${stop} ...`);
      const ar = await getJson(`https://archive-api.open-meteo.com/v1/archive?${query({ start_date: start, end_date: stop })}`);
      ar.daily.time.forEach((date, i) => {
        const hours = ar.daily.precipitation_hours[i];
        if (hours == null || days.has(date)) return;
        days.set(date, { date, hours, source: 'era5' });
        added++;
      });
      start = addDays(stop, 1);
      await sleep(1000);
    }
  }

  const list = [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  const out = {
    location: LOCATION,
    metric: 'Số giờ trong ngày có lượng mưa ≥ 0,1 mm (Open-Meteo precipitation_hours)',
    sources: {
      forecast: 'Open-Meteo Forecast API (mô hình thời tiết tốt nhất cho khu vực)',
      era5: 'Open-Meteo Historical Weather API (tái phân tích ERA5)',
    },
    updatedAt: new Date().toISOString(),
    count: list.length,
    days: list,
  };

  await mkdir('data', { recursive: true });
  await writeFile(JSON_PATH, JSON.stringify(out, null, 1) + '\n');
  const csv = ['ngay,so_gio_mua,nguon', ...list.map((d) => `${d.date},${d.hours},${d.source}`)].join('\n');
  await writeFile(CSV_PATH, '\uFEFF' + csv + '\n');

  const last = list.at(-1);
  const msg = `Đã lưu ${list.length} ngày (thêm ${added}, cập nhật ${updated}). ` +
    (last ? `Ngày gần nhất: ${last.date} = ${last.hours} giờ mưa.` : '');
  console.log(msg);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### 🌧️ ${msg}\n`);
}

main().catch((err) => {
  console.error('Lỗi:', err);
  process.exit(1);
});
