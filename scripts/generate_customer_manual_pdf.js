#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = '/Users/carsonlv/desktop/J/nexus-erp';
const { chromium } = require(path.join(ROOT, 'frontend', 'node_modules', 'playwright'));

const OUT_DIR = path.join(ROOT, 'docs', 'customer-manual');
const DATE_STR = '2026-03-04';
const PDF_PATH = path.join(ROOT, 'docs', `NexusERP-客户功能说明书-${DATE_STR}.pdf`);
const HTML_PATH = path.join(OUT_DIR, `NexusERP-客户功能说明书-${DATE_STR}.html`);

const screenshots = [
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-02 上午2.02.30.png',
    title: '图 1：CRM 业务总览页',
    desc: '在一个页面看清线索、客户、合同、应收应付等核心指标。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-02-28 下午1.08.32.png',
    title: '图 2：客户 360 页面',
    desc: '围绕单个客户查看沟通记录、销售阶段和业务动作。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-03 下午7.03.43.png',
    title: '图 3：消息中心（WhatsApp）',
    desc: '统一处理 WhatsApp、邮件、内部消息，减少来回切换。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-03 下午7.03.58.png',
    title: '图 4：通讯记录页',
    desc: '按时间、渠道、方向回看历史沟通，便于复盘。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-02 下午1.22.40.png',
    title: '图 5：WhatsApp 账号设置',
    desc: '连接、重连、断开账号都在同一处完成。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-02 下午8.56.14.png',
    title: '图 6：HR 页面中的沟通能力',
    desc: '在人事页面也可直接发起消息沟通，跨部门协同更顺畅。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-02 下午6.55.45.png',
    title: '图 7：新增客户表单',
    desc: '支持来源、标签、销售状态等信息沉淀，便于后续经营。'
  }
];

function toDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
  const bin = fs.readFileSync(filePath);
  return `data:${mime};base64,${bin.toString('base64')}`;
}

