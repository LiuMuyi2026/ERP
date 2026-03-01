-- ============================================================
-- Nexus ERP — CRM Demo Data Seed (诺钢 Steel Export)
-- Schema: tenant_demo
-- Run: PGPASSWORD=nexus_secret psql -h localhost -U nexus -d nexus_platform -f seed_demo_crm.sql
-- ============================================================

SET search_path TO tenant_demo;

-- Create interactions table if it doesn't exist yet
CREATE TABLE IF NOT EXISTS interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    contact_id UUID,
    lead_id UUID,
    type VARCHAR(50) NOT NULL,
    direction VARCHAR(10) DEFAULT 'outbound',
    content TEXT,
    metadata JSONB DEFAULT '{}',
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Clear existing demo leads (keep system users) ────────────────────────────
DELETE FROM crm_receivables
WHERE contract_id IN (SELECT id FROM crm_contracts WHERE lead_id IN (
    SELECT id FROM leads WHERE email LIKE '%@demo-crm.nexus'
));
DELETE FROM crm_contracts WHERE lead_id IN (SELECT id FROM leads WHERE email LIKE '%@demo-crm.nexus');
DELETE FROM interactions WHERE lead_id IN (SELECT id FROM leads WHERE email LIKE '%@demo-crm.nexus');
DELETE FROM audit_logs WHERE resource_type = 'lead'
  AND resource_id IN (SELECT id FROM leads WHERE email LIKE '%@demo-crm.nexus');
DELETE FROM leads WHERE email LIKE '%@demo-crm.nexus';

-- ── Sales reps (existing users) ──────────────────────────────────────────────
-- 张伟  0cdc14c7-95ea-426b-91b2-98f29ed95583
-- 李娜  20220f01-91e2-4339-9a8d-2d2761beb3bf
-- 王芳  ca9565e8-771a-4240-93d8-5f3f684a4809
-- 陈建国 eef55911-d74c-4828-95b3-041dee65407a
-- 刘洋  13b33cdb-49d8-401c-bd22-b20b6c8d513a
-- 赵雪  99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817

-- ══════════════════════════════════════════════════════════════
-- LEADS  (12 leads, steel-export themed, 诺钢 business)
-- Stage distribution:
--   Stage 1 销售洽谈:    inquiry(2)  replied(2)
--   Stage 2 签定出口合同: quoted(2)
--   Stage 3 采购流程:    procuring(1)
--   Stage 4 订舱流程:    booking(1)
--   Stage 5 发货流程:    fulfillment(2)
--   Stage 6 回款结算:    converted(2)
-- ══════════════════════════════════════════════════════════════

INSERT INTO leads (id, full_name, email, phone, whatsapp, company, title, source, status,
    assigned_to, custom_fields, workflow_data, ai_summary, last_contacted_at, created_at)
VALUES

-- ── Stage 1: 销售洽谈 — inquiry (2 leads) ────────────────────

-- 1. Omar Al-Farsi — 阿联酋钢管经销商 (inquiry)
(
    'a1000001-0000-0000-0000-000000000001',
    'Omar Al-Farsi',
    'omar.alfarsi@gulfsteelpipe@demo-crm.nexus',
    '+971 4 887 3300', '+971 50 234 7890',
    'Gulf Steel Pipe Trading LLC', '总经理', '展会',
    'inquiry',
    '0cdc14c7-95ea-426b-91b2-98f29ed95583',
    '{"country":"阿联酋","city":"迪拜","industry":"钢管贸易","website":"gulfsteelpipe.ae","budget":"$320,000","purchase_cycle":"季度","decision_maker":"Omar Al-Farsi","lead_grade":"B","company_size":"50-200人","product_interest":"ERW焊接钢管、镀锌钢管"}',
    NULL,
    'Gulf Steel Pipe Trading 是迪拜自贸区知名钢管经销商，主要供应中东建筑和石油管道市场。Omar 在广州钢铁展上拿到我司名片，初步询价ERW焊接钢管和镀锌钢管，尚未回复具体规格需求。',
    NOW() - INTERVAL '2 hours',
    NOW() - INTERVAL '3 days'
),

-- 2. Ivan Petrov — 俄罗斯钢板采购商 (inquiry)
(
    'a1000002-0000-0000-0000-000000000002',
    'Ivan Petrov',
    'ivan.petrov@uralindustrials@demo-crm.nexus',
    '+7 343 222 4455', '+7 912 345 6789',
    'Ural Industrial Supplies OOO', '采购总监', '平台',
    'inquiry',
    '20220f01-91e2-4339-9a8d-2d2761beb3bf',
    '{"country":"俄罗斯","city":"叶卡捷琳堡","industry":"工业制造","website":"uralindustrial.ru","budget":"$500,000","purchase_cycle":"半年","decision_maker":"Ivan Petrov","lead_grade":"A","company_size":"200-500人","product_interest":"热轧钢板、中厚板"}',
    NULL,
    'Ural Industrial Supplies 是乌拉尔地区主要工业原材料分销商，为机械制造和矿业设备厂商供货。Ivan 通过阿里巴巴平台询价热轧钢板（Q235B/Q345B），规格需求较大，正在货比三家。',
    NOW() - INTERVAL '5 hours',
    NOW() - INTERVAL '2 days'
),

-- ── Stage 1: 销售洽谈 — replied (2 leads) ───────────────────

-- 3. Maria Kowalski — 波兰钢结构企业 (replied)
(
    'a1000003-0000-0000-0000-000000000003',
    'Maria Kowalski',
    'maria.kowalski@polsteelworks@demo-crm.nexus',
    '+48 22 456 7890', '+48 601 234 567',
    'Pol Steel Works Sp. z o.o.', '国际采购经理', '邮件开发',
    'replied',
    'ca9565e8-771a-4240-93d8-5f3f684a4809',
    '{"country":"波兰","city":"华沙","industry":"钢结构建筑","website":"polsteelworks.pl","budget":"$280,000","purchase_cycle":"季度","decision_maker":"Maria Kowalski","lead_grade":"B","company_size":"100-200人","product_interest":"H型钢、角钢、槽钢"}',
    NULL,
    'Pol Steel Works 是波兰知名钢结构建筑承包商，承接欧洲中小型工业厂房和仓储项目。Maria 已回复我司开发邮件，对H型钢和角钢系列有具体需求，提及欧盟CE认证要求，正在收集多家供应商资料。',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '18 days'
),

