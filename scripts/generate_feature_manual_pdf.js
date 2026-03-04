#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = '/Users/carsonlv/desktop/J/nexus-erp';
const { chromium } = require(path.join(ROOT, 'frontend', 'node_modules', 'playwright'));
const OUT_DIR = path.join(ROOT, 'docs', 'feature-manual');
const DATE_STR = '2026-03-04';
const PDF_PATH = path.join(ROOT, 'docs', `NexusERP-功能说明书-${DATE_STR}.pdf`);
const HTML_PATH = path.join(OUT_DIR, `NexusERP-功能说明书-${DATE_STR}.html`);

const screenshots = [
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-02 上午2.02.30.png',
    title: '图 1 CRM 业务中台总览',
    desc: '路径：/demo/crm。展示线索池、活跃客户、合同总数、应收应付等经营看板，并支持消息管理与线索筛选。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-02 下午6.55.45.png',
    title: '图 2 客户中心新增客户表单',
    desc: '路径：/demo/crm/customers。支持来源渠道、来源方式、标签、销售状态、性别及联系方式采集，并带地图定位能力。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-02-28 下午1.08.32.png',
    title: '图 3 客户 360 画像与沟通记录',
    desc: '路径：/demo/crm/customer-360/{id}。左侧客户画像卡片，中部销售流程节点，右侧沟通记录与业务表单入口。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-03 下午7.03.43.png',
    title: '图 4 消息中心 WhatsApp 收件箱',
    desc: '路径：/demo/messages。支持账号筛选、会话列表、联系人检索、多渠道切换（WhatsApp/邮件/内部消息/群发/通讯记录）。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-03 下午7.03.58.png',
    title: '图 5 消息中心通讯记录',
    desc: '路径：/demo/messages（通讯记录页签）。支持按渠道、方向、时间范围、排序方式检索历史触达。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-02 下午1.22.40.png',
    title: '图 6 系统设置中的 WhatsApp 连接管理',
    desc: '路径：/demo/settings。可查看连接状态、重连/断开、新增账号，并作为 CRM 消息沟通能力的基础配置。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-02 下午8.56.14.png',
    title: '图 7 HR 模块中的 WhatsApp 侧边沟通',
    desc: '路径：/demo/hr。体现跨模块统一沟通能力：在人事页面直接调用 WhatsApp 对话能力。'
  },
  {
    path: '/Users/carsonlv/Desktop/截屏2026-03-02 上午3.19.19.png',
    title: '图 8 Render 生产环境部署总览',
    desc: '包含 nexus-backend、nexus-frontend、nexus-postgres 及 WA bridge 服务，说明项目已具备云端部署形态。'
  }
];

function toDataUri(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mime = ext === '.png' ? 'image/png' : ext === '.jpg' || ext === '.jpeg' ? 'image/jpeg' : 'application/octet-stream';
  const bin = fs.readFileSync(filePath);
  return `data:${mime};base64,${bin.toString('base64')}`;
}

function section(title, body) {
  return `<section><h2>${title}</h2>${body}</section>`;
}

function list(items) {
  return `<ul>${items.map(i => `<li>${i}</li>`).join('')}</ul>`;
}

function imageBlock(img, idx) {
  return `
  <figure>
    <img src="${img.dataUri}" alt="${img.title}" />
    <figcaption><strong>${img.title}</strong>（${idx + 1}/${screenshots.length}）：${img.desc}</figcaption>
  </figure>`;
}

