-- ============================================================
-- Nexus ERP — 全模块 Demo 数据 Seed（诺钢 Steel Export）
-- Schema: tenant_demo  |  Company: 上海诺钢国际贸易有限公司
-- Run:
--   PGPASSWORD=nexus_secret \
--   /opt/homebrew/Cellar/postgresql@17/17.7_1/bin/psql \
--   -h localhost -U nexus -d nexus_platform \
--   -f scripts/seed_full_demo.sql
-- ============================================================

SET search_path TO tenant_demo;

-- ── 用户 UUID 速查 ─────────────────────────────────────────
-- 张伟(业务总监)  0cdc14c7-95ea-426b-91b2-98f29ed95583
-- 李娜(业务员)    20220f01-91e2-4339-9a8d-2d2761beb3bf
-- 王芳(业务员)    ca9565e8-771a-4240-93d8-5f3f684a4809
-- 陈建国(采购经理) eef55911-d74c-4828-95b3-041dee65407a
-- 刘洋(业务员)    13b33cdb-49d8-401c-bd22-b20b6c8d513a
-- 赵雪(业务员)    99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817

-- ══════════════════════════════════════════════════════════════
-- 0. 清理旧测试数据（保留 CRM 线索和员工）
-- ══════════════════════════════════════════════════════════════
DELETE FROM supplier_quotations;
DELETE FROM purchase_orders;
DELETE FROM suppliers;
DELETE FROM products;
DELETE FROM invoice_line_items;
DELETE FROM invoices;
DELETE FROM export_flow_docs;
DELETE FROM export_flow_tasks;
DELETE FROM export_flow_orders;
DELETE FROM leave_requests;
DELETE FROM payroll_runs;

-- ══════════════════════════════════════════════════════════════
-- 1. 供应商（6家，按评级分布）
-- ══════════════════════════════════════════════════════════════
INSERT INTO suppliers (id, name, rating, company_info, contact_person, contact_info, created_at) VALUES

('b1000001-0000-0000-0000-000000000001',
 '鞍钢集团国际经济贸易有限公司', 'S',
 '鞍钢集团旗下核心出口贸易平台，主营热轧板卷、冷轧板卷、镀锌板等，年供应量超500万吨，持有ISO 9001 / API 5L / EN 10025多项国际认证，交货稳定，质检严格。',
 '刘建明',
 '电话：024-8846-5500 | 邮箱：liujm@ansteel-intl.com | 微信：liujm_ansteel',
 NOW() - INTERVAL '2 years'),

('b1000002-0000-0000-0000-000000000002',
 '宝钢资源有限公司', 'A',
 '宝武钢铁集团贸易旗舰，覆盖热轧、冷轧、涂镀全品类，质量追溯体系完善，长期合作客户享优先备货权，出口合规文件（SGS / MTC / CO）齐全。',
 '陈志远',
 '电话：021-6840-3388 | 邮箱：chenzhy@baosteel-resources.com | WhatsApp: +86-138-1800-3388',
 NOW() - INTERVAL '18 months'),

('b1000003-0000-0000-0000-000000000003',
 '江苏沙钢国际贸易有限公司', 'A',
 '沙钢集团核心出口平台，螺纹钢、线材、H型钢、圆钢等长材产品为主，出口量占集团总量60%以上，港口直发体系完整，装运效率高。',
 '周浩',
 '电话：0512-5876-6666 | 邮箱：zhouhao@shagang-trade.com | 微信：zhouhao_shagang',
 NOW() - INTERVAL '14 months'),

('b1000004-0000-0000-0000-000000000004',
 '天津钢铁集团有限公司（管材事业部）', 'B',
 '天钢集团管材专业贸易部，ERW焊接钢管 / 无缝钢管双线布局，持有API 5CT / API 5L认证，主要供应石油行业和建筑行业，价格较市场均价低3-5%。',
 '王磊',
 '电话：022-8830-1234 | 邮箱：wanglei@tisg-trade.com | WhatsApp: +86-139-2230-1234',
 NOW() - INTERVAL '10 months'),

('b1000005-0000-0000-0000-000000000005',
 '河北钢铁集团国际贸易有限公司', 'B',
 '河钢集团贸易公司，中厚板、H型钢为主力产品，供货稳定，价格具竞争力，交货期偏长（45-60天），适合提前备货订单。',
 '张国庆',
 '电话：0311-8650-7788 | 邮箱：zhanggq@hbis-intl.com | 微信：zhanggq_hbis',
 NOW() - INTERVAL '8 months'),

('b1000006-0000-0000-0000-000000000006',
 '武汉华鑫钢材贸易有限公司', 'C',
 '中小型现货贸易商，品种杂、库存充足，价格低于市场均价5-8%，适合小批量急单，质量稳定性一般，需驻厂验货，付款方式须预付。',
 '李小龙',
 '电话：027-8567-4321 | 邮箱：lixl@whhuaxin.com | 微信：lixl_huaxin',
 NOW() - INTERVAL '5 months');

-- ══════════════════════════════════════════════════════════════
-- 2. 供应商报价记录
-- ══════════════════════════════════════════════════════════════
INSERT INTO supplier_quotations
  (id, supplier_id, product_name, material, spec, quantity, unit_price, delivery_period, payment_method, special_requirements, created_at)
VALUES

-- 鞍钢
('c1000001-0000-0000-0000-000000000001','b1000001-0000-0000-0000-000000000001',
 '热轧钢板','Q235B','6mm×1500mm×C',500,4250.00,'20个工作日','TT 30天','可出具英文MTC + SGS检验报告', NOW()-INTERVAL '30 days'),
('c1000002-0000-0000-0000-000000000002','b1000001-0000-0000-0000-000000000001',
 '冷轧钢卷','SPCC','1.2mm×1219mm×C',300,5100.00,'25个工作日','TT 30天','表面质量D级，内径610mm', NOW()-INTERVAL '22 days'),