-- 4. Reza Ahmadi — 伊朗钢材进口商 (replied)
(
    'a1000004-0000-0000-0000-000000000004',
    'Reza Ahmadi',
    'reza.ahmadi@tehransteel@demo-crm.nexus',
    '+98 21 8877 6655', '+98 912 345 6789',
    'Tehran Steel Import Co.', '业务总监', '引荐',
    'replied',
    'eef55911-d74c-4828-95b3-041dee65407a',
    '{"country":"伊朗","city":"德黑兰","industry":"钢材贸易","website":"tehransteel.ir","budget":"$420,000","purchase_cycle":"季度","decision_maker":"Reza Ahmadi","lead_grade":"A","company_size":"50-200人","product_interest":"冷轧钢卷、热镀锌钢板"}',
    NULL,
    'Tehran Steel Import 是伊朗主要钢材进口贸易商，通过中间国转口贸易进口中国钢材。Reza 是老客户推荐，对冷轧钢卷和热镀锌钢板兴趣浓厚，已发回初步规格确认函，付款方式倾向于TT或第三国LC。',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '25 days'
),

-- ── Stage 2: 签定出口合同 — quoted (2 leads) ─────────────────

-- 5. James Okafor — 尼日利亚建材进口商 (quoted)
(
    'a1000005-0000-0000-0000-000000000005',
    'James Okafor',
    'james.okafor@lagosbuildmat@demo-crm.nexus',
    '+234 1 463 2200', '+234 803 456 7890',
    'Lagos Building Materials Ltd', '采购总监', '展会',
    'quoted',
    '13b33cdb-49d8-401c-bd22-b20b6c8d513a',
    '{"country":"尼日利亚","city":"拉各斯","industry":"建材贸易","website":"lagosbuild.ng","budget":"$650,000","purchase_cycle":"季度","decision_maker":"James Okafor","lead_grade":"A","company_size":"200-500人","product_interest":"螺纹钢、线材、方坯","quote_no":"QT-2025-NG-005"}',
    NULL,
    'Lagos Building Materials 是尼日利亚最大的建材进口贸易商之一，主要供应拉各斯和阿布贾的建筑市场。James 在广交会上与我司达成初步意向，已收到正式报价单（QT-2025-NG-005），螺纹钢 HRB400 报价$520/MT CIF拉各斯，等待客户内部审批。',
    NOW() - INTERVAL '4 days',
    NOW() - INTERVAL '35 days'
),

-- 6. Nguyen Van Thanh — 越南钢铁分销商 (quoted)
(
    'a1000006-0000-0000-0000-000000000006',
    'Nguyen Van Thanh',
    'thanh.nguyen@vietsteeldist@demo-crm.nexus',
    '+84 28 3822 5500', '+84 908 123 456',
    'Viet Steel Distribution Co., Ltd', '总经理', '平台',
    'quoted',
    '99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817',
    '{"country":"越南","city":"胡志明市","industry":"钢材分销","website":"vietsteel.vn","budget":"$380,000","purchase_cycle":"月度","decision_maker":"Nguyen Van Thanh","lead_grade":"B","company_size":"100-200人","product_interest":"钢管、矩形管、圆管","quote_no":"QT-2025-VN-006"}',
    NULL,
    'Viet Steel Distribution 是胡志明市主要钢管分销商，为建筑、家具和机械制造企业供货。Thanh 通过阿里巴巴主动询价，需求量稳定，已发送报价单（QT-2025-VN-006），方管/矩形管报价$580/MT FOB上海，对价格敏感，希望信用证付款。',
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '40 days'
),

-- ── Stage 3: 采购流程 — procuring (1 lead) ───────────────────

-- 7. Ahmed Hassan — 沙特基础建设采购商 (procuring)
(
    'a1000007-0000-0000-0000-000000000007',
    'Ahmed Hassan',
    'ahmed.hassan@sabicsteel@demo-crm.nexus',
    '+966 11 465 3300', '+966 55 678 9012',
    'SABIC Steel & Construction Trading Co.', '采购与物流总监', '引荐',
    'procuring',
    '0cdc14c7-95ea-426b-91b2-98f29ed95583',
    '{"country":"沙特阿拉伯","city":"利雅得","industry":"建筑钢材","website":"sabicsteel.sa","budget":"$1,200,000","purchase_cycle":"月度","decision_maker":"Ahmed Hassan","lead_grade":"A","company_size":"500+人","product_interest":"工字钢、钢板桩、钢管桩","contract_no":"SC-2025-SA-007"}',
    '{"stages": [{"stage_index": 0, "stage_name": "销售洽谈", "completed": true, "completed_at": "2025-01-10T08:00:00Z", "steps": [{"key": "initial_contact", "label": "初次联系", "done": true}, {"key": "needs_analysis", "label": "需求分析", "done": true}, {"key": "send_catalog", "label": "发送产品目录", "done": true}]}, {"stage_index": 1, "stage_name": "签定出口合同", "completed": true, "completed_at": "2025-01-28T10:30:00Z", "steps": [{"key": "send_quote", "label": "发送报价单", "done": true}, {"key": "negotiate_terms", "label": "条款谈判", "done": true}, {"key": "sign_contract", "label": "合同签署", "done": true}]}, {"stage_index": 2, "stage_name": "采购流程", "completed": false, "steps": [{"key": "place_mill_order", "label": "向钢厂下单", "done": true}, {"key": "production_schedule", "label": "排产确认", "done": true}, {"key": "quality_inspection", "label": "出厂质检", "done": false}, {"key": "ready_for_shipment", "label": "备货完成通知", "done": false}]}]}',
    'SABIC Steel & Construction 是沙特利雅得大型建筑钢材贸易商，长期为沙特Vision 2030基础设施项目供货。Ahmed 由老客户推荐，合同已签署（SC-2025-SA-007），工字钢和钢管桩共1,800MT，已向宝钢下单，目前在排产中，预计30天后出厂质检。',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '60 days'
),

-- ── Stage 4: 订舱流程 — booking (1 lead) ─────────────────────