function list(items) {
  return `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
}

function section(title, body) {
  return `<section><h2>${title}</h2>${body}</section>`;
}

function buildHtml(images) {
  const imgs = images.map((img, i) => `
    <figure>
      <img src="${img.dataUri}" alt="${img.title}" />
      <figcaption><strong>${img.title}</strong>：${img.desc}</figcaption>
    </figure>
  `).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<title>Nexus ERP 客户功能说明书</title>
<style>
  @page { size: A4; margin: 18mm 14mm 16mm 14mm; }
  body { font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif; color:#1f2937; font-size:12px; line-height:1.65; }
  h1 { font-size:30px; margin:0 0 6px; }
  h2 { font-size:18px; margin:18px 0 8px; border-left:4px solid #2563eb; padding-left:8px; }
  h3 { font-size:14px; margin:10px 0 6px; }
  p { margin:6px 0; }
  ul { margin:6px 0 8px 18px; }
  li { margin:2px 0; }
  .cover { border:1px solid #dbeafe; border-radius:12px; padding:24px; background:linear-gradient(165deg,#f8fbff 0%,#eff6ff 100%); }
  .meta { margin-top:12px; border:1px solid #dbeafe; border-radius:8px; padding:10px 12px; background:#fff; }
  .meta p { margin:4px 0; }
  .tips { background:#f8fafc; border:1px dashed #cbd5e1; border-radius:8px; padding:8px 10px; }
  .grid { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .card { border:1px solid #e5e7eb; border-radius:8px; padding:8px 10px; background:#fafafa; }
  table { width:100%; border-collapse:collapse; margin:8px 0; font-size:11px; }
  th,td { border:1px solid #d1d5db; padding:6px 8px; text-align:left; vertical-align:top; }
  th { background:#f3f4f6; }
  figure { border:1px solid #d1d5db; border-radius:8px; padding:8px; margin:12px 0; break-inside: avoid; page-break-inside: avoid; }
  figure img { width:100%; border-radius:6px; border:1px solid #e5e7eb; }
  figcaption { margin-top:6px; font-size:11px; color:#374151; }
  .page-break { page-break-before: always; }
</style>
</head>
<body>
  <section class="cover">
    <h1>Nexus ERP 客户功能说明书</h1>
    <p>版本：V1.0（面向非技术团队）</p>
    <div class="meta">
      <p><strong>适用对象：</strong>老板、销售负责人、运营负责人、实施顾问、一线业务人员</p>
      <p><strong>文档重点：</strong>讲清“能做什么、怎么用、带来什么结果”，不强调技术细节</p>
      <p><strong>日期：</strong>2026-03-04</p>
    </div>
  </section>

  ${section('1. 这套系统解决什么问题', `
    <p>很多团队都遇到同一个难题：客户信息分散在表格、聊天工具和员工个人脑子里，导致跟进慢、交接难、复盘难。Nexus ERP 的目标就是把“客户经营 + 团队协作 + 消息沟通”统一到一个工作台。</p>
    ${list([
      '销售不再靠翻聊天记录找信息，客户状态一眼可见。',
      '沟通不再零散，WhatsApp/邮件/内部消息统一入口。',
      '管理层可实时看核心经营指标，不用等人手工汇总。',
      '跨部门协同更顺：销售、财务、HR 使用同一平台，数据互通。'
    ])}
  `)}

  ${section('2. 一句话看懂核心模块', `
    <div class="grid">
      <div class="card"><strong>客户中心（CRM）</strong><br/>管理线索、客户、合同、回款，形成完整销售过程。</div>
      <div class="card"><strong>消息中心</strong><br/>统一处理 WhatsApp/邮件/内部消息，提升响应速度。</div>
      <div class="card"><strong>人事管理（HR）</strong><br/>管理员工信息，并可在业务场景中直接触达沟通。</div>
      <div class="card"><strong>设置中心</strong><br/>配置账号、成员、AI、消息连接，让系统贴合企业流程。</div>
    </div>
  `)}

  ${section('3. 客户视角的使用流程（从获客到成交）', `
    <h3>步骤 1：收集线索</h3>
    <p>业务员把新机会录入系统（客户名称、来源、联系人、需求等），避免线索沉睡在聊天记录里。</p>
    <h3>步骤 2：持续跟进</h3>
    <p>每次沟通都记录在系统，团队成员可接力跟进，不因人员休假或离职造成断档。</p>
    <h3>步骤 3：沉淀客户资产</h3>
    <p>线索转成客户后，进入客户 360 页面，集中查看历史互动、销售阶段和关键事项。</p>
    <h3>步骤 4：合同与回款管理</h3>
    <p>进入签约后，可持续跟踪合同状态、应收应付和回款进展，方便管理层控风险。</p>
    <div class="tips"><strong>你会得到的结果：</strong>客户不丢、过程可控、进度可见、交接有据。</div>
  `)}

  ${section('4. 重点功能详解（非技术版）', `
    <h3>4.1 CRM 业务中台</h3>
    ${list([
      '经营看板：今日线索、活跃客户、在谈合同、应收应付等核心数字直观呈现。',
      '列表筛选：按来源、状态、时间、负责人快速定位重点客户。',
      '消息联动：在 CRM 页面就能发起消息沟通，不用切换到其他软件。',
      '新增客户：标准化表单采集客户信息，便于后续统计与分析。'
    ])}

    <h3>4.2 客户 360 视图</h3>
    ${list([
      '把一个客户的关键信息放在同一页面，避免反复查找。',
      '记录每次沟通和推进动作，任何人接手都能快速进入状态。',
      '让负责人知道“当前卡在哪一步”，便于及时干预。'
    ])}

    <h3>4.3 消息中心</h3>
    ${list([
      '统一入口：WhatsApp、邮件、内部消息都在一个页面处理。',
      '批量处理：通过筛选和排序优先处理高价值会话。',
      '沟通留痕：通讯记录可追溯，支持业务复盘和绩效评估。'
    ])}

    <h3>4.4 设置中心（尤其是 WhatsApp 设置）</h3>
    ${list([
      '业务团队可直接查看账号连接状态，快速判断“能不能发消息”。',
      '支持重连和断开，降低消息中断带来的业务影响。',
      '可新增账号，支持团队增长后的扩展需求。'
    ])}

    <h3>4.5 HR 场景协同</h3>
    ${list([
      '在人事页面也可直接打开沟通窗口，方便跨部门协作。',
      '适用于招聘、入职、员工通知等需要“信息 + 沟通”并行的场景。'
    ])}
  `)}

  <div class="page-break"></div>

  ${section('5. 角色分工建议（给管理者）', `
    <table>
      <thead><tr><th>角色</th><th>建议重点</th><th>日常动作</th></tr></thead>
      <tbody>
        <tr><td>老板/总经理</td><td>看经营总览与风险项</td><td>每周查看线索转化、合同推进、回款进度</td></tr>
        <tr><td>销售负责人</td><td>盯跟进质量与团队效率</td><td>检查客户 360 记录完整性，推动关键客户进度</td></tr>
        <tr><td>一线销售</td><td>高频跟进和记录</td><td>每天更新线索状态、沟通纪要、下一步计划</td></tr>
        <tr><td>运营/客服</td><td>保障消息响应</td><td>在消息中心分配会话，回看通讯记录</td></tr>
        <tr><td>HR/行政</td><td>内部协作效率</td><td>在 HR 场景下直接发起沟通，减少跨系统操作</td></tr>
      </tbody>
    </table>
  `)}

  ${section('6. 客户最关心的价值（可对外沟通）', `
    ${list([
      '提效：减少在多个系统之间切换的时间。',
      '控风险：客户过程透明，避免“跟进靠感觉”。',
      '可复盘：沟通和动作留痕，容易总结可复制方法。',
      '可扩展：当团队变大时，流程与分工仍能保持清晰。'
    ])}
    <p class="tips"><strong>一句话总结：</strong>Nexus ERP 不是“多一个系统”，而是把原本分散的业务流程收拢成可管理、可协作、可增长的经营体系。</p>
  `)}

  ${section('7. 常见问题（非技术人员版）', `
    <h3>Q1：不会用会不会很复杂？</h3>
    <p>系统按业务场景设计，先从 CRM 与消息中心开始使用，通常 1~3 天就能形成基本操作习惯。</p>
    <h3>Q2：要不要一次性全模块上线？</h3>
    <p>不建议。推荐“先销售后协同”：先上 CRM+消息中心，再逐步扩展到 HR、财务等模块。</p>
    <h3>Q3：如果员工离职，客户资料会不会丢？</h3>
    <p>不会。客户信息和沟通记录都在系统中沉淀，交接时可快速接力。</p>
    <h3>Q4：管理层怎么判断系统有没有带来效果？</h3>
    <p>看三类指标：线索转化率、重点客户推进速度、应收回款周期。通常 1~2 个销售周期就能看到变化。</p>
  `)}

  ${section('8. 截图示例', `
    <p>以下为系统真实页面截图，用于帮助非技术团队快速建立操作认知。</p>
    ${imgs}
  `)}

</body>
</html>`;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const imgs = screenshots.map(s => ({ ...s, dataUri: toDataUri(s.path) }));
  const html = buildHtml(imgs);
  fs.writeFileSync(HTML_PATH, html, 'utf8');

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.pdf({
    path: PDF_PATH,
    format: 'A4',
    printBackground: true,
    margin: { top: '12mm', right: '10mm', bottom: '12mm', left: '10mm' },
  });
  await browser.close();

  const stat = fs.statSync(PDF_PATH);
  console.log(`Generated PDF: ${PDF_PATH}`);
  console.log(`Generated HTML: ${HTML_PATH}`);
  console.log(`PDF size: ${Math.round(stat.size / 1024)} KB`);
})();
