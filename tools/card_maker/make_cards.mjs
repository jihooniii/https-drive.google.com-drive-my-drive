#!/usr/bin/env node
// 블로그 이미지 카드 자동 생성기
// 사용법: node tools/card_maker/make_cards.mjs <글 폴더>
//   <글 폴더>/cards.json  → 카드 내용
//   <글 폴더>/원고.md     → 본문 ({{card:id}} 자리에 카드가 들어감)
// 결과:
//   <글 폴더>/cards/NN_id.png  (1080px, 네이버 업로드용)
//   <글 폴더>/발행본.md        (카드 이미지가 들어간 완성 원고)
//   <글 폴더>/미리보기.html    (블로그에 올렸을 때 모습)

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
// playwright: 이 폴더에서 npm install 했거나, 전역(NODE_PATH)에 설치된 것을 사용
const { chromium } = createRequire(import.meta.url)('playwright');

const HERE = path.dirname(fileURLToPath(import.meta.url));
const { buildPreview } = await import('./preview.mjs');
const postDir = path.resolve(process.argv[2] || '');
if (!process.argv[2] || !fs.existsSync(path.join(postDir, 'cards.json'))) {
  console.error('사용법: node tools/card_maker/make_cards.mjs <cards.json이 있는 글 폴더>');
  process.exit(1);
}

const brand = JSON.parse(fs.readFileSync(path.join(HERE, 'brand.json'), 'utf8'));
const spec = JSON.parse(fs.readFileSync(path.join(postDir, 'cards.json'), 'utf8'));
const C = brand.colors;
const W = 1080;
const SIZES = { square: 1080, tall: 1350 };

// ---------- 텍스트 도우미 ----------
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// **굵게**, ==강조색== , 줄바꿈(\n)
const rich = s => esc(s)
  .replace(/==(.+?)==/g, '<em>$1</em>')
  .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
  .replace(/\n/g, '<br>');
const fmtPct = v => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(1) + '%';
const fmtVal = (v, unit) => unit === '%' ? fmtPct(v) : v.toLocaleString('ko-KR') + (unit || '');

// ---------- 공통 틀 ----------
const fontFace = [400, 700, 800].map(w =>
  `@font-face{font-family:Card;font-weight:${w};src:url("${pathToFileURL(path.join(HERE, 'fonts', `NotoSansKR-${w}.ttf`)).href}")}`
).join('');

const css = `${fontFace}
*{box-sizing:border-box;margin:0;padding:0}
body{background:#ccc;font-family:Card,sans-serif;color:${C.ink};-webkit-font-smoothing:antialiased;word-break:keep-all}
.card{width:${W}px;background:${C.bg};display:flex;flex-direction:column;padding:72px 80px 56px;position:relative;overflow:hidden}
.top{display:flex;justify-content:space-between;align-items:center;font-size:26px;color:${C.ink3};font-weight:700}
.pill{background:${C.accent};color:#fff;padding:8px 20px;border-radius:999px;font-size:24px}
.body{flex:1;display:flex;flex-direction:column;justify-content:center;min-height:0;padding:36px 0 32px}
h1{font-size:60px;line-height:1.3;font-weight:800;letter-spacing:-1.5px}
h2{font-size:50px;line-height:1.3;font-weight:800;letter-spacing:-1px;margin-bottom:14px}
em{font-style:normal;color:${C.accent}}
b{font-weight:800}
.sub{font-size:30px;line-height:1.5;color:${C.ink2};margin-bottom:40px}
.foot{display:flex;justify-content:space-between;align-items:flex-end;gap:40px;border-top:2px solid ${C.line};padding-top:22px;font-size:21px;color:${C.ink3};line-height:1.45}
.foot .b{font-weight:800;color:${C.ink2};white-space:nowrap;font-size:23px}
.foot .s{text-align:right}
.panel{background:${C.surface};border:2px solid ${C.line};border-radius:24px;padding:36px 40px}
.up{color:${C.accent}} .down{color:${C.down}}
`;

function frame(card, idx, total, inner) {
  const src = card.source ?? spec.source ?? '';
  return `<div class="card" id="c" style="height:${SIZES[card.size || 'square']}px">
    <div class="top"><span class="pill">${esc(spec.series || brand.series)}</span><span>${idx}/${total}</span></div>
    <div class="body">${inner}</div>
    <div class="foot"><span class="b">${esc(brand.name)}</span><span class="s">${esc(src)}</span></div>
  </div>`;
}

// ---------- 카드 종류 ----------
const T = {};