-- 8. David Mensah — 加纳钢材进口商 (booking)
(
    'a1000008-0000-0000-0000-000000000008',
    'David Mensah',
    'david.mensah@accrasteel@demo-crm.nexus',
    '+233 30 277 8800', '+233 24 456 7890',
    'Accra Steel Imports Ltd', '总经理', '邮件开发',
    'booking',
    '20220f01-91e2-4339-9a8d-2d2761beb3bf',
    '{"country":"加纳","city":"阿克拉","industry":"钢材建材","website":"accrasteel.gh","budget":"$480,000","purchase_cycle":"季度","decision_maker":"David Mensah","lead_grade":"B","company_size":"50-200人","product_interest":"角钢、扁钢、钢筋","contract_no":"SC-2025-GH-008"}',
    '{"stages": [{"stage_index": 0, "stage_name": "销售洽谈", "completed": true, "completed_at": "2025-01-05T09:00:00Z", "steps": [{"key": "initial_contact", "label": "初次联系", "done": true}, {"key": "needs_analysis", "label": "需求分析", "done": true}, {"key": "send_catalog", "label": "发送产品目录", "done": true}]}, {"stage_index": 1, "stage_name": "签定出口合同", "completed": true, "completed_at": "2025-01-20T11:00:00Z", "steps": [{"key": "send_quote", "label": "发送报价单", "done": true}, {"key": "negotiate_terms", "label": "条款谈判", "done": true}, {"key": "sign_contract", "label": "合同签署", "done": true}]}, {"stage_index": 2, "stage_name": "采购流程", "completed": true, "completed_at": "2025-02-08T14:00:00Z", "steps": [{"key": "place_mill_order", "label": "向钢厂下单", "done": true}, {"key": "production_schedule", "label": "排产确认", "done": true}, {"key": "quality_inspection", "label": "出厂质检", "done": true}, {"key": "ready_for_shipment", "label": "备货完成通知", "done": true}]}, {"stage_index": 3, "stage_name": "订舱流程", "completed": false, "steps": [{"key": "book_vessel", "label": "联系货代订舱", "done": true}, {"key": "confirm_space", "label": "确认舱位/船期", "done": true}, {"key": "customs_declaration", "label": "报关单证准备", "done": false}, {"key": "bl_draft", "label": "提单草稿确认", "done": false}]}]}',
    'Accra Steel Imports 是加纳首都阿克拉主要建材进口商，为西非建筑工地提供钢筋和型钢。合同已签（SC-2025-GH-008），角钢+钢筋共620MT，货物已出厂，货代已订舱（船期2025-03-05广州港出发），目前正在准备报关单证和装箱清单。',
    NOW() - INTERVAL '12 hours',
    NOW() - INTERVAL '55 days'
),

-- ── Stage 5: 发货流程 — fulfillment (2 leads) ────────────────

-- 9. Carlos Reyes — 墨西哥钢管建材商 (fulfillment)
(
    'a1000009-0000-0000-0000-000000000009',
    'Carlos Reyes',
    'carlos.reyes@mexipipe@demo-crm.nexus',
    '+52 81 8765 4321', '+52 1 81 9876 5432',
    'Mexipipe Industrial S.A. de C.V.', '采购与物流总监', '平台',
    'fulfillment',
    'ca9565e8-771a-4240-93d8-5f3f684a4809',
    '{"country":"墨西哥","city":"蒙特雷","industry":"钢管建材","website":"mexipipe.com.mx","budget":"$750,000","purchase_cycle":"季度","decision_maker":"Carlos Reyes","lead_grade":"A","company_size":"200-500人","product_interest":"无缝钢管、石油套管","contract_no":"SC-2025-MX-009","bl_no":"COSCO25MX09876"}',
    '{"stages": [{"stage_index": 0, "stage_name": "销售洽谈", "completed": true, "completed_at": "2024-12-10T08:00:00Z", "steps": [{"key": "initial_contact", "label": "初次联系", "done": true}, {"key": "needs_analysis", "label": "需求分析", "done": true}, {"key": "send_catalog", "label": "发送产品目录", "done": true}]}, {"stage_index": 1, "stage_name": "签定出口合同", "completed": true, "completed_at": "2024-12-28T10:00:00Z", "steps": [{"key": "send_quote", "label": "发送报价单", "done": true}, {"key": "negotiate_terms", "label": "条款谈判", "done": true}, {"key": "sign_contract", "label": "合同签署", "done": true}]}, {"stage_index": 2, "stage_name": "采购流程", "completed": true, "completed_at": "2025-01-20T09:00:00Z", "steps": [{"key": "place_mill_order", "label": "向钢厂下单", "done": true}, {"key": "production_schedule", "label": "排产确认", "done": true}, {"key": "quality_inspection", "label": "出厂质检", "done": true}, {"key": "ready_for_shipment", "label": "备货完成通知", "done": true}]}, {"stage_index": 3, "stage_name": "订舱流程", "completed": true, "completed_at": "2025-02-01T11:00:00Z", "steps": [{"key": "book_vessel", "label": "联系货代订舱", "done": true}, {"key": "confirm_space", "label": "确认舱位/船期", "done": true}, {"key": "customs_declaration", "label": "报关单证准备", "done": true}, {"key": "bl_draft", "label": "提单草稿确认", "done": true}]}, {"stage_index": 4, "stage_name": "发货流程", "completed": false, "steps": [{"key": "loading_complete", "label": "装柜完成", "done": true}, {"key": "vessel_departed", "label": "船舶离港", "done": true}, {"key": "bl_issued", "label": "正本提单签发", "done": true}, {"key": "docs_sent", "label": "单据寄送客户", "done": false}, {"key": "eta_tracking", "label": "在途追踪通知", "done": false}]}]}',
    'Mexipipe Industrial 是蒙特雷工业区主要无缝钢管供应商，服务墨西哥油气和建筑行业。合同SC-2025-MX-009，无缝钢管900MT，船已于2025-02-10从上海港出发，提单号COSCO25MX09876，预计ETA 2025-03-18曼萨尼约港，正本提单已签发待邮寄。',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '80 days'
),