('c1000003-0000-0000-0000-000000000003','b1000001-0000-0000-0000-000000000001',
 '镀锌钢板','DX51D+Z','0.8mm×1250mm×C',200,5650.00,'30个工作日','LC 90天','镀锌层275g/㎡，可提供Reach & RoHS报告', NOW()-INTERVAL '15 days'),

-- 宝钢
('c1000004-0000-0000-0000-000000000004','b1000002-0000-0000-0000-000000000002',
 '热轧钢卷','SS400','3.0mm×1500mm×C',800,4180.00,'15个工作日','TT 见票即付','宝钢原厂质保，EN 10025 S275报告', NOW()-INTERVAL '28 days'),
('c1000005-0000-0000-0000-000000000005','b1000002-0000-0000-0000-000000000002',
 '冷轧钢卷','DC01','1.5mm×1250mm×C',600,4950.00,'20个工作日','TT 30天','表面质量D级，钢卷内衬防锈纸', NOW()-INTERVAL '20 days'),

-- 沙钢
('c1000006-0000-0000-0000-000000000006','b1000003-0000-0000-0000-000000000003',
 'H型钢','Q345B','HW200×200×8×12',300,4600.00,'25个工作日','TT 30天','可出具Mill Test Report，符合EN 10034', NOW()-INTERVAL '18 days'),
('c1000007-0000-0000-0000-000000000007','b1000003-0000-0000-0000-000000000003',
 '圆钢','Q235B','Φ25mm×6m',400,4350.00,'15个工作日','TT 见票即付','GB/T 702标准，表面光洁', NOW()-INTERVAL '12 days'),
('c1000008-0000-0000-0000-000000000008','b1000003-0000-0000-0000-000000000003',
 '螺纹钢','HRB400','Φ16mm×9m',1000,4100.00,'10个工作日','TT 15天','GB/T 1499.2-2018，可出具中国银行结汇发票', NOW()-INTERVAL '8 days'),

-- 天钢
('c1000009-0000-0000-0000-000000000009','b1000004-0000-0000-0000-000000000004',
 'ERW焊接钢管','Q235B','4英寸 SCH40 6m定尺',600,4800.00,'30个工作日','TT 30天','API 5L B级，两端带防护端盖', NOW()-INTERVAL '14 days'),
('c1000010-0000-0000-0000-000000000010','b1000004-0000-0000-0000-000000000004',
 '镀锌钢管','Q235B','2英寸 6m定尺',400,5200.00,'35个工作日','LC 90天','BS EN 10255标准，镀锌层≥45μm', NOW()-INTERVAL '10 days'),

-- 河钢
('c1000011-0000-0000-0000-000000000011','b1000005-0000-0000-0000-000000000005',
 'H型钢','Q345B','HN400×200×8×13',500,4450.00,'45个工作日','TT 30天','重型结构专用，可附第三方检测报告', NOW()-INTERVAL '20 days'),
('c1000012-0000-0000-0000-000000000012','b1000005-0000-0000-0000-000000000005',
 '中厚板','Q235B','20mm×2200mm×10000mm',300,4550.00,'50个工作日','TT 30天','船用钢板，持有CCS认证', NOW()-INTERVAL '16 days'),

-- 华鑫（现货）
('c1000013-0000-0000-0000-000000000013','b1000006-0000-0000-0000-000000000006',
 '热轧钢板','Q235B','8mm×2000mm×6m',200,3950.00,'5个工作日','TT 见票即付','现货库存，可拍照验货后发货', NOW()-INTERVAL '5 days'),
('c1000014-0000-0000-0000-000000000014','b1000006-0000-0000-0000-000000000006',
 '角钢','Q235B','50×50×5mm 6m',150,4200.00,'3个工作日','TT 见票即付','现货现提，数量有限', NOW()-INTERVAL '3 days');

-- ══════════════════════════════════════════════════════════════
-- 3. 库存产品（6种主营钢材产品）
-- ══════════════════════════════════════════════════════════════
INSERT INTO products
  (id, sku, name, description, category, unit, cost_price, sell_price, currency, current_stock, reorder_point, is_active, created_at)
VALUES

('d1000001-0000-0000-0000-000000000001',
 'ERW-4IN-SCH40', 'ERW焊接钢管（4英寸 SCH40）',
 'API 5L B级 ERW焊接钢管，4英寸，壁厚SCH40，6m定尺，两端带防护端盖，适用于石油、天然气及工业管道系统。',
 '钢管', '吨', 4800.00, 5650.00, 'USD', 85, 20, true, NOW()-INTERVAL '6 months'),

('d1000002-0000-0000-0000-000000000002',
 'HRC-Q235B-6MM', '热轧钢板（Q235B 6mm）',
 'Q235B热轧钢板，规格6mm×1500mm×C，表面轧制，适用于一般结构件、建筑钢结构及机械制造，符合GB/T 709标准。',
 '板材', '吨', 4250.00, 5020.00, 'USD', 320, 50, true, NOW()-INTERVAL '6 months'),

('d1000003-0000-0000-0000-000000000003',
 'CRC-SPCC-12MM', '冷轧钢卷（SPCC 1.2mm）',
 'SPCC冷轧钢卷，规格1.2mm×1219mm×C，表面质量D级，内径610mm，适用于汽车面板、家电外壳及精密冲压件。',
 '板材', '吨', 5100.00, 6050.00, 'USD', 140, 30, true, NOW()-INTERVAL '5 months'),

('d1000004-0000-0000-0000-000000000004',
 'HW200-Q345B', 'H型钢（HW200×200 Q345B）',
 'Q345B热轧H型钢，规格HW200×200×8×12，符合GB/T 11263及EN 10034标准，适用于工业厂房、桥梁及重型钢结构。',
 '型材', '吨', 4600.00, 5450.00, 'USD', 210, 40, true, NOW()-INTERVAL '4 months'),

('d1000005-0000-0000-0000-000000000005',
 'GI-PIPE-2IN', '镀锌钢管（2英寸）',
 'Q235B基管热浸镀锌，2英寸×6m定尺，镀锌层≥45μm，符合BS EN 10255标准，适用于消防、给排水及脚手架搭建。',
 '钢管', '吨', 5200.00, 6180.00, 'USD', 60, 15, true, NOW()-INTERVAL '3 months'),