// 표지
T.cover = c => `
  <div style="font-size:30px;font-weight:700;color:${C.accent};margin-bottom:28px">${esc(c.eyebrow || '')}</div>
  <h1 style="font-size:${c.titleSize || 76}px">${rich(c.title)}</h1>
  <div class="sub" style="margin:36px 0 0;font-size:34px">${rich(c.subtitle || '')}</div>
  ${c.stat ? `<div class="panel" style="margin-top:56px;display:flex;align-items:baseline;gap:28px">
      <span style="font-size:96px;font-weight:800;color:${c.stat.tone === 'down' ? C.down : C.accent};letter-spacing:-2px">${esc(c.stat.value)}</span>
      <span style="font-size:30px;color:${C.ink2};line-height:1.4">${rich(c.stat.label)}</span></div>` : ''}`;

// 핵심 숫자 (2~4개)
T.kpi = c => {
  const n = c.items.length, cols = n === 3 ? 1 : 2;
  return `<h2>${rich(c.title)}</h2>${c.subtitle ? `<div class="sub">${rich(c.subtitle)}</div>` : '<div style="height:26px"></div>'}
  <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:24px">
  ${c.items.map(it => `<div class="panel" style="padding:30px 36px">
      <div style="font-size:27px;color:${C.ink3};font-weight:700">${esc(it.label)}</div>
      <div style="font-size:${cols === 1 ? 72 : 62}px;font-weight:800;letter-spacing:-1.5px;line-height:1.25;margin-top:6px" class="${it.tone || ''}">${esc(it.value)}</div>
      ${it.note ? `<div style="font-size:24px;color:${C.ink2};margin-top:6px;line-height:1.4">${rich(it.note)}</div>` : ''}
    </div>`).join('')}
  </div>`;
};

// 가로 막대 (증감률 등, 0 기준 양쪽) + 비교 눈금(bench)
T.bars = c => {
  const items = c.items, unit = c.unit ?? '%';
  const hasBench = items.some(i => i.bench != null);
  const vals = items.flatMap(i => [i.value, i.bench ?? 0, 0]);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  const pad = (hi - lo) * 0.08; lo = lo < 0 ? lo - pad : 0; hi = hi > 0 ? hi + pad : 0;
  const LW = 300, VW = 150, BW = W - 160 - LW - VW - 40;      // 라벨폭, 값폭, 막대영역
  const x = v => (v - lo) / (hi - lo) * BW;
  const rowH = Math.min(92, Math.floor(560 / items.length));
  const legend = hasBench ? `<div style="display:flex;gap:30px;font-size:24px;color:${C.ink2};margin-bottom:22px">
      <span><i style="display:inline-block;width:26px;height:16px;border-radius:4px;background:${C.accent};vertical-align:-1px;margin-right:10px"></i>${esc(c.seriesLabel || '이 상권')}</span>
      <span><i style="display:inline-block;width:5px;height:28px;background:${C.ink3};vertical-align:-7px;margin-right:12px"></i>${esc(c.benchLabel || '비교 기준')}</span></div>` : '';
  const rows = items.map(i => {
    const x0 = x(0), x1 = x(i.value), left = Math.min(x0, x1), w = Math.max(4, Math.abs(x1 - x0));
    const col = i.value >= 0 ? C.accent : C.down;
    const bench = i.bench != null ? `<div style="position:absolute;left:${x(i.bench) - 2.5}px;top:${rowH / 2 - 22}px;width:5px;height:44px;background:${C.ink3};border-radius:2px"></div>` : '';
    return `<div style="display:flex;align-items:center;height:${rowH}px">
      <div style="width:${LW}px;font-size:28px;font-weight:700;text-align:right;padding-right:22px;line-height:1.2">${esc(i.label)}${i.note ? `<div style="font-size:20px;font-weight:400;color:${C.ink3}">${esc(i.note)}</div>` : ''}</div>
      <div style="position:relative;width:${BW}px;height:100%">
        <div style="position:absolute;left:${x(0) - 1}px;top:0;bottom:0;width:2px;background:${C.line}"></div>
        <div style="position:absolute;left:${left}px;top:${rowH / 2 - 17}px;width:${w}px;height:34px;background:${col};border-radius:${i.value >= 0 ? '0 6px 6px 0' : '6px 0 0 6px'}"></div>
        ${bench}
      </div>
      <div style="width:${VW + 40}px;padding-left:20px;font-size:30px;font-weight:800">${fmtVal(i.value, unit)}${i.bench != null ? `<div style="font-size:20px;font-weight:400;color:${C.ink3}">${esc(c.benchShort || '비교')} ${fmtVal(i.bench, unit)}</div>` : ''}</div>
    </div>`;
  }).join('');
  return `<h2>${rich(c.title)}</h2>${c.subtitle ? `<div class="sub">${rich(c.subtitle)}</div>` : ''}${legend}<div class="panel" style="padding:24px 0">${rows}</div>`;
};