-- 10. Sophie Lambert — 法国钢铁服务中心 (fulfillment)
(
    'a1000010-0000-0000-0000-000000000010',
    'Sophie Lambert',
    'sophie.lambert@eurosteelcenter@demo-crm.nexus',
    '+33 3 8812 4400', '+33 6 78 90 12 34',
    'Euro Steel Service Center SAS', '采购总监', '展会',
    'fulfillment',
    'eef55911-d74c-4828-95b3-041dee65407a',
    '{"country":"法国","city":"里昂","industry":"钢铁服务中心","website":"eurosteelcenter.fr","budget":"$920,000","purchase_cycle":"月度","decision_maker":"Sophie Lambert","lead_grade":"A","company_size":"200-500人","product_interest":"冷轧卷板、镀锌卷","contract_no":"SC-2025-FR-010","bl_no":"MSC25FR11223"}',
    '{"stages": [{"stage_index": 0, "stage_name": "销售洽谈", "completed": true, "completed_at": "2024-11-15T09:00:00Z", "steps": [{"key": "initial_contact", "label": "初次联系", "done": true}, {"key": "needs_analysis", "label": "需求分析", "done": true}, {"key": "send_catalog", "label": "发送产品目录", "done": true}]}, {"stage_index": 1, "stage_name": "签定出口合同", "completed": true, "completed_at": "2024-12-05T11:00:00Z", "steps": [{"key": "send_quote", "label": "发送报价单", "done": true}, {"key": "negotiate_terms", "label": "条款谈判", "done": true}, {"key": "sign_contract", "label": "合同签署", "done": true}]}, {"stage_index": 2, "stage_name": "采购流程", "completed": true, "completed_at": "2025-01-10T10:00:00Z", "steps": [{"key": "place_mill_order", "label": "向钢厂下单", "done": true}, {"key": "production_schedule", "label": "排产确认", "done": true}, {"key": "quality_inspection", "label": "出厂质检", "done": true}, {"key": "ready_for_shipment", "label": "备货完成通知", "done": true}]}, {"stage_index": 3, "stage_name": "订舱流程", "completed": true, "completed_at": "2025-01-22T09:00:00Z", "steps": [{"key": "book_vessel", "label": "联系货代订舱", "done": true}, {"key": "confirm_space", "label": "确认舱位/船期", "done": true}, {"key": "customs_declaration", "label": "报关单证准备", "done": true}, {"key": "bl_draft", "label": "提单草稿确认", "done": true}]}, {"stage_index": 4, "stage_name": "发货流程", "completed": false, "steps": [{"key": "loading_complete", "label": "装柜完成", "done": true}, {"key": "vessel_departed", "label": "船舶离港", "done": true}, {"key": "bl_issued", "label": "正本提单签发", "done": true}, {"key": "docs_sent", "label": "单据寄送客户", "done": true}, {"key": "eta_tracking", "label": "在途追踪通知", "done": false}]}]}',
    'Euro Steel Service Center 是法国里昂专业冷轧钢材加工中心，为汽车零部件和家电制造商提供剪切、纵剪服务。合同SC-2025-FR-010，冷轧卷板+镀锌卷共1,200MT，船已于2025-02-01从宁波港出发（提单MSC25FR11223），ETA 2025-03-10鹿特丹港转法国，单据已快递寄出，等待客户确认收单。',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '95 days'
),

-- ── Stage 6: 回款结算 — converted (2 leads) ──────────────────

-- 11. Park Ji-ho — 韩国钢铁贸易商 (converted)
(
    'a1000011-0000-0000-0000-000000000011',
    'Park Ji-ho',
    'jiho.park@koreaglobal@demo-crm.nexus',
    '+82 2 5556 7788', '+82 10 4567 8901',
    'Korea Global Steel Trading Co., Ltd', '国际业务部长', '引荐',
    'converted',
    '13b33cdb-49d8-401c-bd22-b20b6c8d513a',
    '{"country":"韩国","city":"釜山","industry":"钢铁贸易","website":"koreaglobalsteel.kr","budget":"$1,500,000","purchase_cycle":"月度","decision_maker":"Park Ji-ho","lead_grade":"A","company_size":"200-500人","product_interest":"中厚板、船板、海工用钢","contract_no":"SC-2025-KR-011","total_orders":"3笔","total_amount":"$485,000"}',
    NULL,
    'Korea Global Steel Trading 是釜山知名钢铁贸易公司，专门向韩国造船厂和海工平台供应中国中厚板和船板。Park Ji-ho 通过老客户介绍，已完成三笔合同，最近一笔船板1,500MT货款已全额回收，是稳定优质客户，正在谈第四笔年度框架协议。',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '150 days'
),

-- 12. Arjun Malhotra — 印度钢材进口商 (converted)
(
    'a1000012-0000-0000-0000-000000000012',
    'Arjun Malhotra',
    'arjun.malhotra@mumbaisteels@demo-crm.nexus',
    '+91 22 6677 8899', '+91 98200 12345',
    'Mumbai Steel Imports Pvt. Ltd', '总经理', '平台',
    'converted',
    '99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817',
    '{"country":"印度","city":"孟买","industry":"钢材贸易","website":"mumbaisteels.in","budget":"$800,000","purchase_cycle":"季度","decision_maker":"Arjun Malhotra","lead_grade":"A","company_size":"100-200人","product_interest":"热轧卷、钢坯","contract_no":"SC-2025-IN-012","total_orders":"2笔","total_amount":"$312,000"}',
    NULL,
    'Mumbai Steel Imports 是孟买港主要钢材进口贸易商，主营热轧卷板和钢坯转售业务。Arjun 通过阿里巴巴找到我司，首笔热轧卷180MT货款已全额回收（T/T），第二笔钢坯320MT尾款于上周到账，关系良好，已进入框架合作阶段，承诺每季度至少两批订单。',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '120 days'
);


-- ══════════════════════════════════════════════════════════════
-- INTERACTIONS (steel-export themed)
-- ══════════════════════════════════════════════════════════════

INSERT INTO interactions (lead_id, type, direction, content, metadata, created_by, created_at)
VALUES