('d1000006-0000-0000-0000-000000000006',
 'ROUND-Q235B-25', '圆钢（Q235B Φ25mm）',
 'Q235B圆钢，Φ25mm×6m，表面光洁，符合GB/T 702标准，适用于机械零部件、地脚螺栓及混凝土锚固件。',
 '型材', '吨', 4350.00, 5150.00, 'USD', 175, 30, true, NOW()-INTERVAL '3 months');

-- ══════════════════════════════════════════════════════════════
-- 4. 采购订单（7张，关联CRM线索）
-- ══════════════════════════════════════════════════════════════
-- 关联线索：
--   a1000007 — Ahmed Hassan (procuring)     → 采购ERW管
--   a1000008 — David Mensah (booking)       → 采购热轧板
--   a1000009 — Carlos Reyes (fulfillment)   → 采购H型钢
--   a1000010 — Sophie Lambert (fulfillment) → 采购冷轧卷
--   a1000011 — Park Ji-ho (converted)       → 采购镀锌管 (已履行)
--   a1000012 — Arjun Malhotra (converted)   → 采购热轧板 (已履行)
--   独立采购                                → 备库圆钢

INSERT INTO purchase_orders
  (id, po_number, vendor_company_id, status, order_date, expected_date,
   product_name, specs, quantity, unit_price, total, currency,
   payment_method, notes, lead_id, created_by, created_at)
VALUES

-- PO-2025-001  Ahmed Hassan / SABIC Steel — ERW焊接钢管 (draft→confirmed)
('e1000001-0000-0000-0000-000000000001',
 'PO-2025-001', 'b1000004-0000-0000-0000-000000000004', 'confirmed',
 NOW()-INTERVAL '18 days', NOW()+INTERVAL '12 days',
 'ERW焊接钢管（API 5L B级）', '4英寸 SCH40 6m定尺', '80吨',
 4800.00, 384000.00, 'USD',
 'TT 30天',
 'SABIC Steel采购订单，需提供API 5L B级MTC，用于沙特石油管道项目，需驻厂验货。',
 'a1000007-0000-0000-0000-000000000007',
 'eef55911-d74c-4828-95b3-041dee65407a',
 NOW()-INTERVAL '18 days'),

-- PO-2025-002  David Mensah / Accra Steel — 热轧钢板 (draft)
('e1000002-0000-0000-0000-000000000002',
 'PO-2025-002', 'b1000001-0000-0000-0000-000000000001', 'draft',
 NOW()-INTERVAL '5 days', NOW()+INTERVAL '25 days',
 '热轧钢板（Q235B）', '6mm×1500mm×C', '60吨',
 4250.00, 255000.00, 'USD',
 'TT 30天',
 'Accra Steel 建筑结构用钢，需提供EN 10025 S275等效报告。',
 'a1000008-0000-0000-0000-000000000008',
 'eef55911-d74c-4828-95b3-041dee65407a',
 NOW()-INTERVAL '5 days'),

-- PO-2025-003  Carlos Reyes / Mexipipe — H型钢 (confirmed)
('e1000003-0000-0000-0000-000000000003',
 'PO-2025-003', 'b1000003-0000-0000-0000-000000000003', 'confirmed',
 NOW()-INTERVAL '35 days', NOW()-INTERVAL '5 days',
 'H型钢（Q345B）', 'HW200×200×8×12', '120吨',
 4600.00, 552000.00, 'USD',
 'TT 30天',
 'Mexipipe 工业厂房主体钢结构，含第三方RINA认证，已安排天津港装柜。',
 'a1000009-0000-0000-0000-000000000009',
 'eef55911-d74c-4828-95b3-041dee65407a',
 NOW()-INTERVAL '35 days'),

-- PO-2025-004  Sophie Lambert / Euro Steel — 冷轧钢卷 (confirmed)
('e1000004-0000-0000-0000-000000000004',
 'PO-2025-004', 'b1000002-0000-0000-0000-000000000002', 'confirmed',
 NOW()-INTERVAL '40 days', NOW()-INTERVAL '10 days',
 '冷轧钢卷（SPCC）', '1.2mm×1219mm×C', '90吨',
 5100.00, 459000.00, 'USD',
 'TT 30天',
 'Euro Steel Service Center 汽车零配件冲压用钢，表面质量D级，宝钢原厂出具。',
 'a1000010-0000-0000-0000-000000000010',
 'eef55911-d74c-4828-95b3-041dee65407a',
 NOW()-INTERVAL '40 days'),

-- PO-2025-005  Park Ji-ho / Korea Global Steel — 镀锌钢管 (fulfilled)
('e1000005-0000-0000-0000-000000000005',
 'PO-2025-005', 'b1000004-0000-0000-0000-000000000004', 'fulfilled',
 NOW()-INTERVAL '90 days', NOW()-INTERVAL '55 days',
 '镀锌钢管（BS EN 10255）', '2英寸 6m定尺', '50吨',
 5200.00, 260000.00, 'USD',
 'LC 90天',
 'Korea Global Steel 消防管道项目，已完成工厂验收，已发货，货已到釜山港。',
 'a1000011-0000-0000-0000-000000000011',
 'eef55911-d74c-4828-95b3-041dee65407a',
 NOW()-INTERVAL '90 days'),

-- PO-2025-006  Arjun Malhotra / Mumbai Steel — 热轧钢板 (fulfilled)
('e1000006-0000-0000-0000-000000000006',
 'PO-2025-006', 'b1000001-0000-0000-0000-000000000001', 'fulfilled',
 NOW()-INTERVAL '100 days', NOW()-INTERVAL '60 days',
 '热轧钢板（SS400/Q235B）', '8mm×1500mm×C', '150吨',
 4280.00, 642000.00, 'USD',
 'TT 见票即付',
 'Mumbai Steel Imports 基础设施用钢，鞍钢原厂MTC，BIS认证文件已随货附带。',
 'a1000012-0000-0000-0000-000000000012',
 'eef55911-d74c-4828-95b3-041dee65407a',
 NOW()-INTERVAL '100 days'),

