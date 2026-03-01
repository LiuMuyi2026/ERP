# Nexus ERP 测试指南

## 快速开始

### 环境要求

- Backend 运行在 `http://localhost:8000`
- Frontend 运行在 `http://localhost:3000`
- PostgreSQL 运行中

### 初始化测试环境

```bash
cd nexus-erp
bash scripts/setup_test.sh
```

脚本会自动：清理 demo 租户 → 创建 Nuo Gang 租户 → 邀请 6 个测试账号 → 验证登录

### 登录方式

1. 打开 `http://localhost:3000`
2. Workspace 输入：`test`
3. 输入对应账号的邮箱和密码

---

## 测试账号

| 姓名 | Email | 密码 | 角色 | 职位 | 负责模块 |
|------|-------|------|------|------|----------|
| 罗总 | admin@test.com | Happy2026 | tenant_admin | 总经理 | 全模块 + Admin 面板 |
| 王经理 | wang@test.com | Happy2026 | manager | 业务经理 | CRM、订单管理 |
| 李娜 | li@test.com | Happy2026 | tenant_user | 业务员 | CRM 线索、客户跟进 |
| 张芳 | zhang@test.com | Happy2026 | tenant_user | 财务 | 会计、发票 |
| 刘洋 | liu@test.com | Happy2026 | manager | HR 经理 | 人事、员工管理 |
| 赵明 | zhao@test.com | Happy2026 | tenant_user | 采购员 | 库存、供应商、采购 |

**Platform Admin:** admin@nexus.dev / Happy2026（无需 tenant slug，管理所有租户）

---

## 模块功能概览

| 模块 | 路径 | 主要功能 |
|------|------|----------|
| Workspace | `/test/workspace` | 类 Notion 文档、协作笔记、模板 |
| CRM | `/test/crm` | 线索、联系人、公司、商机、销售管道、合同 |
| HR | `/test/hr` | 员工信息、部门管理、请假申请 |
| Accounting | `/test/accounting` | 科目表、记账凭证、发票 |
| Inventory | `/test/inventory` | 产品、仓库、库存变动 |
| Orders | `/test/orders` | 订单管理 |
| Admin | `/test/admin` | 用户管理、职位、权限、审计日志、SMTP |
| AI Finder | `/test/ai-finder` | AI 智能搜索与分析 |
| Settings | `/test/settings` | 租户配置（Logo、颜色、货币、语言） |
| Notifications | `/test/notifications` | 通知中心 |

---

## 按角色测试场景

### 罗总（tenant_admin）— 全面管理

1. **Admin 面板**
   - `/test/admin` → 查看用户列表，确认 6 个用户存在
   - 创建新职位（总经理、业务经理、财务、HR 经理、业务员、采购员）
   - 设置 App 权限（按职位或用户分配模块 view/edit 权限）
   - 查看审计日志
   - 配置租户设置（Logo、主题色、货币设为 CNY）

2. **Workspace**
   - 创建一个测试页面，使用模板
   - 编辑内容，验证富文本功能

3. **全模块巡检**
   - 依次进入每个模块，确认页面正常加载

---

### 王经理（manager）— CRM + 订单

1. **CRM 线索管理**
   - `/test/crm` → 创建 2-3 条新线索
   - 编辑线索详情，标记状态
   - 将线索转化为联系人/公司

2. **客户管理**
   - 创建公司记录
   - 添加联系人并关联到公司

3. **商机管道**
   - 创建商机（Deal），关联客户
   - 拖拽商机在不同阶段间移动

4. **合同**
   - 创建合同，关联客户和商机

5. **订单**
   - `/test/orders` → 创建新订单

---

### 李娜（tenant_user）— 业务员视角

1. **CRM 操作**
   - 创建新线索（模拟日常录入）
   - 编辑自己创建的线索
   - 查看联系人和公司列表

2. **权限验证**
   - 确认无法访问 Admin 面板
   - 确认可以正常使用 CRM 模块

---

### 张芳（tenant_user）— 财务

1. **科目表**
   - `/test/accounting` → 查看默认科目表
   - 创建新会计科目

2. **记账凭证**
   - 创建借贷凭证（确认借贷平衡校验）
   - 查看凭证列表

3. **发票**
   - 创建发票

---

### 刘洋（manager）— HR 经理

1. **部门管理**
   - `/test/hr` → 创建部门（技术部、销售部、财务部、人事部）

2. **员工管理**
   - 录入员工信息
   - 分配到不同部门

3. **请假管理**
   - 作为 manager 审批请假请求

---

### 赵明（tenant_user）— 采购员

1. **产品管理**
   - `/test/inventory` → 创建产品（名称、SKU、价格）

2. **仓库管理**
   - 创建仓库
   - 记录入库变动

3. **库存查询**
   - 查看库存汇总

---

## 通用测试项

每个用户都应测试：

- [ ] 登录/登出
- [ ] 修改个人资料（头像、姓名）
- [ ] 修改密码
- [ ] 查看通知
- [ ] Workspace 文档的查看/创建
- [ ] AI Finder 搜索功能

---

## 已知限制

1. **邮件功能** — SMTP 未配置，邮件通知不可用
2. **AI 功能** — 需要有效的 Gemini API Key（已在 .env 中配置）
3. **密码策略** — 修改密码需满足：8+ 字符、含大小写字母和数字
4. **权限系统** — 新用户默认所有模块 view 权限，需在 Admin 面板手动调整
5. **数据隔离** — 每个租户数据完全隔离，test 租户的数据不影响其他租户

---

## 重置环境

如需重新开始，再次运行：

```bash
bash scripts/setup_test.sh
```

脚本是幂等的，会自动清理已有的 test 租户后重建。