function buildHtml(images) {
  const now = '2026-03-04';
  const catalog = [
    '1. 文档目标与范围',
    '2. 产品定位与总体架构',
    '3. 用户角色与权限模型',
    '4. 功能模块详解',
    '5. 核心业务流程',
    '6. 接口与数据隔离机制',
    '7. 部署与运维说明',
    '8. 非功能能力与约束',
    '9. 截图附录'
  ];

  const screenshotHtml = images.map((img, idx) => imageBlock(img, idx)).join('\n');

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <title>Nexus ERP 功能说明书</title>
  <style>
    @page { size: A4; margin: 18mm 14mm 16mm 14mm; }
    * { box-sizing: border-box; }
    body {
      font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif;
      color: #1f2937;
      line-height: 1.6;
      font-size: 12px;
    }
    h1 { font-size: 28px; margin: 0 0 4px; }
    h2 {
      font-size: 18px;
      margin: 20px 0 8px;
      border-left: 4px solid #1d4ed8;
      padding-left: 8px;
      break-after: avoid;
    }
    h3 { font-size: 14px; margin: 10px 0 6px; break-after: avoid; }
    p { margin: 6px 0; }
    ul { margin: 6px 0 8px 18px; padding: 0; }
    li { margin: 2px 0; }
    .cover {
      border: 1px solid #dbe3f2;
      border-radius: 12px;
      padding: 24px;
      background: linear-gradient(165deg, #f8fbff 0%, #eef5ff 100%);
      margin-bottom: 16px;
    }
    .meta {
      display: grid;
      grid-template-columns: 140px 1fr;
      gap: 8px 10px;
      margin-top: 12px;
      background: #fff;
      border: 1px solid #dbe3f2;
      border-radius: 8px;
      padding: 10px 12px;
    }
    .label { color: #4b5563; }
    .value { font-weight: 600; }
    .tag {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 999px;
      margin-right: 6px;
      font-size: 11px;
      background: #e5eefc;
      color: #1e40af;
    }
    .page-break { page-break-before: always; }
    .grid2 {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 10px;
    }
    .card {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      padding: 8px 10px;
      background: #fafafa;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 8px 0;
      font-size: 11px;
    }
    th, td {
      border: 1px solid #d1d5db;
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    th { background: #f3f4f6; }
    figure {
      border: 1px solid #d1d5db;
      border-radius: 8px;
      padding: 8px;
      margin: 12px 0;
      break-inside: avoid;
      page-break-inside: avoid;
      background: #fff;
    }
    figure img {
      width: 100%;
      height: auto;
      border-radius: 6px;
      border: 1px solid #e5e7eb;
    }
    figcaption {
      margin-top: 6px;
      font-size: 11px;
      color: #374151;
    }
    .footer-note {
      margin-top: 16px;
      padding: 10px;
      border: 1px dashed #cbd5e1;
      border-radius: 8px;
      background: #f8fafc;
      font-size: 11px;
    }
  </style>
</head>
<body>
  <section class="cover">
    <h1>Nexus ERP 功能说明书</h1>
    <p>版本：V1.0（详尽版，含系统截图）</p>
    <p>
      <span class="tag">多租户</span>
      <span class="tag">CRM</span>
      <span class="tag">消息中心</span>
      <span class="tag">HR</span>
      <span class="tag">AI</span>
      <span class="tag">自动化</span>
    </p>
    <div class="meta">
      <div class="label">项目名称</div><div class="value">Nexus ERP</div>
      <div class="label">文档类型</div><div class="value">功能说明书（交付版）</div>
      <div class="label">编制日期</div><div class="value">${now}</div>
      <div class="label">技术栈</div><div class="value">FastAPI + Next.js 14 + PostgreSQL + n8n + WhatsApp Bridge</div>
      <div class="label">适用对象</div><div class="value">产品、销售运营、实施顾问、研发与测试团队</div>
    </div>
  </section>

  ${section('目录', list(catalog))}

  ${section('1. 文档目标与范围', `
    <p>本文档用于系统化说明 Nexus ERP 的业务能力、模块边界、核心流程、运行部署与截图示例，作为售前演示、客户实施、内部培训和版本验收的统一依据。</p>
    ${list([
      '覆盖范围：平台管理、租户隔离、CRM、客户中心、消息中心、HR、设置、AI 与自动化、部署运维。',
      '不覆盖范围：底层算法细节、第三方平台（如 WhatsApp 官方服务）资费与账号政策。',
      '证据来源：仓库当前代码结构、接口文档、开发指南、已有线上页面截图（截至 2026-03-04）。'
    ])}
  `)}

  ${section('2. 产品定位与总体架构', `
    <p>Nexus ERP 是面向多团队协作与多租户隔离的业务中台系统。核心目标是把客户经营、内部协作、消息触达和运营数据沉淀在同一个工作台里。</p>
    <h3>2.1 系统分层</h3>
    <div class="grid2">
      <div class="card"><strong>前端层</strong><br/>Next.js 14（App Router）+ TypeScript。按租户路由组织页面：<code>/[tenant]/crm</code>、<code>/[tenant]/messages</code>、<code>/[tenant]/hr</code> 等。</div>
      <div class="card"><strong>后端层</strong><br/>FastAPI + async SQLAlchemy。统一 API 前缀 <code>/api</code>，按域拆分路由：auth、platform、crm、workspace、whatsapp、email、automation 等。</div>
      <div class="card"><strong>数据层</strong><br/>PostgreSQL 16。<code>platform</code> 存平台全局数据；<code>tenant_{slug}</code> 存租户业务数据。</div>
      <div class="card"><strong>集成层</strong><br/>n8n（流程自动化）、Evolution/WA Bridge（消息通道）、Gemini/OpenAI/Doubao（AI 能力）。</div>
    </div>
    <h3>2.2 模块地图</h3>
    ${list([
      '客户中心（CRM）：线索、客户、合同、回款、文件、风控、客户 360。',
      '消息中心：WhatsApp、邮件、内部消息、群发、通讯记录。',
      '业务管理：经营看板与过程追踪。',
      '供应链管理：库存、订单、采购链路（根据路由与菜单启用）。',
      '财务管理：应收应付、发票、记账相关能力。',
      '人事管理：员工、组织及沟通入口。',
      '设置中心：账户、外观、AI 服务商、成员、通知、集成、WhatsApp 配置。'
    ])}
  `)}

  ${section('3. 用户角色与权限模型', `
    <h3>3.1 角色层级</h3>
    <table>
      <thead><tr><th>角色</th><th>登录方式</th><th>权限范围</th><th>典型职责</th></tr></thead>
      <tbody>
        <tr><td>platform_admin</td><td>不带 tenant_slug 登录</td><td>全平台（租户创建、停用、系统健康）</td><td>平台运营与租户生命周期管理</td></tr>
        <tr><td>tenant_admin</td><td>tenant_slug + 账号密码</td><td>租户内全模块</td><td>租户管理员、实施负责人</td></tr>
        <tr><td>manager / tenant_user</td><td>tenant_slug + 账号密码</td><td>按 permissions 细粒度控制</td><td>销售、财务、HR、采购等业务角色</td></tr>
      </tbody>
    </table>
    <h3>3.2 鉴权与租户隔离</h3>
    ${list([
      'JWT 中包含 tenant_slug、tenant_id、role、permissions。',
      '后端依赖 get_current_user_with_tenant 在请求时设置 search_path 到对应 tenant schema。',
      'tenant 不存在/已禁用/未完成 provision 时，请求会被拒绝。'
    ])}
  `)}

  <div class="page-break"></div>

  ${section('4. 功能模块详解', `
    <h3>4.1 平台管理（Platform）</h3>
    ${list([
      '创建租户：校验 slug、初始化租户 schema、创建租户管理员。',
      '租户列表与状态：查看 schema_provisioned、启用状态、模块开关。',
      '租户 AI 配置：支持 provider/model/api_key 配置并加密存储。',
      '系统健康：可查看 tenant schema 数量与系统状态。'
    ])}

    <h3>4.2 客户中心（CRM）</h3>
    ${list([
      '线索管理：录入线索、状态跟进、来源分析、筛选检索。',
      '客户管理：客户档案、联系人、公司信息、地图定位。',
      '客户 360：从一个视图汇总沟通、业务表单、销售阶段。',
      '合同/回款：支持合同总数、回款管理与经营指标可视化。',
      '消息管理入口：在 CRM 页面直接调起 WhatsApp/邮件沟通窗口。'
    ])}

    <h3>4.3 消息中心（Messages）</h3>
    ${list([
      '多渠道聚合：WhatsApp、邮件、内部消息、群发、通讯记录统一入口。',
      '会话列表：按账号、联系人、状态、时间过滤。',
      '通讯记录：支持按渠道、方向、日期、排序条件复盘触达历史。',
      '对话能力：在业务页面弹窗内完成消息沟通，减少跨页面跳转。'
    ])}

    <h3>4.4 人事管理（HR）</h3>
    ${list([
      '员工列表与状态管理。',
      '在 HR 场景下可直接调用 WhatsApp 对话，支持跨模块消息协作。'
    ])}

    <h3>4.5 设置中心（Settings）</h3>
    ${list([
      '我的账户、外观、AI、成员、通知、集成等基础配置。',
      'WhatsApp 设置：查看账号状态、重连、断开、新增账号。',
      '为 CRM 与消息中心提供底层连接能力。'
    ])}

    <h3>4.6 AI 与自动化（AI + Automation）</h3>
    ${list([
      'AI 提供商可配置（Gemini/OpenAI/Doubao），支持按租户维护默认模型。',
      'AI 使用日志记录在 platform.ai_usage_logs，可做租户级用量统计。',
      '可通过 n8n 与 webhook 将线索、消息、审批等流程自动化。'
    ])}
  `)}

  ${section('5. 核心业务流程', `
    <h3>5.1 从线索到客户成交（标准销售链路）</h3>
    ${list([
      '步骤 1：在 CRM 录入线索（姓名/公司/来源/联系方式）。',
      '步骤 2：销售跟进并记录沟通纪要，必要时发起 WhatsApp/邮件触达。',
      '步骤 3：转化为客户与联系人，进入客户 360 视图持续经营。',
      '步骤 4：创建合同并跟踪回款进度，沉淀经营看板指标。'
    ])}
    <h3>5.2 消息协同流程</h3>
    ${list([
      '在消息中心统一查看不同渠道会话，筛选优先级后分配处理。',
      '在 CRM/HR 页面直接打开消息弹窗，避免上下文丢失。',
      '所有触达记录沉淀到通讯记录页面，便于复盘和审计。'
    ])}
    <h3>5.3 平台侧开通流程</h3>
    ${list([
      'platform_admin 创建租户并完成 schema provision。',
      '创建租户管理员账号并交付登录信息。',
      '租户管理员进行成员、角色、模块、AI 与消息连接配置。'
    ])}
  `)}

  ${section('6. 接口与数据隔离机制', `
    <h3>6.1 典型接口</h3>
    <table>
      <thead><tr><th>接口</th><th>用途</th><th>鉴权</th></tr></thead>
      <tbody>
        <tr><td>POST /api/auth/login</td><td>平台管理员或租户用户登录</td><td>公开</td></tr>
        <tr><td>GET /api/auth/me</td><td>获取当前用户与权限信息</td><td>Bearer Token</td></tr>
        <tr><td>POST /api/platform/tenants</td><td>创建租户并初始化</td><td>platform_admin</td></tr>
        <tr><td>GET /api/crm/leads</td><td>查询线索列表</td><td>租户内认证</td></tr>
        <tr><td>GET /api/workspace/workspaces</td><td>查询工作区</td><td>租户内认证</td></tr>
      </tbody>
    </table>
    <h3>6.2 数据隔离与安全要点</h3>
    ${list([
      '同库多 schema 隔离：每个租户独立 schema，避免租户数据串读。',
      'search_path 在请求链路内动态设置，降低开发时误用风险。',
      '敏感配置（如 AI Key）支持加密存储。',
      '平台租户状态校验（is_active、schema_provisioned）作为前置保护。'
    ])}
  `)}

  ${section('7. 部署与运维说明', `
    <h3>7.1 本地环境</h3>
    ${list([
      'docker-compose 一键启动：postgres、backend、frontend、n8n、evolution-api。',
      'backend 默认 8000 端口，frontend 默认 3000 端口。',
      '首次需配置 .env（SECRET_KEY、数据库连接、AI KEY、CORS）。'
    ])}
    <h3>7.2 生产环境（Render）</h3>
    ${list([
      '项目内置 render.yaml，支持 blueprint 部署。',
      '核心服务：nexus-backend、nexus-frontend、nexus-postgres。',
      '需补齐环境变量：GEMINI_API_KEY、NEXT_PUBLIC_API_URL、CORS_ORIGINS 等。'
    ])}
    <h3>7.3 运维观测建议</h3>
    ${list([
      '健康检查：/health 和 /api/platform/health。',
      '数据库：重点关注 tenant schema 迁移与长事务。',
      '消息通道：关注 WA 连接状态、重连成功率和发送失败重试。'
    ])}
  `)}

  ${section('8. 非功能能力与约束', `
    <h3>8.1 非功能能力</h3>
    ${list([
      '可扩展性：路由按业务域拆分，便于模块化扩展。',
      '稳定性：后端全局异常捕获与连接池预检查。',
      '可配置性：租户维度可配置 AI、消息、外观与业务参数。'
    ])}
    <h3>8.2 当前约束（实施前需确认）</h3>
    ${list([
      '消息能力依赖第三方通道配置（如 WhatsApp bridge）。',
      '部分高级 AI 能力依赖有效 API Key 与模型可用性。',
      '权限策略需由租户管理员按组织结构落地细分。'
    ])}
  `)}

  <div class="page-break"></div>

  ${section('9. 截图附录（系统实拍）', `
    <p>以下截图用于说明系统当前界面形态与关键交互入口，采集时间覆盖 2026-02-28 至 2026-03-03。</p>
    ${screenshotHtml}
    <div class="footer-note">
      说明：截图中的测试账号、电话号码、客户名等仅用于演示环境，不代表真实生产数据。若用于外部客户交付，建议做二次脱敏处理。
    </div>
  `)}
</body>
</html>`;
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const prepared = screenshots.map((item) => ({
    ...item,
    dataUri: toDataUri(item.path),
  }));

  const html = buildHtml(prepared);
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