-- PO-2025-007  独立备库 — 圆钢（无关联线索）
('e1000007-0000-0000-0000-000000000007',
 'PO-2025-007', 'b1000003-0000-0000-0000-000000000003', 'confirmed',
 NOW()-INTERVAL '10 days', NOW()+INTERVAL '15 days',
 '圆钢（Q235B）', 'Φ25mm×6m', '40吨',
 4350.00, 174000.00, 'USD',
 'TT 见票即付',
 '常备库存补货，沙钢直发天津仓库，用于快速响应小单需求。',
 NULL,
 'eef55911-d74c-4828-95b3-041dee65407a',
 NOW()-INTERVAL '10 days');

-- ══════════════════════════════════════════════════════════════
-- 5. 财务发票（8张：5张应收 + 3张应付）
-- ══════════════════════════════════════════════════════════════
INSERT INTO invoices
  (id, invoice_number, type, issue_date, due_date, status,
   subtotal, tax_rate, tax_amount, total, currency, notes, created_by, created_at)
VALUES

-- ── 应收款（Receivable）────────────────────────────────────
-- INV-2025-001  Park Ji-ho (Korea Global) — 已收款
('f1000001-0000-0000-0000-000000000001',
 'INV-2025-001', 'receivable',
 NOW()-INTERVAL '80 days', NOW()-INTERVAL '50 days', 'paid',
 260000.00, 0.00, 0.00, 260000.00, 'USD',
 'Korea Global Steel Trading Co. — 镀锌钢管 50吨（PO-2025-005），TT已到账，提单号：TIAN2025031501',
 '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW()-INTERVAL '80 days'),

-- INV-2025-002  Arjun Malhotra (Mumbai Steel) — 已收款
('f1000002-0000-0000-0000-000000000002',
 'INV-2025-002', 'receivable',
 NOW()-INTERVAL '90 days', NOW()-INTERVAL '60 days', 'paid',
 790000.00, 0.00, 0.00, 790000.00, 'USD',
 'Mumbai Steel Imports Pvt. Ltd — 热轧钢板 150吨（PO-2025-006），TT两次付款均已到账。',
 '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW()-INTERVAL '90 days'),

-- INV-2025-003  Sophie Lambert (Euro Steel) — 待收款
('f1000003-0000-0000-0000-000000000003',
 'INV-2025-003', 'receivable',
 NOW()-INTERVAL '25 days', NOW()+INTERVAL '5 days', 'sent',
 559800.00, 0.00, 0.00, 559800.00, 'USD',
 'Euro Steel Service Center SAS — 冷轧钢卷 90吨（PO-2025-004），货已到马赛港，30天TT到期日：' || TO_CHAR(NOW()+INTERVAL '5 days','YYYY-MM-DD') || '。',
 '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW()-INTERVAL '25 days'),

-- INV-2025-004  Carlos Reyes (Mexipipe) — 部分付款
('f1000004-0000-0000-0000-000000000004',
 'INV-2025-004', 'receivable',
 NOW()-INTERVAL '30 days', NOW()-INTERVAL '2 days', 'partially_paid',
 676800.00, 0.00, 0.00, 676800.00, 'USD',
 'Mexipipe Industrial S.A. de C.V. — H型钢 120吨（PO-2025-003）。已收预付款30%（$203,040），余款$473,760逾期2天，催款中。',
 '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW()-INTERVAL '30 days'),

-- INV-2025-005  Ahmed Hassan (SABIC Steel) — 草稿/待开票
('f1000005-0000-0000-0000-000000000005',
 'INV-2025-005', 'receivable',
 NOW(), NOW()+INTERVAL '30 days', 'draft',
 480000.00, 0.00, 0.00, 480000.00, 'USD',
 'SABIC Steel & Construction Trading Co. — ERW焊接钢管 80吨（PO-2025-001），货物备货中，发货后开具正式发票。',
 '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW()),

-- ── 应付款（Payable）──────────────────────────────────────
-- INV-2025-006  支付给鞍钢 — 已付款
('f1000006-0000-0000-0000-000000000006',
 'INV-2025-006', 'payable',
 NOW()-INTERVAL '95 days', NOW()-INTERVAL '65 days', 'paid',
 642000.00, 0.00, 0.00, 642000.00, 'USD',
 '鞍钢集团国际经济贸易有限公司 — 热轧钢板采购款（PO-2025-006），TT已付清，对应Arjun Malhotra订单原材料成本。',
 'eef55911-d74c-4828-95b3-041dee65407a', NOW()-INTERVAL '95 days'),

-- INV-2025-007  支付给天钢 — 待付款
('f1000007-0000-0000-0000-000000000007',
 'INV-2025-007', 'payable',
 NOW()-INTERVAL '15 days', NOW()+INTERVAL '15 days', 'sent',
 384000.00, 0.00, 0.00, 384000.00, 'USD',
 '天津钢铁集团有限公司管材事业部 — ERW焊接钢管采购款（PO-2025-001），TT 30天，到期日：' || TO_CHAR(NOW()+INTERVAL '15 days','YYYY-MM-DD') || '。',
 'eef55911-d74c-4828-95b3-041dee65407a', NOW()-INTERVAL '15 days'),

-- INV-2025-008  支付给沙钢 — 草稿
('f1000008-0000-0000-0000-000000000008',
 'INV-2025-008', 'payable',
 NOW()-INTERVAL '8 days', NOW()+INTERVAL '22 days', 'draft',
 726000.00, 0.00, 0.00, 726000.00, 'USD',
 '江苏沙钢国际贸易有限公司 — H型钢 + 圆钢备库采购（PO-2025-003 + PO-2025-007），合并付款，TT 30天。',
 'eef55911-d74c-4828-95b3-041dee65407a', NOW()-INTERVAL '8 days');

-- ══════════════════════════════════════════════════════════════
-- 6. 出口流程订单（5张）
-- ══════════════════════════════════════════════════════════════
INSERT INTO export_flow_orders
  (id, contract_no, customer_name, sale_amount_usd, sale_amount_cny,
   payment_method, incoterm, destination_type,
   needs_factory_inspection, needs_statutory_inspection,
   outstanding_receivable_usd, outstanding_receivable_cny,
   stage, remarks, created_by, created_at)
VALUES

-- EFO-001  Park Ji-ho  (韩国，已交货)
('a5000001-0000-0000-0000-000000000001',
 'NC-2024-KR-089', 'Korea Global Steel Trading Co., Ltd',
 320000.00, 2310400.00,
 'TT 30天', 'CFR', 'port',
 false, false,
 0.00, 0.00,
 'delivered',
 '韩国釜山港，货已到港并提货完毕，回款已结清，归档中。',
 '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW()-INTERVAL '110 days'),

-- EFO-002  Arjun Malhotra  (印度，已交货，余款追收中)
('a5000002-0000-0000-0000-000000000002',
 'NC-2024-IN-102', 'Mumbai Steel Imports Pvt. Ltd',
 790000.00, 5710800.00,
 'TT 见票即付', 'FOB', 'port',
 false, true,
 0.00, 0.00,
 'delivered',
 '印度孟买 JNPT 港，已清关并提货，全款收讫。BIS认证文件随货。',
 '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW()-INTERVAL '120 days'),

-- EFO-003  Sophie Lambert  (法国，发货中)
('a5000003-0000-0000-0000-000000000003',
 'NC-2025-FR-017', 'Euro Steel Service Center SAS',
 559800.00, 4047156.00,
 'TT 30天', 'CIF', 'port',
 false, false,
 559800.00, 4047156.00,
 'shipping',
 '法国马赛港，船期COSCO SHIPPING UNIVERSE V.225E，ETD 天津 2025-02-18，ETA 马赛 2025-03-28，待收款。',
 '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW()-INTERVAL '45 days'),

-- EFO-004  Carlos Reyes  (墨西哥，发货中，有逾期尾款)
('a5000004-0000-0000-0000-000000000004',
 'NC-2025-MX-008', 'Mexipipe Industrial S.A. de C.V.',
 676800.00, 4891104.00,
 'TT 30/70', 'CFR', 'port',
 false, true,
 473760.00, 3427392.00,
 'shipping',
 '墨西哥曼萨尼约港，船期ONE COMPETENCE V.137W，已装船，提单号：ONEYQ25021400000，尾款$473,760催收中。',
 '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW()-INTERVAL '38 days'),

-- EFO-005  David Mensah  (加纳，备货中)
('a5000005-0000-0000-0000-000000000005',
 'NC-2025-GH-003', 'Accra Steel Imports Ltd',
 318750.00, 2304525.00,
 'TT 50/50', 'FOB', 'port',
 true, false,
 159375.00, 1152262.50,
 'pre_shipment',
 '加纳特马港，钢板正在工厂备货，计划2025-03-15完成驻厂验货，目标装船日2025-03-25。',
 '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW()-INTERVAL '12 days');

-- ══════════════════════════════════════════════════════════════
-- 7. 出口流程任务（每张订单对应不同完成度）
-- ══════════════════════════════════════════════════════════════

-- ── EFO-001 Park Ji-ho（已交货，全部完成）──────────────────
INSERT INTO export_flow_tasks (id, order_id, code, title, owner_role, assignee_name, status, planned_date, completed_at, requires_attachment, notes, created_by, created_at) VALUES
('a6000001-0000-0000-0000-000000000001','a5000001-0000-0000-0000-000000000001','factory_inspection','工厂验货','salesperson','王芳','done',NOW()-INTERVAL '100 days',NOW()-INTERVAL '98 days',true,'现场验货通过，出具SGS报告','ca9565e8-771a-4240-93d8-5f3f684a4809',NOW()-INTERVAL '110 days'),
('a6000002-0000-0000-0000-000000000002','a5000001-0000-0000-0000-000000000001','customs_declaration','报关出口','salesperson','李娜','done',NOW()-INTERVAL '95 days',NOW()-INTERVAL '94 days',true,'报关单号：3100202411050001','20220f01-91e2-4339-9a8d-2d2761beb3bf',NOW()-INTERVAL '110 days'),
('a6000003-0000-0000-0000-000000000003','a5000001-0000-0000-0000-000000000001','shipment_notice','发货通知','salesperson','李娜','done',NOW()-INTERVAL '93 days',NOW()-INTERVAL '93 days',false,'已发装船通知及提单扫描件给客户','20220f01-91e2-4339-9a8d-2d2761beb3bf',NOW()-INTERVAL '110 days'),
('a6000004-0000-0000-0000-000000000004','a5000001-0000-0000-0000-000000000001','payment_followup','催收尾款','salesperson','张伟','done',NOW()-INTERVAL '55 days',NOW()-INTERVAL '52 days',false,'TT全款到账，约合USD 320,000','0cdc14c7-95ea-426b-91b2-98f29ed95583',NOW()-INTERVAL '110 days'),
('a6000005-0000-0000-0000-000000000005','a5000001-0000-0000-0000-000000000001','satisfaction_survey','客户满意度回访','salesperson','王芳','done',NOW()-INTERVAL '45 days',NOW()-INTERVAL '44 days',false,'客户评价优秀，明确表示Q2将追加订单','ca9565e8-771a-4240-93d8-5f3f684a4809',NOW()-INTERVAL '110 days'),
('a6000006-0000-0000-0000-000000000006','a5000001-0000-0000-0000-000000000001','archive_evidence','归档存证','salesperson','张伟','done',NOW()-INTERVAL '40 days',NOW()-INTERVAL '40 days',true,'全套单据（合同/提单/发票/MTC）已归档','0cdc14c7-95ea-426b-91b2-98f29ed95583',NOW()-INTERVAL '110 days');

-- ── EFO-002 Arjun Malhotra（已交货，全部完成）──────────────
INSERT INTO export_flow_tasks (id, order_id, code, title, owner_role, assignee_name, status, planned_date, completed_at, requires_attachment, notes, created_by, created_at) VALUES
('a6000011-0000-0000-0000-000000000011','a5000002-0000-0000-0000-000000000002','statutory_inspection','法定商检','purchasing_manager','陈建国','done',NOW()-INTERVAL '108 days',NOW()-INTERVAL '106 days',true,'商检证书NO：320100-24-00892，BIS认证文件同步办理','eef55911-d74c-4828-95b3-041dee65407a',NOW()-INTERVAL '120 days'),
('a6000012-0000-0000-0000-000000000012','a5000002-0000-0000-0000-000000000002','factory_inspection','工厂验货','salesperson','刘洋','done',NOW()-INTERVAL '106 days',NOW()-INTERVAL '105 days',true,'BIS认证机构驻厂检验，鞍钢工厂配合','13b33cdb-49d8-401c-bd22-b20b6c8d513a',NOW()-INTERVAL '120 days'),
('a6000013-0000-0000-0000-000000000013','a5000002-0000-0000-0000-000000000002','customs_declaration','报关出口','salesperson','刘洋','done',NOW()-INTERVAL '100 days',NOW()-INTERVAL '99 days',true,'报关完成，HS编码：7208390090','13b33cdb-49d8-401c-bd22-b20b6c8d513a',NOW()-INTERVAL '120 days'),
('a6000014-0000-0000-0000-000000000014','a5000002-0000-0000-0000-000000000002','shipment_notice','发货通知','salesperson','刘洋','done',NOW()-INTERVAL '98 days',NOW()-INTERVAL '98 days',false,'提单号：COSU2024118776，ETA孟买2025-01-08','13b33cdb-49d8-401c-bd22-b20b6c8d513a',NOW()-INTERVAL '120 days'),
('a6000015-0000-0000-0000-000000000015','a5000002-0000-0000-0000-000000000002','payment_followup','催收尾款','salesperson','张伟','done',NOW()-INTERVAL '60 days',NOW()-INTERVAL '58 days',false,'全款$790,000已收妥，换汇结算完成','0cdc14c7-95ea-426b-91b2-98f29ed95583',NOW()-INTERVAL '120 days'),
('a6000016-0000-0000-0000-000000000016','a5000002-0000-0000-0000-000000000002','archive_evidence','归档存证','salesperson','赵雪','done',NOW()-INTERVAL '50 days',NOW()-INTERVAL '50 days',true,'全套单据已扫描归档','99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817',NOW()-INTERVAL '120 days');

-- ── EFO-003 Sophie Lambert（发货中，部分完成）──────────────
INSERT INTO export_flow_tasks (id, order_id, code, title, owner_role, assignee_name, status, planned_date, completed_at, requires_attachment, notes, created_by, created_at) VALUES
('a6000021-0000-0000-0000-000000000021','a5000003-0000-0000-0000-000000000003','factory_inspection','工厂验货','salesperson','王芳','done',NOW()-INTERVAL '38 days',NOW()-INTERVAL '36 days',true,'宝钢工厂验货通过，SPCC品质确认','ca9565e8-771a-4240-93d8-5f3f684a4809',NOW()-INTERVAL '45 days'),
('a6000022-0000-0000-0000-000000000022','a5000003-0000-0000-0000-000000000003','packing_details','装箱/包装确认','salesperson','王芳','done',NOW()-INTERVAL '32 days',NOW()-INTERVAL '30 days',true,'装箱单已制作，90吨冷轧卷分5个40尺柜','ca9565e8-771a-4240-93d8-5f3f684a4809',NOW()-INTERVAL '45 days'),
('a6000023-0000-0000-0000-000000000023','a5000003-0000-0000-0000-000000000003','customs_declaration','报关出口','salesperson','李娜','done',NOW()-INTERVAL '22 days',NOW()-INTERVAL '20 days',true,'已完成天津港出口报关，报关单：3100202502180036','20220f01-91e2-4339-9a8d-2d2761beb3bf',NOW()-INTERVAL '45 days'),
('a6000024-0000-0000-0000-000000000024','a5000003-0000-0000-0000-000000000003','shipment_notice','发货通知','salesperson','王芳','done',NOW()-INTERVAL '18 days',NOW()-INTERVAL '17 days',false,'已发装船通知，COSCO提单号：COSU2502180011','ca9565e8-771a-4240-93d8-5f3f684a4809',NOW()-INTERVAL '45 days'),
('a6000025-0000-0000-0000-000000000025','a5000003-0000-0000-0000-000000000003','eta_reminder','ETA到港提醒','salesperson','王芳','in_progress',NOW()+INTERVAL '3 days',NULL,false,'预计ETA马赛2025-03-28，需提前3天通知客户备提货','ca9565e8-771a-4240-93d8-5f3f684a4809',NOW()-INTERVAL '45 days'),
('a6000026-0000-0000-0000-000000000026','a5000003-0000-0000-0000-000000000003','payment_followup','催收货款','salesperson','张伟','pending',NOW()+INTERVAL '5 days',NULL,false,'TT 30天到期日：' || TO_CHAR(NOW()+INTERVAL '5 days','YYYY-MM-DD') || '，需确认付款','0cdc14c7-95ea-426b-91b2-98f29ed95583',NOW()-INTERVAL '45 days');

-- ── EFO-004 Carlos Reyes（发货中，尾款追收）──────────────
INSERT INTO export_flow_tasks (id, order_id, code, title, owner_role, assignee_name, status, planned_date, completed_at, requires_attachment, notes, created_by, created_at) VALUES
('a6000031-0000-0000-0000-000000000031','a5000004-0000-0000-0000-000000000004','statutory_inspection','法定商检','purchasing_manager','陈建国','done',NOW()-INTERVAL '36 days',NOW()-INTERVAL '34 days',true,'商检证书已取得，RINA第三方认证同步完成','eef55911-d74c-4828-95b3-041dee65407a',NOW()-INTERVAL '38 days'),
('a6000032-0000-0000-0000-000000000032','a5000004-0000-0000-0000-000000000004','factory_inspection','工厂验货','salesperson','赵雪','done',NOW()-INTERVAL '34 days',NOW()-INTERVAL '32 days',true,'RINA检验员驻厂，H型钢验收通过','99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817',NOW()-INTERVAL '38 days'),
('a6000033-0000-0000-0000-000000000033','a5000004-0000-0000-0000-000000000004','packing_details','装箱确认','salesperson','赵雪','done',NOW()-INTERVAL '28 days',NOW()-INTERVAL '26 days',true,'120吨H型钢捆扎装柜，装箱单已发客户确认','99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817',NOW()-INTERVAL '38 days'),
('a6000034-0000-0000-0000-000000000034','a5000004-0000-0000-0000-000000000004','customs_declaration','报关出口','salesperson','李娜','done',NOW()-INTERVAL '22 days',NOW()-INTERVAL '20 days',true,'天津港报关完成，HS编码：7216330000','20220f01-91e2-4339-9a8d-2d2761beb3bf',NOW()-INTERVAL '38 days'),
('a6000035-0000-0000-0000-000000000035','a5000004-0000-0000-0000-000000000004','shipment_notice','发货通知','salesperson','赵雪','done',NOW()-INTERVAL '18 days',NOW()-INTERVAL '18 days',false,'ONE提单号：ONEYQ25021400000，ETA曼萨尼约约2025-03-20','99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817',NOW()-INTERVAL '38 days'),
('a6000036-0000-0000-0000-000000000036','a5000004-0000-0000-0000-000000000004','payment_followup','催收尾款','salesperson','张伟','in_progress',NOW()-INTERVAL '2 days',NULL,false,'尾款$473,760已逾期2天，已发邮件+WhatsApp催款，等回复','0cdc14c7-95ea-426b-91b2-98f29ed95583',NOW()-INTERVAL '38 days');

-- ── EFO-005 David Mensah（备货中，早期阶段）───────────────
INSERT INTO export_flow_tasks (id, order_id, code, title, owner_role, assignee_name, status, planned_date, completed_at, requires_attachment, notes, created_by, created_at) VALUES
('a6000041-0000-0000-0000-000000000041','a5000005-0000-0000-0000-000000000005','factory_inspection','工厂验货','salesperson','刘洋','in_progress',NOW()+INTERVAL '5 days',NULL,true,'计划2025-03-15赴鞍钢工厂验货，钢板正在轧制中','13b33cdb-49d8-401c-bd22-b20b6c8d513a',NOW()-INTERVAL '12 days'),
('a6000042-0000-0000-0000-000000000042','a5000005-0000-0000-0000-000000000005','packing_details','装箱方案确认','salesperson','刘洋','pending',NOW()+INTERVAL '12 days',NULL,true,'60吨热轧板需与客户确认具体装柜方案','13b33cdb-49d8-401c-bd22-b20b6c8d513a',NOW()-INTERVAL '12 days'),
('a6000043-0000-0000-0000-000000000043','a5000005-0000-0000-0000-000000000005','customs_declaration','报关出口','salesperson','李娜','pending',NOW()+INTERVAL '20 days',NULL,true,'待验货完成后准备报关资料','20220f01-91e2-4339-9a8d-2d2761beb3bf',NOW()-INTERVAL '12 days'),
('a6000044-0000-0000-0000-000000000044','a5000005-0000-0000-0000-000000000005','shipment_notice','发货通知','salesperson','刘洋','pending',NOW()+INTERVAL '22 days',NULL,false,'目标装船日2025-03-25，船公司暂定MSC','13b33cdb-49d8-401c-bd22-b20b6c8d513a',NOW()-INTERVAL '12 days'),
('a6000045-0000-0000-0000-000000000045','a5000005-0000-0000-0000-000000000005','payment_followup','预付款确认','salesperson','张伟','done',NOW()-INTERVAL '10 days',NOW()-INTERVAL '9 days',false,'50%预付款$159,375已到账，可启动备货','0cdc14c7-95ea-426b-91b2-98f29ed95583',NOW()-INTERVAL '12 days');

-- ══════════════════════════════════════════════════════════════
-- 8. 请假申请（6条）
-- ══════════════════════════════════════════════════════════════
INSERT INTO leave_requests
  (id, employee_id, leave_type, start_date, end_date, days, reason, status, approved_by, created_at)
VALUES

-- 李娜 — 年假（已批）
('a7000001-0000-0000-0000-000000000001',
 '7a7223a8-f117-4055-8521-3b6f4a23a57f',
 'annual', '2025-01-20', '2025-01-24', 5,
 '春节前年假，回家过年。',
 'approved', 'be2aeb41-5d89-437a-a2d7-822984c533dd',
 NOW()-INTERVAL '40 days'),

-- 王芳 — 病假（已批）
('a7000002-0000-0000-0000-000000000002',
 '4d60fe57-5bcc-49ce-bf9e-97c7eaa19ec7',
 'sick', '2025-02-10', '2025-02-11', 2,
 '感冒发烧，医院就诊，附医院证明。',
 'approved', 'be2aeb41-5d89-437a-a2d7-822984c533dd',
 NOW()-INTERVAL '14 days'),

-- 赵雪 — 事假（待审批）
('a7000003-0000-0000-0000-000000000003',
 '64ba87e7-dbd6-43ab-b9a6-f30f8fbbbf25',
 'personal', '2025-03-05', '2025-03-05', 1,
 '家中老人就医陪同，申请事假1天。',
 'pending', NULL,
 NOW()-INTERVAL '3 days'),

-- 陈敏 — 年假（已批）
('a7000004-0000-0000-0000-000000000004',
 'a848b622-369b-4193-8b47-acd5315b6783',
 'annual', '2025-02-17', '2025-02-21', 5,
 '春节长假延续休息，已提前安排工作交接。',
 'approved', 'be2aeb41-5d89-437a-a2d7-822984c533dd',
 NOW()-INTERVAL '20 days'),

-- 刘洋 — 婚假（待审批）
('a7000005-0000-0000-0000-000000000005',
 '494539fb-2d06-404d-85fb-03ad0edf9d92',
 'marriage', '2025-03-15', '2025-03-21', 7,
 '结婚登记及婚礼，申请婚假7天，婚礼在上海举办。',
 'pending', NULL,
 NOW()-INTERVAL '1 day'),

-- 孙丽 — 产假（已批）
('a7000006-0000-0000-0000-000000000006',
 '24aea268-1ff9-4735-9be0-7d098fd35b57',
 'maternity', '2025-01-01', '2025-04-30', 120,
 '产假，预产期2025年1月10日，申请法定产假120天。',
 'approved', 'be2aeb41-5d89-437a-a2d7-822984c533dd',
 NOW()-INTERVAL '55 days');

-- ══════════════════════════════════════════════════════════════
-- 9. 薪资发放记录（2个月）
-- ══════════════════════════════════════════════════════════════
INSERT INTO payroll_runs
  (id, period_start, period_end, status, total_gross, total_net, currency, lines, processed_by, processed_at, created_at)
VALUES

-- 2025年1月工资（已发放）
('a8000001-0000-0000-0000-000000000001',
 '2025-01-01', '2025-01-31', 'paid',
 312000.00, 265200.00, 'CNY',
 '[
   {"employee":"张伟","gross":18000,"deductions":2160,"net":15840,"bonus":0},
   {"employee":"李娜","gross":15000,"deductions":1800,"net":13200,"bonus":0},
   {"employee":"王芳","gross":20000,"deductions":2400,"net":17600,"bonus":0},
   {"employee":"陈建国","gross":19000,"deductions":2280,"net":16720,"bonus":0},
   {"employee":"刘洋","gross":14000,"deductions":1680,"net":12320,"bonus":0},
   {"employee":"赵雪","gross":13000,"deductions":1560,"net":11440,"bonus":0},
   {"employee":"杨帆","gross":13000,"deductions":1560,"net":11440,"bonus":0},
   {"employee":"陈敏","gross":22000,"deductions":2640,"net":19360,"bonus":0},
   {"employee":"赵磊","gross":12000,"deductions":1440,"net":10560,"bonus":0},
   {"employee":"周静","gross":13000,"deductions":1560,"net":11440,"bonus":0},
   {"employee":"孙丽","gross":17000,"deductions":2040,"net":14960,"bonus":0},
   {"employee":"吴强","gross":16000,"deductions":1920,"net":14080,"bonus":0},
   {"employee":"郑华","gross":15000,"deductions":1800,"net":13200,"bonus":0},
   {"employee":"林芳","gross":14000,"deductions":1680,"net":12320,"bonus":0},
   {"employee":"黄燕","gross":13500,"deductions":1620,"net":11880,"bonus":0},
   {"employee":"徐鹏","gross":25000,"deductions":3000,"net":22000,"bonus":0},
   {"employee":"曹雪","gross":13500,"deductions":1620,"net":11880,"bonus":0}
 ]'::jsonb,
 'be2aeb41-5d89-437a-a2d7-822984c533dd',
 '2025-01-31 18:00:00+08',
 '2025-01-28 10:00:00+08'),

-- 2025年2月工资（含年终奖，已发放）
('a8000002-0000-0000-0000-000000000002',
 '2025-02-01', '2025-02-28', 'paid',
 498000.00, 423300.00, 'CNY',
 '[
   {"employee":"张伟","gross":18000,"deductions":2160,"net":15840,"bonus":36000},
   {"employee":"李娜","gross":15000,"deductions":1800,"net":13200,"bonus":22500},
   {"employee":"王芳","gross":20000,"deductions":2400,"net":17600,"bonus":40000},
   {"employee":"陈建国","gross":19000,"deductions":2280,"net":16720,"bonus":28500},
   {"employee":"刘洋","gross":14000,"deductions":1680,"net":12320,"bonus":14000},
   {"employee":"赵雪","gross":13000,"deductions":1560,"net":11440,"bonus":13000},
   {"employee":"杨帆","gross":13000,"deductions":1560,"net":11440,"bonus":13000},
   {"employee":"陈敏","gross":22000,"deductions":2640,"net":19360,"bonus":44000},
   {"employee":"赵磊","gross":12000,"deductions":1440,"net":10560,"bonus":12000},
   {"employee":"周静","gross":13000,"deductions":1560,"net":11440,"bonus":13000},
   {"employee":"孙丽","gross":17000,"deductions":2040,"net":14960,"bonus":0},
   {"employee":"吴强","gross":16000,"deductions":1920,"net":14080,"bonus":16000},
   {"employee":"郑华","gross":15000,"deductions":1800,"net":13200,"bonus":15000},
   {"employee":"林芳","gross":14000,"deductions":1680,"net":12320,"bonus":14000},
   {"employee":"黄燕","gross":13500,"deductions":1620,"net":11880,"bonus":13500},
   {"employee":"徐鹏","gross":25000,"deductions":3000,"net":22000,"bonus":50000},
   {"employee":"曹雪","gross":13500,"deductions":1620,"net":11880,"bonus":13500}
 ]'::jsonb,
 'be2aeb41-5d89-437a-a2d7-822984c533dd',
 '2025-02-28 18:00:00+08',
 '2025-02-25 10:00:00+08');

-- ══════════════════════════════════════════════════════════════
-- ✅ Done — 汇总
-- ══════════════════════════════════════════════════════════════
DO $$
BEGIN
  RAISE NOTICE '=== 诺钢 Demo 数据写入完成 ===';
  RAISE NOTICE '供应商:     6 条';
  RAISE NOTICE '供应商报价: 14 条';
  RAISE NOTICE '库存产品:   6 条';
  RAISE NOTICE '采购订单:   7 条';
  RAISE NOTICE '财务发票:   8 条';
  RAISE NOTICE '出口流程:   5 条订单  30 条任务';
  RAISE NOTICE '请假申请:   6 条';
  RAISE NOTICE '薪资发放:   2 条（含2月年终奖）';
END $$;