// 꺾은선 (지수 추이 등, 최대 3개 계열. 첫 계열이 주인공)
T.line = c => {
  const PW = W - 160 - 80, PH = c.size === 'tall' ? 560 : 420, m = { l: 70, r: 120, t: 20, b: 50 };
  const all = c.series.flatMap(s => s.values);
  const step = c.step || 5;
  const lo = Math.floor(Math.min(...all, c.baseline ?? Infinity) / step) * step;
  const hi = Math.ceil(Math.max(...all, c.baseline ?? -Infinity) / step) * step;
  const n = c.x.length, iw = PW - m.l - m.r, ih = PH - m.t - m.b;
  const X = i => m.l + i * iw / (n - 1), Y = v => m.t + (hi - v) / (hi - lo) * ih;
  const colors = [C.accent, C.neutral, C.down];
  let g = '';
  for (let v = lo; v <= hi; v += step) {
    const base = v === c.baseline;
    g += `<line x1="${m.l}" x2="${PW - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${base ? C.ink3 : C.line}" stroke-width="2" ${base ? 'stroke-dasharray="8 8"' : ''}/>`;
    g += `<text x="${m.l - 14}" y="${Y(v) + 8}" text-anchor="end" font-size="22" fill="${C.ink3}">${v}</text>`;
  }
  const every = Math.ceil(n / 6);
  c.x.forEach((q, i) => { if ((i % every === 0 && n - 1 - i >= every) || i === n - 1) g += `<text x="${X(i)}" y="${PH - 12}" text-anchor="middle" font-size="22" fill="${C.ink3}">${esc(q)}</text>`; });
  c.series.forEach((s, k) => {
    const col = colors[k];
    g += `<path d="${s.values.map((v, i) => (i ? 'L' : 'M') + X(i) + ' ' + Y(v)).join('')}" fill="none" stroke="${col}" stroke-width="${k ? 4 : 6}" stroke-linejoin="round" stroke-linecap="round"/>`;
    const lv = s.values[n - 1];
    g += `<circle cx="${X(n - 1)}" cy="${Y(lv)}" r="10" fill="${col}" stroke="${C.surface}" stroke-width="4"/>`;
    g += `<text x="${X(n - 1) + 20}" y="${Y(lv) + 10}" font-size="30" font-weight="800" fill="${C.ink}">${lv}</text>`;
  });
  const legend = `<div style="display:flex;gap:34px;font-size:26px;color:${C.ink2};margin-bottom:16px">${c.series.map((s, k) =>
    `<span><i style="display:inline-block;width:34px;height:${k ? 5 : 7}px;border-radius:3px;background:${colors[k]};vertical-align:7px;margin-right:12px"></i>${esc(s.name)}</span>`).join('')}</div>`;
  return `<h2>${rich(c.title)}</h2>${c.subtitle ? `<div class="sub">${rich(c.subtitle)}</div>` : ''}
    <div class="panel" style="padding:30px 40px">${legend}<svg width="${PW}" height="${PH}" viewBox="0 0 ${PW} ${PH}" font-family="Card">${g}</svg></div>`;
};

// 표
T.table = c => {
  const al = c.align || c.columns.map((_, i) => i ? 'r' : 'l');
  const cell = (v, i) => {
    let cls = '';
    if (typeof v === 'string' && /^[+]/.test(v)) cls = 'up';
    if (typeof v === 'string' && /^[−-]\d/.test(v)) cls = 'down';
    return `<td class="${cls}" style="text-align:${al[i] === 'r' ? 'right' : 'left'}">${rich(v)}</td>`;
  };
  const fs = c.rows.length > 6 ? 26 : 30;
  return `<h2>${rich(c.title)}</h2>${c.subtitle ? `<div class="sub">${rich(c.subtitle)}</div>` : '<div style="height:20px"></div>'}
  <div class="panel" style="padding:14px 36px"><table style="width:100%;border-collapse:collapse;font-size:${fs}px">
    <tr>${c.columns.map((h, i) => `<th style="text-align:${al[i] === 'r' ? 'right' : 'left'};color:${C.ink3};font-size:${fs - 4}px;font-weight:700;padding:18px 8px;border-bottom:3px solid ${C.line}">${esc(h)}</th>`).join('')}</tr>
    ${c.rows.map((r, ri) => `<tr style="${ri === c.highlight ? `background:${C.accentSoft};font-weight:800` : ''}">${r.map(cell).join('')}</tr>`).join('')}
  </table></div><style>td{padding:${c.rows.length > 6 ? 15 : 20}px 8px;border-bottom:2px solid ${C.line}} tr:last-child td{border-bottom:0}</style>`;
};

