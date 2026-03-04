#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = '/Users/carsonlv/desktop/J/nexus-erp';
const { chromium } = require(path.join(ROOT, 'frontend', 'node_modules', 'playwright'));

const mdPath = path.join(ROOT, 'docs', 'user-manual', '使用说明书-用户版-线上截图.md');
const outHtml = path.join(ROOT, 'docs', 'user-manual', '使用说明书-用户版-线上截图.html');
const outPdf = path.join(ROOT, 'docs', 'user-manual', '使用说明书-用户版-线上截图.pdf');

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function imgData(rel) {
  const p = path.resolve(path.dirname(mdPath), rel);
  const ext = path.extname(p).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
  const b = fs.readFileSync(p);
  return `data:${mime};base64,${b.toString('base64')}`;
}

function mdToHtml(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  let inUl = false;
  const closeUl = () => { if (inUl) { out.push('</ul>'); inUl = false; } };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) { closeUl(); continue; }
    if (/^---+$/.test(line.trim())) { closeUl(); out.push('<hr/>'); continue; }

    const img = line.match(/^!\[(.*?)\]\((.*?)\)$/);
    if (img) {
      closeUl();
      const alt = esc(img[1]);
      out.push(`<figure><img src="${imgData(img[2])}" alt="${alt}"/><figcaption>${alt}</figcaption></figure>`);
      continue;
    }

    const h1 = line.match(/^#\s+(.+)$/);
    if (h1) { closeUl(); out.push(`<h1>${esc(h1[1])}</h1>`); continue; }
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) { closeUl(); out.push(`<h2>${esc(h2[1])}</h2>`); continue; }
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) { closeUl(); out.push(`<h3>${esc(h3[1])}</h3>`); continue; }

    const li = line.match(/^[-*]\s+(.+)$/);
    if (li) {
      if (!inUl) { out.push('<ul>'); inUl = true; }
      out.push(`<li>${esc(li[1])}</li>`);
      continue;
    }

    closeUl();
    if (line.startsWith('>')) out.push(`<blockquote>${esc(line.replace(/^>\s?/, ''))}</blockquote>`);
    else out.push(`<p>${esc(line)}</p>`);
  }
  closeUl();
  return out.join('\n');
}

(async () => {
  const md = fs.readFileSync(mdPath, 'utf8');
  const body = mdToHtml(md);
  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"/>
    <title>使用说明书-用户版-线上截图</title>
    <style>
      @page { size: A4; margin: 16mm 12mm; }
      body { font-family: "PingFang SC","Microsoft YaHei",sans-serif; color:#1f2937; line-height:1.65; font-size:12px; }
      h1 { font-size:26px; margin:0 0 10px; }
      h2 { font-size:18px; margin:18px 0 8px; border-left:4px solid #2563eb; padding-left:8px; }
      h3 { font-size:14px; margin:12px 0 6px; }
      p { margin:6px 0; }
      ul { margin:6px 0 8px 18px; }
      li { margin:2px 0; }
      hr { border:none; border-top:1px solid #e5e7eb; margin:12px 0; }
      blockquote { margin:8px 0; padding:8px 10px; background:#f8fafc; border-left:3px solid #cbd5e1; }
      figure { margin:12px 0; border:1px solid #d1d5db; border-radius:8px; padding:8px; break-inside:avoid; page-break-inside:avoid; }
      img { width:100%; height:auto; border-radius:6px; }
      figcaption { margin-top:6px; font-size:11px; color:#4b5563; }
    </style></head><body>${body}</body></html>`;

  fs.writeFileSync(outHtml, html, 'utf8');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({
    path: outPdf,
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
  });
  await browser.close();

  const stat = fs.statSync(outPdf);
  console.log('PDF:', outPdf);
  console.log('HTML:', outHtml);
  console.log('SizeKB:', Math.round(stat.size / 1024));
})();