-- ── Omar Al-Farsi (inquiry) ───────────────────────────────────
('a1000001-0000-0000-0000-000000000001', 'email', 'inbound',
 '您好，我在广州钢铁展（Metal China 2025）上拿到了贵公司的资料。我们公司主要在中东地区经销钢管，目前需要 ERW 焊接钢管（外径 21.3mm-168.3mm）和热镀锌钢管，月需求量约 500MT。请问贵司能否提供？需要了解 FOB 上海报价和 API 5L 认证情况。',
 '{}', '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW() - INTERVAL '3 days'),

('a1000001-0000-0000-0000-000000000001', 'note', 'outbound',
 '【跟进记录】客户来自广州展会，A级潜力客户。中东钢管市场需求稳定，ERW钢管是主力产品。需要回复报价并附上 API 5L、ISO 3183 认证文件。建议张伟今日内回复，不要让客户等太久。',
 '{}', '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW() - INTERVAL '2 hours'),

-- ── Ivan Petrov (inquiry) ─────────────────────────────────────
('a1000002-0000-0000-0000-000000000002', 'email', 'inbound',
 'Добрый день，我们是俄罗斯乌拉尔地区的工业物资供应商。在阿里巴巴上看到贵公司的热轧钢板（Q235B/Q345B）。请提供以下规格的 FOB 价格：10mm×1500mm×6000mm 和 16mm×2000mm×6000mm，每种各需要约 800MT。需要原厂质保书（MTC）和第三方检测报告（SGS或BV）。',
 '{}', '20220f01-91e2-4339-9a8d-2d2761beb3bf', NOW() - INTERVAL '2 days'),

('a1000002-0000-0000-0000-000000000002', 'note', 'outbound',
 '【跟进记录】俄罗斯客户，需求量大（1600MT合计），是优质B2B客户。注意俄罗斯付款合规问题，可能需要通过第三国银行结算。建议李娜今日回复报价，附上宝钢或鞍钢的材质证明样本，展示供货实力。',
 '{}', '20220f01-91e2-4339-9a8d-2d2761beb3bf', NOW() - INTERVAL '5 hours'),

-- ── Maria Kowalski (replied) ──────────────────────────────────
('a1000003-0000-0000-0000-000000000003', 'email', 'outbound',
 'Dear Maria，您好！感谢您对诺钢的关注。我们是中国专业钢材出口商，已出口欧洲市场超过10年，持有 EN 10025 认证。附上 H型钢（HEA/HEB系列）、等边角钢和槽钢的完整规格表及价格指导。推荐您关注我们的 HEA 200×200 H型钢，近期报价 $645/MT FOB 上海，CE 认证文件齐全。请问您目前需要哪些具体规格？',
 '{"attachments":["catalog_structural_steel_EU.pdf","EN10025_cert.pdf","CE_marking_docs.pdf"]}', 'ca9565e8-771a-4240-93d8-5f3f684a4809', NOW() - INTERVAL '16 days'),

('a1000003-0000-0000-0000-000000000003', 'email', 'inbound',
 'Wang Fang，您好！感谢您的快速回复和资料。我们目前有一个仓储项目需要 H型钢 HEA 200 约 150MT，还需要角钢 L100×100×10 约 80MT。请问这个数量是否达到 MOQ？能否在现有价格基础上再优惠一些？另外我们的付款方式通常是 30天净付款（NET 30），贵司能接受吗？',
 '{}', 'ca9565e8-771a-4240-93d8-5f3f684a4809', NOW() - INTERVAL '12 days'),

('a1000003-0000-0000-0000-000000000003', 'whatsapp', 'outbound',
 'Maria 您好，我是王芳。您的邮件已收到，H型钢150MT + 角钢80MT 完全达到我们的出口起订量。价格方面我向老板申请了，H型钢可以做到 $635/MT，角钢 $610/MT（均含FOB上海）。付款方式我们通常需要 30% 预付+70% 见提单，但对于老客户可以商量。请问您什么时候方便通话详谈？',
 '{}', 'ca9565e8-771a-4240-93d8-5f3f684a4809', NOW() - INTERVAL '10 days'),

('a1000003-0000-0000-0000-000000000003', 'call', 'outbound',
 'WhatsApp 语音通话 25 分钟。Maria 确认数量和规格，对价格基本认可。主要讨论：①质量证书需要第三方检测（SGS）②交货期希望 45 天内到波兰格但斯克港 ③正在与另一家中国供应商比价，希望下周前给正式报价单。已承诺明天发送 PI。',
 '{}', 'ca9565e8-771a-4240-93d8-5f3f684a4809', NOW() - INTERVAL '3 days'),

-- ── Reza Ahmadi (replied) ─────────────────────────────────────
('a1000004-0000-0000-0000-000000000004', 'email', 'inbound',
 '您好，我是通过朋友（Masoud Karimi）了解到贵公司。我们专门从事冷轧钢卷进口，目前需要 SPCC/DC01 冷轧卷 1.0mm×1250mm，月需求约 300-500MT。另外也需要热镀锌钢板 DX51D Z275，1.5mm×1250mm，月需求 200MT。请问贵司能否通过第三国（如阿联酋或土耳其）安排 LC 结算？',
 '{}', 'eef55911-d74c-4828-95b3-041dee65407a', NOW() - INTERVAL '24 days'),

('a1000004-0000-0000-0000-000000000004', 'email', 'outbound',
 'Dear Reza，您好！非常感谢 Masoud 的引荐，也感谢您的来信。关于您的需求：①SPCC 冷轧卷 1.0mm×1250mm：$680/MT CIF 班达尔阿巴斯 ②DX51D 镀锌钢板 1.5mm×1250mm：$760/MT CIF。两款均有完整的 SGS 检测报告和原厂 MTC。关于 LC 结算，我们可以接受通过阿联酋或土耳其银行开立的不可撤销即期 LC，这没有问题。请提供贵司营业执照和银行信息，我方安排正式报价。',
 '{"attachments":["cold_rolled_specs.pdf","GI_sheet_specs.pdf","payment_terms_guide.pdf"]}', 'eef55911-d74c-4828-95b3-041dee65407a', NOW() - INTERVAL '22 days'),

('a1000004-0000-0000-0000-000000000004', 'email', 'inbound',
 'Zhang Jian Guo，感谢您的回复！价格在可接受范围。我们公司营业执照和银行信息已附上。请问能否先安排 50MT 冷轧卷的小单试货？如果质量和服务满意，我们会立即转为月度固定合作。另外能否提供贵司的出口许可和报关资质文件？',
 '{"attachments":["company_license_tehran.pdf"]}', 'eef55911-d74c-4828-95b3-041dee65407a', NOW() - INTERVAL '5 days'),

-- ── James Okafor (quoted) ──────────────────────────────────────
('a1000005-0000-0000-0000-000000000005', 'email', 'inbound',
 'Good day，我们在广交会上参观了贵公司展台，对螺纹钢 HRB400 非常感兴趣。尼日利亚建筑市场目前非常活跃，我们每季度需要约 1,000-1,500MT 螺纹钢（Φ12-Φ32），还需要线材盘卷 SAE1006 约 500MT。请提供 CIF 拉各斯港的报价。',
 '{}', '13b33cdb-49d8-401c-bd22-b20b6c8d513a', NOW() - INTERVAL '33 days'),

('a1000005-0000-0000-0000-000000000005', 'email', 'outbound',
 'Dear James，您好！根据您的需求，正式报价单 QT-2025-NG-005 已附上。螺纹钢 HRB400 Φ12-Φ32：$520/MT CIF 拉各斯（含海运险）；线材 SAE1006：$495/MT CIF。付款条件：30% T/T 预付 + 70% 见提单副本。交货期：签合同后 35 天装船。我方持有 GB 1499.2-2018 国标认证和 SGS 检测资质，可出具 EN/ASTM 等效说明文件。请确认是否接受？',
 '{"attachments":["QT-2025-NG-005.pdf","rebar_mill_cert_sample.pdf","shipping_schedule_Lagos.pdf"]}', '13b33cdb-49d8-401c-bd22-b20b6c8d513a', NOW() - INTERVAL '30 days'),

('a1000005-0000-0000-0000-000000000005', 'whatsapp', 'inbound',
 'Liu Yang，报价单收到了！我们内部讨论结果：①数量确认 1,200MT 螺纹钢 + 500MT 线材 ②价格基本可以，但希望螺纹钢能做到 $510 ③付款方式我们倾向于 LC，能接受吗？老板说如果可以 LC 就可以马上定合同。',
 '{}', '13b33cdb-49d8-401c-bd22-b20b6c8d513a', NOW() - INTERVAL '20 days'),

('a1000005-0000-0000-0000-000000000005', 'call', 'outbound',
 '与 James 通话 35 分钟。价格谈判：螺纹钢最终敲定 $515/MT（原报 $520，让步 $5），线材维持 $495。付款方式：接受不可撤销即期 LC，由 First Bank Nigeria 开立，我方可接受。James 表示将在本周内安排公司总部批复合同，预计 3-5 天回复正式意向书。',
 '{}', '13b33cdb-49d8-401c-bd22-b20b6c8d513a', NOW() - INTERVAL '4 days'),

-- ── Nguyen Van Thanh (quoted) ─────────────────────────────────
('a1000006-0000-0000-0000-000000000006', 'email', 'inbound',
 '您好，在阿里巴巴上看到贵公司的钢管产品。我们是越南胡志明市的钢管经销商，需要以下规格：方管 40×40×2.0 和 50×50×2.5，圆管 48.3mm×2.5mm，每种各约 100MT，共 300MT。请提供 FOB 上海价格。我们通常做 LC 结算，开证行是越南工商银行（Vietinbank）。',
 '{}', '99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817', NOW() - INTERVAL '38 days'),

('a1000006-0000-0000-0000-000000000006', 'email', 'outbound',
 'Dear Thanh，您好！报价单 QT-2025-VN-006 已附上。方管 40×40×2.0：$590/MT FOB 上海；方管 50×50×2.5：$575/MT FOB；圆管 48.3mm×2.5mm：$600/MT FOB。总计约 300MT，金额 $177,500。LC 结算完全可以接受，Vietinbank 我们有合作记录，流程非常顺畅。交期：开证后 30 天装船。请确认数量和规格，我们可以随时签 PI。',
 '{"attachments":["QT-2025-VN-006.pdf","steel_pipe_specs.pdf"]}', '99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817', NOW() - INTERVAL '35 days'),

('a1000006-0000-0000-0000-000000000006', 'whatsapp', 'outbound',
 'Thanh 您好！我是赵雪。请问报价单您看了吗？有任何问题可以直接告诉我。另外我们目前上海港舱位比较紧，这批货如果能在本月内定下来，我可以为您优先安排船期，下个月最快的船。',
 '{}', '99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817', NOW() - INTERVAL '20 days'),

('a1000006-0000-0000-0000-000000000006', 'email', 'inbound',
 'Zhao Xue，您好！报价我看了，价格稍高。我们在比较另一家供应商，他们方管报 $565/MT。能否在 $570/MT 左右？另外数量我们想调整：方管40×40各增加到120MT，圆管减少到80MT，总量不变。请更新报价单。',
 '{}', '99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817', NOW() - INTERVAL '6 days'),

-- ── Ahmed Hassan (procuring) ──────────────────────────────────
('a1000007-0000-0000-0000-000000000007', 'email', 'inbound',
 '您好，我们是沙特利雅得大型建筑材料贸易公司，由 Khalid Al-Mutairi（我们的共同朋友）推荐联系贵司。我们目前正在承接沙特Vision 2030 基础设施项目的钢材供应，需要工字钢 HW 300×300、钢管桩 Φ600×12mm 和钢板桩 Larssen 600，数量较大，请联系我们洽谈。',
 '{}', '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW() - INTERVAL '58 days'),

('a1000007-0000-0000-0000-000000000007', 'meeting', 'outbound',
 'Zoom 视频会议（1.5小时）。陈建国和张伟共同参与，Ahmed 带了工程技术助理 Faisal。详细核对产品规格和沙特 SASO 认证要求。Ahmed 确认需求：HW 300×300 工字钢 800MT + 钢管桩 Φ600 600MT + 钢板桩 400MT，总计1800MT，金额约 $1.2M。付款方式：30% 预付 + 70% 见提单，可接受。',
 '{"platform":"Zoom","attendees":["Ahmed Hassan","Faisal Al-Rashidi","张伟","陈建国"]}', '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW() - INTERVAL '45 days'),

('a1000007-0000-0000-0000-000000000007', 'email', 'outbound',
 'Dear Ahmed，根据视频会议讨论，附上正式合同草稿（SC-2025-SA-007）供审阅。合同金额 USD 1,178,000，FOB 上海，交货期 50 天。已附上 SASO 认证文件清单和第三方检测方案（SGS上海）。请您法律团队审核后签字回传。',
 '{"attachments":["SC-2025-SA-007_draft.pdf","SASO_product_list.pdf","SGS_inspection_plan.pdf"]}', '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW() - INTERVAL '40 days'),

('a1000007-0000-0000-0000-000000000007', 'email', 'inbound',
 'Zhang Wei，合同已签署，扫描件附上。30% 预付款 USD 353,400 今日已由 Al Rajhi Bank 电汇，请查收到账通知后安排向钢厂下单。请提供详细的生产排期，我们的项目工期需要货物在 50 天内到港。',
 '{"attachments":["SC-2025-SA-007_signed.pdf"]}', '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW() - INTERVAL '28 days'),

('a1000007-0000-0000-0000-000000000007', 'note', 'outbound',
 '【采购跟进】预付款已到账（$353,400）。已向宝武钢铁下单（采购单号 PO-2025-NW-0089）。工字钢排产已确认，预计2月25日出厂；钢管桩和钢板桩由另一钢厂生产，预计3月1日完成。SGS 出厂前质检已预约（3月3日）。预计3月5日完成备货，届时安排订舱。',
 '{"po_no":"PO-2025-NW-0089","mill":"宝武钢铁"}', '0cdc14c7-95ea-426b-91b2-98f29ed95583', NOW() - INTERVAL '1 day'),

-- ── David Mensah (booking) ────────────────────────────────────
('a1000008-0000-0000-0000-000000000008', 'email', 'inbound',
 'Dear Sir，我们是加纳阿克拉的建材进口商，通过邮件开发看到贵公司资料。目前需要角钢 L75×75×8 和 L100×100×10 各约 200MT，另需螺纹钢 HRB400 Φ16 约 220MT。请提供 CIF 特马港报价（Tema Port, Ghana）。',
 '{}', '20220f01-91e2-4339-9a8d-2d2761beb3bf', NOW() - INTERVAL '53 days'),

('a1000008-0000-0000-0000-000000000008', 'email', 'outbound',
 'Dear David，您好！CIF 特马港报价：角钢 L75：$595/MT；角钢 L100：$590/MT；螺纹钢 HRB400 Φ16：$510/MT。总计约 620MT，合同金额约 $362,000 CIF Tema。交期：45 天装船，海运约 25 天。可附送 SGS 检测报告和原产地证书（Form A/FORM E）。',
 '{"attachments":["QT-2025-GH-008.pdf"]}', '20220f01-91e2-4339-9a8d-2d2761beb3bf', NOW() - INTERVAL '50 days'),

('a1000008-0000-0000-0000-000000000008', 'call', 'outbound',
 '电话跟进 20 分钟。David 对报价满意，同意 30%+70% T/T 付款。已发送合同 SC-2025-GH-008 正式版，David 表示这周签回。主要再次确认了特马港卸货要求和清关所需文件（商业发票、装箱单、原产地证书、SGS 报告）。',
 '{}', '20220f01-91e2-4339-9a8d-2d2761beb3bf', NOW() - INTERVAL '38 days'),

('a1000008-0000-0000-0000-000000000008', 'email', 'inbound',
 'Li Na，合同已签署，预付款 $108,600（30%）已电汇，请安排生产。货物质检完成后请第一时间通知，我们需要提前联系清关代理。',
 '{"attachments":["SC-2025-GH-008_signed.pdf"]}', '20220f01-91e2-4339-9a8d-2d2761beb3bf', NOW() - INTERVAL '32 days'),

('a1000008-0000-0000-0000-000000000008', 'note', 'outbound',
 '【订舱跟进】货物已于2025-02-10出厂质检合格。已联系货代中远海运（COSCO），申请广州南沙港出发，船期2025-03-05，预计ETA特马港2025-03-28。舱位已确认（20''×2 + 40''×1）。目前正在准备报关单证：装箱单已做完，商业发票和原产地证书在办理中，提单草稿待客户确认。',
 '{"freight_forwarder":"中远海运COSCO","vessel":"COSCO FORTUNE","etd":"2025-03-05","eta":"2025-03-28"}', '20220f01-91e2-4339-9a8d-2d2761beb3bf', NOW() - INTERVAL '12 hours'),

-- ── Carlos Reyes (fulfillment) ────────────────────────────────
('a1000009-0000-0000-0000-000000000009', 'email', 'inbound',
 'Buenos días，我们是蒙特雷工业区无缝钢管经销商，主要供应墨西哥油气和建筑市场。需要 API 5CT 石油套管 Φ139.7×7.72mm（N80级别）约 400MT，以及普通无缝钢管 ASTM A106 Grade B Φ60.3-Φ219.1mm 约 500MT。请提供 FOB 上海价格。',
 '{}', 'ca9565e8-771a-4240-93d8-5f3f684a4809', NOW() - INTERVAL '78 days'),

('a1000009-0000-0000-0000-000000000009', 'email', 'outbound',
 'Dear Carlos，您好！API 5CT N80 石油套管 Φ139.7：$950/MT FOB 上海（含API授权工厂证明）；ASTM A106 Gr.B 无缝钢管：$880-920/MT FOB（按规格）。我方为 API 授权生产企业，证书编号已附。付款：30% T/T + 70% LC at sight。交期 40 天。',
 '{"attachments":["API_5CT_cert.pdf","QT-2025-MX-009.pdf","ASTM_A106_specs.pdf"]}', 'ca9565e8-771a-4240-93d8-5f3f684a4809', NOW() - INTERVAL '72 days'),

('a1000009-0000-0000-0000-000000000009', 'email', 'inbound',
 'Wang Fang，合同我们批准了。附上签署版 SC-2025-MX-009，30% 预付款 $251,250 明天电汇。请确认产品所有尺寸需要通过 API Monogram 打标，并在装运前安排 ABS 或 DNV 第三方检验。',
 '{"attachments":["SC-2025-MX-009_signed.pdf"]}', 'ca9565e8-771a-4240-93d8-5f3f684a4809', NOW() - INTERVAL '60 days'),

('a1000009-0000-0000-0000-000000000009', 'note', 'outbound',
 '【发货跟进】货物于2025-02-08在上海港完成装柜（40''HC×3），2025-02-10船舶离港（COSCO SHIPPING GEMINI），提单号 COSCO25MX09876，目的港：曼萨尼约（Manzanillo, Mexico）。ETA 2025-03-18。提单正本3套已签发，正在快递寄送给客户银行，同时发送了扫描件供客户提前确认。剩余款项 $587,500（70%）在提单寄达后5日内付款。',
 '{"bl_no":"COSCO25MX09876","vessel":"COSCO SHIPPING GEMINI","etd":"2025-02-10","eta":"2025-03-18","port_destination":"Manzanillo, Mexico"}', 'ca9565e8-771a-4240-93d8-5f3f684a4809', NOW() - INTERVAL '2 days'),

-- ── Sophie Lambert (fulfillment) ─────────────────────────────
('a1000010-0000-0000-0000-000000000010', 'email', 'inbound',
 'Bonjour，我在德国慕尼黑 EuroBLECH 展上见到了贵公司的代表。我们是法国里昂的冷轧钢材加工中心，需要 DC01/SPCC 冷轧卷 0.8mm 和 1.0mm 各约 400MT，另需 DX51D 热镀锌卷 Z275 1.2mm 约 400MT。请提供 CFR 鹿特丹的报价（Rotterdam），附带 EN 10130 和 EN 10346 认证证书。',
 '{}', 'eef55911-d74c-4828-95b3-041dee65407a', NOW() - INTERVAL '93 days'),

('a1000010-0000-0000-0000-000000000010', 'meeting', 'outbound',
 'Teams 视频会议（1小时）。陈建国与 Sophie 及其技术采购 Pierre Marchand 详谈。Sophie 对宝钢和马钢供货均可接受，但需要每卷附 3.1 材质证书（EN 10204 3.1）。价格谈判：冷轧卷 $720/MT CFR Rotterdam，镀锌卷 $810/MT CFR。约定发送合同草稿。',
 '{"platform":"Teams","attendees":["Sophie Lambert","Pierre Marchand","陈建国"]}', 'eef55911-d74c-4828-95b3-041dee65407a', NOW() - INTERVAL '85 days'),

('a1000010-0000-0000-0000-000000000010', 'email', 'inbound',
 'Chen Jianguo，合同 SC-2025-FR-010 已签署，LC 今日由 Crédit Agricole 开立，金额 USD 921,600。请安排生产，所有产品需要 EN 10204 3.1 材质证明，并联系 Bureau Veritas 做装运前检验（PSI）。',
 '{"attachments":["SC-2025-FR-010_signed.pdf","LC_draft_credit_agricole.pdf"]}', 'eef55911-d74c-4828-95b3-041dee65407a', NOW() - INTERVAL '70 days'),

('a1000010-0000-0000-0000-000000000010', 'note', 'outbound',
 '【发货跟进】货物于2025-01-30宁波港装柜完成（40''HC×4），2025-02-01 MSC DIANA 离港，提单号 MSC25FR11223，目的港鹿特丹（ROT），ETA 2025-03-10。BV 装运前检验报告已随单据寄出。提单正本+商业发票+装箱单+EN10204 3.1证书+产地证全套单据已于2025-02-03通过 DHL 快递（单号DHL123456789），追踪显示已于2025-02-07到达 Crédit Agricole 巴黎总部。等待银行议付，LC 结汇预计2025-02-20完成。',
 '{"bl_no":"MSC25FR11223","vessel":"MSC DIANA","etd":"2025-02-01","eta":"2025-03-10","port_destination":"Rotterdam","docs_courier":"DHL123456789"}', 'eef55911-d74c-4828-95b3-041dee65407a', NOW() - INTERVAL '1 day'),

-- ── Park Ji-ho (converted) ────────────────────────────────────
('a1000011-0000-0000-0000-000000000011', 'note', 'outbound',
 '【客户背景】Park Ji-ho 是通过Busan钢铁圈子朋友介绍的优质客户，韩国主要造船钢板贸易商。合作历程：①2024-09 首单：中厚板 Q345 100MT，$85,000，T/T全款到账 ②2024-11 第二单：船板 AH36 500MT，$230,000，LC顺利结汇 ③2025-01 第三单：海工钢板 EH40 300MT，$170,000，T/T款已全额到账。三笔合计 $485,000，零纠纷，是S级战略客户。',
 '{}', '13b33cdb-49d8-401c-bd22-b20b6c8d513a', NOW() - INTERVAL '140 days'),

('a1000011-0000-0000-0000-000000000011', 'call', 'outbound',
 '月度维护通话（30分钟）。Park Ji-ho 反馈第三单海工钢板已全部验收，质量优秀，韩国现代重工和三星重工的采购部都非常满意。正式提出希望签订2025年度框架协议，计划采购中厚板、船板、海工钢合计约 4,000MT/年，要求价格锁定季度浮动机制，付款方式 LC at sight。约好下周来华拜访讨论框架协议。',
 '{}', '13b33cdb-49d8-401c-bd22-b20b6c8d513a', NOW() - INTERVAL '5 days'),

('a1000011-0000-0000-0000-000000000011', 'email', 'inbound',
 'Liu Yang，第三笔款 $170,000 已于昨日电汇（转账参考号：KB20250215-NW），请确认到账。另外我已安排2025-02-25来华，届时希望拜访工厂和探讨年框合作。能否安排参观宝武钢铁的生产线？',
 '{}', '13b33cdb-49d8-401c-bd22-b20b6c8d513a', NOW() - INTERVAL '1 day'),

-- ── Arjun Malhotra (converted) ────────────────────────────────
('a1000012-0000-0000-0000-000000000012', 'note', 'outbound',
 '【客户背景】Arjun 在阿里巴巴询价热轧卷，经过2轮样品确认后下首单。合作历程：①2024-10 首单：热轧卷 Q235B 3.0mm×1250mm，180MT，$87,300，T/T 30%+70%见提单，全款收清 ②2025-01 第二单：钢坯 Q235B 130mm×130mm，320MT，$224,000，尾款上周已到账。两笔合计 $311,300。Arjun 对价格敏感但守约，是可以稳定发展的客户。',
 '{}', '99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817', NOW() - INTERVAL '110 days'),

('a1000012-0000-0000-0000-000000000012', 'whatsapp', 'inbound',
 'Zhao Xue，第二单尾款已电汇（$156,800），请查收。货物质量很好，我们孟买港清关也顺利。我想下个月再下一单热轧卷，这次量会大一些，大概 400MT。另外我们在考虑拓展钢坯业务到班加罗尔，你们有没有 Q275 的钢坯？',
 '{}', '99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817', NOW() - INTERVAL '3 days'),

('a1000012-0000-0000-0000-000000000012', 'call', 'outbound',
 '与 Arjun 通话 25 分钟。确认款项已到账（第二笔尾款 $156,800 已入账）。讨论第三单：热轧卷 400MT，目前市场价约 $480/MT CIF 孟买，比首单低 $5。Q275 钢坯有库存，可以为他安排样品先确认规格。另外谈到是否可以引入季度框架合同以锁定价格，Arjun 表示很感兴趣，请赵雪准备一份框架合同方案。',
 '{}', '99f1d6c6-57b3-42c5-bb2a-2e7ddaa93817', NOW() - INTERVAL '3 days');


-- ══════════════════════════════════════════════════════════════
-- Verify results
-- ══════════════════════════════════════════════════════════════
SELECT
    status,
    COUNT(*) AS count,
    string_agg(full_name, ', ' ORDER BY full_name) AS names
FROM leads
WHERE email LIKE '%@demo-crm.nexus'
GROUP BY status
ORDER BY
    CASE status
        WHEN 'inquiry'     THEN 1
        WHEN 'replied'     THEN 2
        WHEN 'quoted'      THEN 3
        WHEN 'procuring'   THEN 4
        WHEN 'booking'     THEN 5
        WHEN 'fulfillment' THEN 6
        WHEN 'converted'   THEN 7
        ELSE 99
    END;