// 목록 (함께 살펴보실 점, 체크포인트 등)
T.list = c => {
  const warn = c.tone === 'warn';
  const badge = (i) => `<span style="flex:none;width:56px;height:56px;border-radius:16px;display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;background:${warn ? C.downSoft : C.accentSoft};color:${warn ? C.down : C.accent}">${warn ? '!' : i + 1}</span>`;
  return `<h2>${rich(c.title)}</h2>${c.subtitle ? `<div class="sub">${rich(c.subtitle)}</div>` : '<div style="height:24px"></div>'}
  <div style="display:flex;flex-direction:column;gap:22px">${c.items.map((it, i) => {
    const o = typeof it === 'string' ? { head: it } : it;
    return `<div class="panel" style="display:flex;gap:28px;align-items:flex-start;padding:30px 36px">${badge(i)}
      <div><div style="font-size:32px;font-weight:800;line-height:1.4">${rich(o.head)}</div>${o.text ? `<div style="font-size:26px;color:${C.ink2};line-height:1.5;margin-top:6px">${rich(o.text)}</div>` : ''}</div></div>`;
  }).join('')}</div>`;
};

// 문의 유도
T.cta = c => `
  <div style="font-size:30px;font-weight:700;color:${C.accent};margin-bottom:24px">${esc(c.eyebrow || '전체 리포트 받아보기')}</div>
  <h1 style="font-size:66px">${rich(c.title)}</h1>
  <div class="sub" style="margin:32px 0 48px;font-size:32px">${rich(c.body || '')}</div>
  <div style="background:${C.accent};color:#fff;border-radius:24px;padding:40px 44px">
    <div style="font-size:28px;opacity:.85">${esc(c.actionLabel || '문자로 남겨주세요')}</div>
    <div style="font-size:52px;font-weight:800;margin-top:6px">${esc(c.action)}</div>
    <div style="font-size:28px;margin-top:18px;opacity:.95">${esc(c.contact || brand.contact)}</div>
  </div>`;

// ---------- 렌더링 ----------
const outDir = path.join(postDir, 'cards');
fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: 1400 }, deviceScaleFactor: 1 });
const tmp = path.join(os.tmpdir(), `card_${process.pid}.html`);
const files = {};
const total = spec.cards.length;

for (const [k, card] of spec.cards.entries()) {
  const fn = T[card.type];
  if (!fn) { console.error(`알 수 없는 카드 종류: ${card.type} (id: ${card.id})`); process.exit(1); }
  const render = async () => {
    const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${frame(card, k + 1, total, fn(card))}</body></html>`;
    fs.writeFileSync(tmp, html);
    await page.goto(pathToFileURL(tmp).href);
    await page.evaluate(() => document.fonts.ready);
    return page.evaluate(() => { const b = document.querySelector('.body'); return b.scrollHeight > b.clientHeight + 2; });
  };
  // 넘침 검사: 정사각형에 안 들어가면 세로형(1080×1350)으로 자동 전환
  let over = await render();
  if (over && !card.size) { card.size = 'tall'; over = await render(); }
  const name = `${String(k + 1).padStart(2, '0')}_${card.id}.png`;
  await page.locator('#c').screenshot({ path: path.join(outDir, name) });
  files[card.id] = { name, alt: card.alt || String(card.title || '').replace(/==|\*\*|\n/g, ' ') };
  console.log(`${over ? '⚠️ 내용 넘침 — 글자를 줄여주세요 ' : '✓ '}${name}${card.size === 'tall' ? ' (세로형)' : ''}`);
}
await browser.close();
fs.rmSync(tmp, { force: true });

// ---------- 원고에 카드 붙이기 ----------
const draft = path.join(postDir, '원고.md');
if (fs.existsSync(draft)) {
  let md = fs.readFileSync(draft, 'utf8');
  const missing = [];
  md = md.replace(/\{\{card:([\w-]+)\}\}/g, (_, id) => {
    if (!files[id]) { missing.push(id); return `⚠️ 카드 없음: ${id}`; }
    return `![${files[id].alt}](cards/${files[id].name})`;
  });
  const unused = Object.keys(files).filter(id => !fs.readFileSync(draft, 'utf8').includes(`{{card:${id}}}`));
  fs.writeFileSync(path.join(postDir, '발행본.md'), md);
  console.log(`\n발행본.md 생성 — 카드 ${Object.keys(files).length}장`);
  if (missing.length) console.log(`⚠️ 원고에는 있는데 cards.json에 없는 카드: ${missing.join(', ')}`);
  if (unused.length) console.log(`ℹ️ 원고에 자리가 없는 카드: ${unused.join(', ')}`);
  const r = buildPreview(postDir);
  console.log(`미리보기.html 생성 — 현장 사진 ${r.photos}장 · 직접 작성 ${r.todos}곳 남음`);
}
