// 발행본.md → 미리보기.html (네이버 블로그 글처럼 보이는 한 장짜리 미리보기, 이미지 내장)
// make_cards.mjs가 자동으로 호출합니다. 따로 실행: node tools/card_maker/preview.mjs <글 폴더>

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/【(.+?)】/g, '<mark class="todo">✍️ 직접 작성: $1</mark>');
}

function section(md, name) {
  const m = md.match(new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
}

export function buildPreview(postDir) {
  const brand = JSON.parse(fs.readFileSync(path.join(HERE, 'brand.json'), 'utf8'));
  const md = fs.readFileSync(path.join(postDir, '발행본.md'), 'utf8');
  const spec = fs.existsSync(path.join(postDir, 'cards.json'))
    ? JSON.parse(fs.readFileSync(path.join(postDir, 'cards.json'), 'utf8')) : {};

  const titleLine = (section(md, '제목').match(/^1\.\s*`?(.+?)`?\s*$/m) || [])[1] || path.basename(postDir);
  const category = (md.match(/카테고리:\s*([^/\n]+)/) || [])[1]?.trim() || '';
  const tags = (section(md, '태그').match(/#[^\s#]+/g) || []);
  const lines = section(md, '본문').split('\n');

  let html = '', i = 0, photos = 0, todos = 0, cards = 0;
  const img = src => {
    const p = path.join(postDir, src);
    return fs.existsSync(p) ? `data:image/png;base64,${fs.readFileSync(p).toString('base64')}` : '';
  };
  while (i < lines.length) {
    const L = lines[i];
    if (!L.trim()) { i++; continue; }
    if (/^```/.test(L)) {                         // 코드 블록 → 안내 박스
      const buf = []; i++;
      while (i < lines.length && !/^```/.test(lines[i])) buf.push(lines[i++]);
      i++; html += `<div class="note">${buf.map(inline).join('<br>')}</div>`; continue;
    }
    if (/^---+$/.test(L.trim())) { html += '<div class="divider" aria-hidden="true"><i></i><i></i><i></i></div>'; i++; continue; }
    if (/^### /.test(L)) { html += `<h3>${inline(L.slice(4))}</h3>`; i++; continue; }
    const im = L.match(/^!\[(.*?)\]\((.+?)\)/);
    if (im) { cards++; html += `<figure><img src="${img(im[2])}" alt="${esc(im[1])}" loading="lazy"></figure>`; i++; continue; }
    if (/^📷/.test(L.trim())) { photos++; html += `<div class="photo"><span>📷 현장 사진 자리</span>${inline(L.replace(/^📷\s*/, ''))}</div>`; i++; continue; }
    if (/^\(공통 서명\)/.test(L.trim())) {
      html += `<div class="sign"><b>${esc(brand.name)}</b><span>${esc(brand.contact)}</span><span>중개사무소 등록번호 · 주소는 공통 서명에서 자동으로 붙습니다</span></div>`; i++; continue;
    }
    if (/^>/.test(L)) {                            // 인용 박스
      const buf = [];
      while (i < lines.length && /^>/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
      const inner = buf.map(b => /^- /.test(b) ? `<li>${inline(b.slice(2))}</li>` : b.trim() ? `<p>${inline(b)}</p>` : '').join('')
        .replace(/(<li>.*?<\/li>)+/g, m => `<ul>${m}</ul>`);
      html += `<blockquote>${inner}</blockquote>`; continue;
    }
    if (/^\|/.test(L)) {                           // 표
      const rows = [];
      while (i < lines.length && /^\|/.test(lines[i])) rows.push(lines[i++]);
      const cells = r => r.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
      const head = cells(rows[0]), body = rows.slice(2).map(cells);
      const num = c => /^[+−-]?[\d,.]+/.test(c) || /^\*\*[+−-]/.test(c);
      html += `<div class="tablewrap"><table><thead><tr>${head.map(h => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${body.map(r => `<tr>${r.map(c => `<td class="${num(c) ? 'n' : ''}">${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      continue;
    }
    if (/^- /.test(L)) {
      const buf = [];
      while (i < lines.length && /^- /.test(lines[i])) buf.push(lines[i++].slice(2));
      html += `<ul>${buf.map(b => `<li>${inline(b)}</li>`).join('')}</ul>`; continue;
    }
    const buf = [];
    while (i < lines.length && lines[i].trim() && !/^(#|>|\||- |```|---|!\[|📷)/.test(lines[i])) buf.push(lines[i++]);
    if (buf.length) html += `<p>${buf.map(inline).join('<br>')}</p>`;
    else i++;
  }
  todos = (html.match(/class="todo"/g) || []).length;

  const out = `<title>${esc(spec.series || '블로그')} 미리보기</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nanum+Gothic:wght@400;700;800&family=Noto+Sans+KR:wght@400;700;800&display=swap">
<style>
/* 네이버 블로그 모바일 본문 폭(약 700px) 한 단. 실제 블로그처럼 밝은 화면 하나로 고정 */
:root{
  color-scheme:light;
  --page:#f2f3f5; --paper:#ffffff; --ink:#222428; --ink2:#5b6068; --ink3:#8b9099;
  --rule:#e6e8eb; --naver:#03c75a; --accent:#2a78d6; --todo:#fff3c4; --todo-ink:#6b4e00;
  --body:"Nanum Gothic","Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
  --ui:"Noto Sans KR","Apple SD Gothic Neo","Malgun Gothic",sans-serif;
}
body{background:var(--page);color:var(--ink);font-family:var(--body);word-break:keep-all;overflow-wrap:anywhere}
.status{position:sticky;top:env(safe-area-inset-top,0px);z-index:2;background:var(--ink);color:#fff;font-family:var(--ui);font-size:13px;padding:10px 16px;display:flex;flex-wrap:wrap;gap:6px 16px;justify-content:center}
.status b{color:#7ee2a8}
.wrap{max-width:720px;margin:0 auto;padding-inline:16px;padding-block:24px 64px}
article{background:var(--paper);border:1px solid var(--rule);border-radius:4px;padding:32px clamp(18px,5vw,48px) 40px;min-width:0}
.cat{font-family:var(--ui);font-size:13px;color:var(--naver);font-weight:700}
h1{font-family:var(--ui);font-size:clamp(22px,4.6vw,30px);line-height:1.4;font-weight:800;margin:10px 0 18px;text-wrap:balance}
.by{display:flex;align-items:center;gap:10px;font-family:var(--ui);font-size:13px;color:var(--ink3);padding-bottom:22px;border-bottom:1px solid var(--rule);margin-bottom:28px}
.by .av{width:36px;height:36px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:800}
.by b{color:var(--ink);display:block;font-size:14px}
p{font-size:16px;line-height:1.95;margin:0 0 20px}
h3{font-family:var(--ui);font-size:20px;line-height:1.5;margin:40px 0 16px;padding-left:12px;border-left:4px solid var(--naver);text-wrap:balance}
figure{margin:24px 0}
figure img{display:block;width:100%;border-radius:2px}
blockquote{margin:24px 0;padding:20px 22px;background:#f7f8fa;border:1px solid var(--rule);border-radius:4px}
blockquote p{margin:0 0 6px;font-size:15px;line-height:1.8}
blockquote ul{margin:4px 0 6px;padding-left:20px;font-size:15px;line-height:1.85}
ul{font-size:16px;line-height:1.9;padding-left:22px;margin:0 0 20px}
.tablewrap{overflow-x:auto;margin:20px 0 24px}
table{border-collapse:collapse;width:100%;font-size:14.5px;font-family:var(--ui)}
th,td{border:1px solid var(--rule);padding:9px 12px;text-align:left;white-space:nowrap}
th{background:#f7f8fa;font-weight:700}
td.n{text-align:right;font-variant-numeric:tabular-nums}
.divider{display:flex;justify-content:center;gap:10px;margin:36px 0}
.divider i{width:5px;height:5px;border-radius:50%;background:var(--ink3)}
.photo{margin:24px 0;border:2px dashed #c9cdd3;border-radius:6px;padding:34px 18px;text-align:center;color:var(--ink2);font-family:var(--ui);font-size:14px;background:#fafbfc}
.photo span{display:block;font-weight:800;color:var(--ink);font-size:15px;margin-bottom:4px}
mark.todo{background:var(--todo);color:var(--todo-ink);padding:2px 6px;border-radius:3px;font-family:var(--ui);font-size:14px;line-height:1.8}
.note{white-space:normal;background:#eef5fd;border-radius:6px;padding:18px 20px;font-size:15px;line-height:1.85;margin:20px 0}
code{font-family:var(--ui);background:#f0f1f3;padding:1px 5px;border-radius:3px;font-size:.9em}
.sign{margin-top:36px;padding:20px 0 0;border-top:1px solid var(--rule);display:flex;flex-direction:column;gap:4px;font-family:var(--ui);font-size:14px;color:var(--ink2)}
.sign b{color:var(--ink);font-size:15px}
.tags{display:flex;flex-wrap:wrap;gap:8px;margin-top:28px}
.tags span{font-family:var(--ui);font-size:13px;color:var(--ink2);background:#f2f3f5;border-radius:999px;padding:5px 12px}
</style>
<div class="status" role="status"><span>미리보기 · 아직 발행 전</span><span>이미지 카드 <b>${cards}장</b> 자동 생성</span><span>현장 사진 <b>${photos}장</b> 필요</span><span>직접 작성 <b>${todos}곳</b></span></div>
<div class="wrap"><article>
<div class="cat">${esc(category)}</div>
<h1>${inline(titleLine)}</h1>
<div class="by"><div class="av" aria-hidden="true">${esc((brand.author || brand.name).slice(0, 1))}</div><div><b>${esc(brand.author || brand.name)}</b>${esc(brand.name)}</div></div>
${html}
<div class="tags">${tags.map(t => `<span>${esc(t)}</span>`).join('')}</div>
</article></div>`;
  fs.writeFileSync(path.join(postDir, '미리보기.html'), out);
  return { cards, photos, todos };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const r = buildPreview(path.resolve(process.argv[2]));
  console.log(`미리보기.html — 카드 ${r.cards} · 사진 자리 ${r.photos} · 직접 작성 ${r.todos}`);
}
