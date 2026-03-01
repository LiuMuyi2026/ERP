-- seed_new_leads.sql
-- 20 new leads for tenant_test with comprehensive custom_fields
-- Run: psql -d nexus_platform -U nexus -f backend/scripts/seed_new_leads.sql

SET search_path = tenant_test;

-- 1. inquiry — Turkey, steel trading
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Mehmet Yılmaz', 'mehmet.yilmaz@celikstar.com.tr', '+90-532-441-8823', '+905324418823',
    'ÇelikStar Ticaret A.Ş.', 'Purchasing Director',
    'inquiry', 'LinkedIn', 'pending',
    '{
        "country": "Turkey", "city": "Istanbul", "region_province": "Marmara",
        "industry": "Steel Trading", "company_website": "https://celikstar.com.tr",
        "main_products": "热轧卷板, 冷轧板", "about_company": "土耳其领先的钢材贸易商，年交易量超过15万吨",
        "company_size": "50-100", "position": "采购总监",
        "customer_type": "Trader", "customer_quality": "优质", "customer_grade": "A", "lead_grade": "A",
        "source_channel": "LinkedIn",
        "product_category": "热轧卷板", "required_products": "HRC SS400, Q235B",
        "end_usage": "二次加工与分销",
        "budget": "$2,000,000/季度", "annual_purchase": "80,000吨", "purchase_cycle": "月度",
        "decision_maker": "是",
        "downstream_payment": "LC 60天", "competitor": "宝钢, 河钢",
        "attack_notes": "对中国钢材价格敏感，需提供有竞争力的FOB报价",
        "requirements_notes": "要求SGS检验报告，偏好天津港发货",
        "contact_notes": "每周一上午10点土耳其时间可联系",
        "contact_address": "Maslak Mah. AOS 55. Sok. No:2, Sarıyer, Istanbul",
        "gender": "male",
        "religion": "伊斯兰教", "instagram": "@mehmet.celikstar", "social_platform": "LinkedIn",
        "ceo_name": "Ali Yılmaz", "ceo_hobbies": "高尔夫, 帆船",
        "ceo_beliefs": "伊斯兰教", "ceo_personality": "果断型",
        "ceo_political_views": "亲商",
        "monthly_usage": "6,500吨", "quarterly_usage": "20,000吨",
        "industry_product_quality": "优质"
    }'::jsonb,
    '土耳其伊斯坦布尔钢材贸易商，年采购量8万吨，主要需求热轧卷板HRC SS400/Q235B。采购总监Mehmet为关键决策人，偏好月度采购、LC 60天付款。竞争对手为宝钢和河钢，需提供有竞争力FOB报价。客户质量优质，等级A。',
    false, NULL, NULL, NOW() - INTERVAL '12 days', NOW() - INTERVAL '12 days'
);

-- 2. replied — Vietnam, construction
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Nguyễn Thị Lan', 'lan.nguyen@vinaconst.vn', '+84-28-3822-5567', '+84903225567',
    'Vina Construction Materials JSC', 'Import Manager',
    'replied', 'Exhibition', 'pending',
    '{
        "country": "Vietnam", "city": "Ho Chi Minh City", "region_province": "南部",
        "industry": "Construction", "company_website": "https://vinaconst.vn",
        "main_products": "建筑钢材, 型钢, 钢管", "about_company": "越南大型建筑材料进口商，服务于基础设施项目",
        "company_size": "100-200", "position": "进口经理",
        "customer_type": "End User", "customer_quality": "优质", "customer_grade": "A", "lead_grade": "B",
        "source_channel": "Exhibition",
        "product_category": "型钢", "required_products": "H型钢 HW200x200, 角钢 L75x75",
        "end_usage": "桥梁与高速公路基础设施建设",
        "budget": "$800,000/半年", "annual_purchase": "25,000吨", "purchase_cycle": "季度",
        "decision_maker": "否，需上报总经理",
        "downstream_payment": "TT 30%预付 + 70%见提单", "competitor": "日本JFE, 韩国现代制铁",
        "attack_notes": "越南基建热潮，政府项目多，需提供质量认证与长期供货协议",
        "requirements_notes": "需要TCVN认证，偏好海防港交货",
        "contact_notes": "工作日上午联系，英语沟通为主",
        "contact_address": "227 Nguyen Van Cu, District 5, HCMC",
        "gender": "female",
        "religion": "佛教", "instagram": "", "social_platform": "Zalo",
        "ceo_name": "Trần Văn Hùng", "ceo_hobbies": "钓鱼, 越南象棋",
        "ceo_beliefs": "佛教", "ceo_personality": "温和型",
        "ceo_political_views": "亲商",
        "monthly_usage": "2,000吨", "quarterly_usage": "6,500吨",
        "industry_product_quality": "中上"
    }'::jsonb,
    '越南胡志明市建筑材料进口商，年采购25,000吨型钢，用于桥梁和高速公路基建项目。进口经理Lan女士为对接人，非最终决策者。季度采购周期，TT预付模式。需提供TCVN认证，竞争对手为日本JFE和韩国现代制铁。',
    false, NULL, NULL, NOW() - INTERVAL '10 days', NOW() - INTERVAL '8 days'
);

-- 3. qualified — India, automotive
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Rajesh Kumar Sharma', 'rajesh.sharma@bharatsteel.in', '+91-22-4055-7890', '+919820557890',
    'Bharat Steel Industries Pvt Ltd', 'General Manager - Procurement',
    'qualified', 'Referral', 'done',
    '{
        "country": "India", "city": "Mumbai", "region_province": "Maharashtra",
        "industry": "Automotive", "company_website": "https://bharatsteel.in",
        "main_products": "汽车用冷轧板, 镀锌板", "about_company": "印度汽车零部件用钢材加工企业，服务塔塔、马恒达等OEM",
        "company_size": "200-500", "position": "采购总经理",
        "customer_type": "End User", "customer_quality": "优质", "customer_grade": "S", "lead_grade": "A",
        "source_channel": "Referral",
        "product_category": "冷轧板", "required_products": "CR SPCC, GA 镀锌板 0.6-1.2mm",
        "end_usage": "汽车车身面板与结构件",
        "budget": "$5,000,000/年", "annual_purchase": "40,000吨", "purchase_cycle": "月度",
        "decision_maker": "是",
        "downstream_payment": "LC 90天", "competitor": "POSCO India, Nippon Steel",
        "attack_notes": "印度汽车市场增长迅速，客户对品质要求高，需通过汽车级认证",
        "requirements_notes": "需要IATF 16949认证，表面质量FC级",
        "contact_notes": "Rajesh是老客户推荐，英语流利，可直接微信沟通",
        "contact_address": "Plot 45, MIDC Bhosari, Pune, Maharashtra 411026",
        "gender": "male",
        "religion": "印度教", "instagram": "", "social_platform": "WhatsApp",
        "ceo_name": "Vikram Sharma", "ceo_hobbies": "板球, 瑜伽",
        "ceo_beliefs": "印度教", "ceo_personality": "分析型",
        "ceo_political_views": "保守",
        "monthly_usage": "3,300吨", "quarterly_usage": "10,000吨",
        "industry_product_quality": "优质"
    }'::jsonb,
    '印度孟买汽车用钢材加工企业，服务塔塔和马恒达等OEM。年采购量4万吨冷轧板和镀锌板，月度采购，LC 90天。采购总经理Rajesh为决策人，由老客户推荐。S级客户，需提供IATF 16949认证和FC级表面质量。竞争对手为POSCO India和新日铁。',
    false, NULL, NULL, NOW() - INTERVAL '20 days', NOW() - INTERVAL '5 days'
);

-- 4. quoted — Brazil, furniture
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Ana Carolina Ferreira', 'ana.ferreira@acoflex.com.br', '+55-11-3045-8821', '+5511930458821',
    'AçoFlex Indústria Ltda', 'Diretora Comercial',
    'quoted', 'Website', 'pending',
    '{
        "country": "Brazil", "city": "São Paulo", "region_province": "São Paulo",
        "industry": "Furniture", "company_website": "https://acoflex.com.br",
        "main_products": "家具用钢管, 薄板", "about_company": "巴西知名钢制家具制造商，产品出口南美多国",
        "company_size": "100-200", "position": "商务总监",
        "customer_type": "Manufacturer", "customer_quality": "中等", "customer_grade": "B", "lead_grade": "B",
        "source_channel": "Website",
        "product_category": "钢管", "required_products": "方管 25x25-50x50, 圆管 Ø20-Ø50, 厚度0.8-1.5mm",
        "end_usage": "办公家具与学校课桌椅",
        "budget": "$600,000/年", "annual_purchase": "8,000吨", "purchase_cycle": "季度",
        "decision_maker": "是",
        "downstream_payment": "TT 100%预付", "competitor": "ArcelorMittal Brazil, Gerdau",
        "attack_notes": "巴西进口关税高，需核算CIF Santos价格含税后的竞争力",
        "requirements_notes": "需要INMETRO认证，包装要求防潮",
        "contact_notes": "葡萄牙语沟通，需翻译协助，周二周四下午可约电话",
        "contact_address": "Rua Industrial 450, Guarulhos, SP 07220-000",
        "gender": "female",
        "religion": "基督教", "instagram": "@anacferreira_aco", "social_platform": "WhatsApp",
        "ceo_name": "Roberto Ferreira", "ceo_hobbies": "足球, 烧烤",
        "ceo_beliefs": "基督教", "ceo_personality": "外向型",
        "ceo_political_views": "开放",
        "monthly_usage": "700吨", "quarterly_usage": "2,000吨",
        "industry_product_quality": "中等"
    }'::jsonb,
    '巴西圣保罗钢制家具制造商，年采购8,000吨钢管，主要生产办公家具和学校课桌椅。商务总监Ana女士为决策人，季度采购周期，TT预付。需关注巴西进口关税对价格竞争力的影响，需要INMETRO认证。B级客户。',
    false, NULL, NULL, NOW() - INTERVAL '15 days', NOW() - INTERVAL '3 days'
);

-- 5. negotiating — Mexico, machinery
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Carlos Mendoza Ríos', 'c.mendoza@grupoforja.mx', '+52-81-8340-2200', '+528183402200',
    'Grupo Forja Industrial S.A. de C.V.', 'Director de Compras',
    'negotiating', 'Exhibition', 'done',
    '{
        "country": "Mexico", "city": "Monterrey", "region_province": "Nuevo León",
        "industry": "Machinery", "company_website": "https://grupoforja.mx",
        "main_products": "机械用中厚板, 圆钢", "about_company": "墨西哥工业机械制造集团，专注矿山和农业设备",
        "company_size": "500-1000", "position": "采购总监",
        "customer_type": "Manufacturer", "customer_quality": "优质", "customer_grade": "A", "lead_grade": "A",
        "source_channel": "Exhibition",
        "product_category": "中厚板", "required_products": "中厚板 Q345B 10-50mm, 圆钢 Ø50-Ø200",
        "end_usage": "矿山设备与农业机械制造",
        "budget": "$3,500,000/年", "annual_purchase": "20,000吨", "purchase_cycle": "双月",
        "decision_maker": "是",
        "downstream_payment": "LC 60天", "competitor": "Nucor, SSAB",
        "attack_notes": "USMCA协定下关税优势，需关注原产地证明要求",
        "requirements_notes": "需要ASTM A572 Gr.50标准，第三方检测报告",
        "contact_notes": "在Canton Fair上认识，西语为主，可用英语",
        "contact_address": "Av. Industriales 1200, Parque Industrial, Monterrey NL 64000",
        "gender": "male",
        "religion": "基督教", "instagram": "", "social_platform": "LinkedIn",
        "ceo_name": "Fernando Mendoza", "ceo_hobbies": "赛车, 高尔夫",
        "ceo_beliefs": "基督教", "ceo_personality": "果断型",
        "ceo_political_views": "亲商",
        "monthly_usage": "1,700吨", "quarterly_usage": "5,000吨",
        "industry_product_quality": "中上"
    }'::jsonb,
    '墨西哥蒙特雷工业机械制造集团，专注矿山和农业设备。年采购2万吨中厚板和圆钢，双月采购周期，LC 60天。采购总监Carlos为决策人，Canton Fair上认识。A级客户，需提供ASTM A572标准产品。竞争对手Nucor和SSAB。',
    false, NULL, NULL, NOW() - INTERVAL '25 days', NOW() - INTERVAL '2 days'
);

-- 6. procuring — Indonesia, roofing
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Budi Santoso', 'budi@jayasteelindo.co.id', '+62-21-5555-7788', '+6281287557788',
    'PT Jaya Steel Indonesia', 'Procurement Head',
    'procuring', 'WhatsApp', 'done',
    '{
        "country": "Indonesia", "city": "Jakarta", "region_province": "DKI Jakarta",
        "industry": "Roofing", "company_website": "https://jayasteelindo.co.id",
        "main_products": "彩涂板, 镀铝锌板", "about_company": "印尼最大的彩钢瓦生产商之一，年产能12万吨",
        "company_size": "200-500", "position": "采购负责人",
        "customer_type": "Manufacturer", "customer_quality": "优质", "customer_grade": "A", "lead_grade": "S",
        "source_channel": "WhatsApp",
        "product_category": "彩涂板", "required_products": "PPGI 0.3-0.5mm RAL色卡, 镀铝锌板 AZ150",
        "end_usage": "彩钢瓦屋顶系统",
        "budget": "$4,000,000/年", "annual_purchase": "50,000吨", "purchase_cycle": "月度",
        "decision_maker": "是",
        "downstream_payment": "LC 30天", "competitor": "BlueScope, 东方雨虹",
        "attack_notes": "印尼建筑市场蓬勃发展，客户采购量大且稳定，优先维护",
        "requirements_notes": "SNI认证必须，色差ΔE<1.5，盐雾测试1000小时",
        "contact_notes": "华裔，普通话流利，微信和WhatsApp均可",
        "contact_address": "Jl. Raya Bekasi KM 28, Pondok Ungu, Bekasi 17132",
        "gender": "male",
        "religion": "佛教", "instagram": "@budisantoso_steel", "social_platform": "WhatsApp",
        "ceo_name": "Budi Santoso", "ceo_hobbies": "高尔夫, 旅行",
        "ceo_beliefs": "佛教", "ceo_personality": "温和型",
        "ceo_political_views": "开放",
        "monthly_usage": "4,200吨", "quarterly_usage": "12,500吨",
        "industry_product_quality": "优质"
    }'::jsonb,
    '印尼雅加达最大彩钢瓦生产商之一，年产能12万吨。年采购5万吨彩涂板和镀铝锌板，月度稳定采购，LC 30天。采购负责人Budi为华裔，普通话流利，同时也是CEO。S级大客户，需SNI认证，色差和盐雾测试要求严格。',
    false, NULL, NULL, NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 day'
);

-- 7. booking — Thailand, piping
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Siriporn Chaiwat', 'siriporn@thaipipe.co.th', '+66-2-712-3456', '+66812345678',
    'Thai Pipe Manufacturing Co., Ltd.', 'Deputy Managing Director',
    'booking', 'LinkedIn', 'done',
    '{
        "country": "Thailand", "city": "Bangkok", "region_province": "Central Thailand",
        "industry": "Piping", "company_website": "https://thaipipe.co.th",
        "main_products": "焊管, 无缝管原材料带钢", "about_company": "泰国知名焊管制造商，产品用于石油化工和建筑",
        "company_size": "100-200", "position": "副总经理",
        "customer_type": "Manufacturer", "customer_quality": "中上", "customer_grade": "B", "lead_grade": "A",
        "source_channel": "LinkedIn",
        "product_category": "带钢", "required_products": "热轧带钢 Q235B 1.5-6mm, 宽度200-600mm",
        "end_usage": "ERW焊管生产",
        "budget": "$1,500,000/年", "annual_purchase": "18,000吨", "purchase_cycle": "季度",
        "decision_maker": "否，需CEO批准",
        "downstream_payment": "TT 30%预付 + 70% LC at sight", "competitor": "Formosa Ha Tinh, Hòa Phát",
        "attack_notes": "泰国焊管市场稳定，客户对交期要求严格，45天内必须到港",
        "requirements_notes": "TIS标准，带钢边部毛刺≤0.05mm",
        "contact_notes": "Siriporn女士，英语良好，Line App沟通更方便",
        "contact_address": "99 Moo 5, Bangna-Trad Rd KM 23, Samutprakarn 10540",
        "gender": "female",
        "religion": "佛教", "instagram": "", "social_platform": "Line",
        "ceo_name": "Chaiwat Poonperm", "ceo_hobbies": "高尔夫, 烹饪",
        "ceo_beliefs": "佛教", "ceo_personality": "温和型",
        "ceo_political_views": "保守",
        "monthly_usage": "1,500吨", "quarterly_usage": "4,500吨",
        "industry_product_quality": "中上"
    }'::jsonb,
    '泰国曼谷焊管制造商，年采购18,000吨热轧带钢用于ERW焊管生产。副总经理Siriporn女士为主要对接人，非最终决策者。季度采购，混合付款方式。对交期要求严格，45天内必须到港。竞争对手为台塑河静和和发集团。',
    false, NULL, NULL, NOW() - INTERVAL '35 days', NOW() - INTERVAL '1 day'
);

-- 8. fulfillment — Nigeria, construction
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Chukwuemeka Okonkwo', 'emeka@lagosironworks.ng', '+234-1-280-5500', '+2348031234567',
    'Lagos Iron Works Ltd', 'Managing Director',
    'fulfillment', 'Referral', 'done',
    '{
        "country": "Nigeria", "city": "Lagos", "region_province": "Lagos State",
        "industry": "Construction", "company_website": "https://lagosironworks.ng",
        "main_products": "螺纹钢, 线材", "about_company": "尼日利亚西非地区钢铁分销龙头，覆盖尼日利亚及周边5国",
        "company_size": "50-100", "position": "总经理",
        "customer_type": "Distributor", "customer_quality": "中等", "customer_grade": "B", "lead_grade": "B",
        "source_channel": "Referral",
        "product_category": "螺纹钢", "required_products": "螺纹钢 Ø12-Ø25mm, 线材 Ø5.5-Ø8mm",
        "end_usage": "建筑工程与基础设施",
        "budget": "$2,000,000/年", "annual_purchase": "30,000吨", "purchase_cycle": "季度",
        "decision_maker": "是",
        "downstream_payment": "LC at sight (需确认开证行)", "competitor": "Dangote Steel, 土耳其钢厂",
        "attack_notes": "非洲市场价格敏感度极高，物流成本是关键因素，Apapa港拥堵严重需考虑Lekki港",
        "requirements_notes": "NIS标准，需要Form M进口许可",
        "contact_notes": "Emeka是业内资深人士，英语沟通，WhatsApp响应快",
        "contact_address": "Plot 12, Amuwo Odofin Industrial Estate, Lagos",
        "gender": "male",
        "religion": "基督教", "instagram": "", "social_platform": "WhatsApp",
        "ceo_name": "Chukwuemeka Okonkwo", "ceo_hobbies": "足球, 慈善活动",
        "ceo_beliefs": "基督教", "ceo_personality": "外向型",
        "ceo_political_views": "亲商",
        "monthly_usage": "2,500吨", "quarterly_usage": "7,500吨",
        "industry_product_quality": "中等"
    }'::jsonb,
    '尼日利亚拉各斯钢铁分销龙头，覆盖西非5国市场。年采购3万吨螺纹钢和线材，季度采购，LC即期付款。总经理Emeka为决策人，对价格和物流成本极其敏感。建议走Lekki港避开Apapa拥堵。竞争对手为Dangote和土耳其钢厂。',
    false, NULL, NULL, NOW() - INTERVAL '40 days', NOW() - INTERVAL '3 days'
);

-- 9. payment — Egypt, home appliances
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Fatma Hassan El-Sayed', 'fatma.hassan@nileappliances.eg', '+20-2-2760-4433', '+201001234567',
    'Nile Home Appliances S.A.E.', 'Supply Chain Manager',
    'payment', 'Exhibition', 'done',
    '{
        "country": "Egypt", "city": "Cairo", "region_province": "Greater Cairo",
        "industry": "Home Appliances", "company_website": "https://nileappliances.eg",
        "main_products": "家电用冷轧板, 镀锌板, 彩涂板", "about_company": "埃及领先的家电制造商，生产冰箱、洗衣机和空调外壳",
        "company_size": "500-1000", "position": "供应链经理",
        "customer_type": "Manufacturer", "customer_quality": "中上", "customer_grade": "A", "lead_grade": "A",
        "source_channel": "Exhibition",
        "product_category": "冷轧板", "required_products": "CR SPCC-SD 0.4-1.0mm, GI 镀锌板 Z120",
        "end_usage": "冰箱和洗衣机外壳",
        "budget": "$2,800,000/年", "annual_purchase": "22,000吨", "purchase_cycle": "双月",
        "decision_maker": "否，需VP批准大额订单",
        "downstream_payment": "LC 90天 (CIB bank)", "competitor": "印度JSW, 乌克兰Metinvest",
        "attack_notes": "埃及外汇管制严格，LC开证周期长，需预留足够时间",
        "requirements_notes": "需要Egyptian Standards认证，表面质量要求高无划痕",
        "contact_notes": "Fatma女士在中东钢铁展上认识，阿拉伯语和英语均可",
        "contact_address": "10th of Ramadan City, Industrial Zone A3, Egypt",
        "gender": "female",
        "religion": "伊斯兰教", "instagram": "@fatma.nileappl", "social_platform": "WhatsApp",
        "ceo_name": "Ahmed El-Sayed", "ceo_hobbies": "阅读, 旅行",
        "ceo_beliefs": "伊斯兰教", "ceo_personality": "分析型",
        "ceo_political_views": "保守",
        "monthly_usage": "1,800吨", "quarterly_usage": "5,500吨",
        "industry_product_quality": "中上"
    }'::jsonb,
    '埃及开罗家电制造商，生产冰箱和洗衣机外壳。年采购22,000吨冷轧板和镀锌板，双月采购，LC 90天。供应链经理Fatma女士为对接人，大额订单需VP批准。注意埃及外汇管制和LC开证周期较长。A级客户。',
    false, NULL, NULL, NOW() - INTERVAL '45 days', NOW() - INTERVAL '5 days'
);

-- 10. converted — UAE, steel trading
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Mohammed Al-Rashid', 'mohammed@gulfsteeltrading.ae', '+971-4-338-9900', '+971501234567',
    'Gulf Steel Trading LLC', 'CEO',
    'converted', 'Referral', 'done',
    '{
        "country": "UAE", "city": "Dubai", "region_province": "Dubai",
        "industry": "Steel Trading", "company_website": "https://gulfsteeltrading.ae",
        "main_products": "各类板材, 型钢, 管材", "about_company": "迪拜综合钢材贸易商，转口贸易为主，覆盖中东和非洲市场",
        "company_size": "20-50", "position": "CEO",
        "customer_type": "Trader", "customer_quality": "优质", "customer_grade": "S", "lead_grade": "S",
        "source_channel": "Referral",
        "product_category": "综合", "required_products": "HRC, CRC, GI, PPGI, 型钢, 钢管",
        "end_usage": "转口贸易至中东和非洲",
        "budget": "$10,000,000/年", "annual_purchase": "100,000吨", "purchase_cycle": "月度",
        "decision_maker": "是",
        "downstream_payment": "TT即付 / LC at sight", "competitor": "印度钢厂, 土耳其钢厂",
        "attack_notes": "核心大客户，采购品类广且量大，需专人负责跟进并给予最优价格政策",
        "requirements_notes": "JAFZA自贸区交货，需提供所有原产地证明和材质书",
        "contact_notes": "Mohammed是阿联酋本地人，英语和阿拉伯语均可，偏好面谈",
        "contact_address": "Office 1205, JBC 3, JLT, Dubai, UAE",
        "gender": "male",
        "religion": "伊斯兰教", "instagram": "@mal_rashid", "social_platform": "WhatsApp",
        "ceo_name": "Mohammed Al-Rashid", "ceo_hobbies": "赛马, 猎鹰",
        "ceo_beliefs": "伊斯兰教", "ceo_personality": "果断型",
        "ceo_political_views": "亲商",
        "monthly_usage": "8,500吨", "quarterly_usage": "25,000吨",
        "industry_product_quality": "优质"
    }'::jsonb,
    '迪拜综合钢材贸易商，年采购量高达10万吨，品类覆盖板材、型钢、管材。CEO Mohammed为决策人，月度采购，付款方式灵活(TT/LC)。S级核心大客户，转口贸易覆盖中东和非洲市场。需专人跟进并给予最优价格政策。',
    false, NULL, NULL, NOW() - INTERVAL '60 days', NOW() - INTERVAL '1 day'
);

-- 11. inquiry — Colombia, wire drawing
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Diego Alejandro Torres', 'diego.torres@alambrescol.com.co', '+57-1-742-3300', '+573102345678',
    'Alambres de Colombia S.A.S.', 'Gerente de Producción',
    'inquiry', 'Website', 'pending',
    '{
        "country": "Colombia", "city": "Bogotá", "region_province": "Cundinamarca",
        "industry": "Wire Drawing", "company_website": "https://alambrescol.com.co",
        "main_products": "拉丝用线材", "about_company": "哥伦比亚拉丝企业，生产铁丝、钢丝绳和焊丝",
        "company_size": "50-100", "position": "生产经理",
        "customer_type": "Manufacturer", "customer_quality": "中等", "customer_grade": "C", "lead_grade": "C",
        "source_channel": "Website",
        "product_category": "线材", "required_products": "线材 SAE1008 Ø5.5-Ø12mm",
        "end_usage": "铁丝网和焊丝生产",
        "budget": "$400,000/年", "annual_purchase": "5,000吨", "purchase_cycle": "半年",
        "decision_maker": "否，需总经理审批",
        "downstream_payment": "TT 50%预付 + 50%到货后", "competitor": "巴西Gerdau, 土耳其钢厂",
        "attack_notes": "哥伦比亚市场体量较小，客户采购量有限，可作为南美市场切入点",
        "requirements_notes": "NTC标准，线材表面无氧化皮要求",
        "contact_notes": "西班牙语沟通，需翻译协助",
        "contact_address": "Carrera 68D No. 13-51, Zona Industrial, Bogotá",
        "gender": "male",
        "religion": "基督教", "instagram": "", "social_platform": "WhatsApp",
        "ceo_name": "Juan Pablo Torres", "ceo_hobbies": "自行车, 徒步",
        "ceo_beliefs": "基督教", "ceo_personality": "温和型",
        "ceo_political_views": "开放",
        "monthly_usage": "420吨", "quarterly_usage": "1,250吨",
        "industry_product_quality": "中等"
    }'::jsonb,
    '哥伦比亚波哥大拉丝企业，生产铁丝网和焊丝。年采购5,000吨线材SAE1008，半年采购周期。生产经理Diego为对接人，非决策者。C级客户，采购量有限但可作为南美市场切入点。需西班牙语翻译协助沟通。',
    false, NULL, NULL, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'
);

-- 12. replied — Philippines, roofing
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Maria Luz Santos', 'maria.santos@philroofing.ph', '+63-2-8876-5432', '+639171234567',
    'Philippine Roofing Industries Inc.', 'VP Operations',
    'replied', 'LinkedIn', 'pending',
    '{
        "country": "Philippines", "city": "Manila", "region_province": "Metro Manila",
        "industry": "Roofing", "company_website": "https://philroofing.ph",
        "main_products": "镀锌卷板, 彩涂板", "about_company": "菲律宾三大彩钢瓦厂之一，有4条辊压线",
        "company_size": "100-200", "position": "运营副总裁",
        "customer_type": "Manufacturer", "customer_quality": "中上", "customer_grade": "B", "lead_grade": "A",
        "source_channel": "LinkedIn",
        "product_category": "镀锌卷板", "required_products": "GI Z80-Z120 0.25-0.50mm, PPGI 0.30-0.45mm",
        "end_usage": "住宅和商业建筑屋顶",
        "budget": "$1,800,000/年", "annual_purchase": "15,000吨", "purchase_cycle": "季度",
        "decision_maker": "是",
        "downstream_payment": "LC 60天", "competitor": "BlueScope Lysaght, 中国其他供应商",
        "attack_notes": "菲律宾台风频发，客户对镀层厚度和耐腐蚀性要求高",
        "requirements_notes": "PNS标准，需要台风抗风等级测试报告",
        "contact_notes": "Maria英语流利，Viber和WhatsApp均可联系",
        "contact_address": "Lot 5 Block 3, LISP II, Calamba, Laguna 4027",
        "gender": "female",
        "religion": "基督教", "instagram": "@marialuz_santos", "social_platform": "Viber",
        "ceo_name": "Roberto Santos", "ceo_hobbies": "篮球, 潜水",
        "ceo_beliefs": "基督教", "ceo_personality": "外向型",
        "ceo_political_views": "亲商",
        "monthly_usage": "1,250吨", "quarterly_usage": "3,750吨",
        "industry_product_quality": "中上"
    }'::jsonb,
    '菲律宾马尼拉三大彩钢瓦厂之一，拥有4条辊压线。年采购15,000吨镀锌卷板和彩涂板，季度采购，LC 60天。运营副总裁Maria女士为决策人。菲律宾台风频发，对镀层和耐腐蚀性要求高。A级潜力客户。',
    false, NULL, NULL, NOW() - INTERVAL '8 days', NOW() - INTERVAL '6 days'
);

-- 13. qualified — Bangladesh, steel trading
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Rafiqul Islam Khan', 'rafiq@dhakasteel.com.bd', '+880-2-9880-1234', '+8801711234567',
    'Dhaka Steel Corporation', 'Director - Imports',
    'qualified', 'Exhibition', 'done',
    '{
        "country": "Bangladesh", "city": "Dhaka", "region_province": "Dhaka Division",
        "industry": "Steel Trading", "company_website": "https://dhakasteel.com.bd",
        "main_products": "热轧卷板, 螺纹钢, 线材", "about_company": "孟加拉国领先钢材进口商，服务于建筑和船舶拆解再生行业",
        "company_size": "100-200", "position": "进口总监",
        "customer_type": "Trader", "customer_quality": "中等", "customer_grade": "B", "lead_grade": "B",
        "source_channel": "Exhibition",
        "product_category": "热轧卷板", "required_products": "HRC SS400 1.8-6mm, 螺纹钢 Ø10-Ø32mm",
        "end_usage": "建筑工程与二次加工",
        "budget": "$3,000,000/年", "annual_purchase": "45,000吨", "purchase_cycle": "月度",
        "decision_maker": "是",
        "downstream_payment": "LC at sight (Chittagong港)", "competitor": "印度SAIL, 日本JFE",
        "attack_notes": "孟加拉市场价格竞争激烈，吉大港卸货效率低，需考虑滞期费风险",
        "requirements_notes": "BSTI标准，需IRC进口证书",
        "contact_notes": "Rafiq英语良好，在广交会上多次见面，关系稳定",
        "contact_address": "Chamber Building, 7th Floor, Motijheel C/A, Dhaka 1000",
        "gender": "male",
        "religion": "伊斯兰教", "instagram": "", "social_platform": "WhatsApp",
        "ceo_name": "Abdul Karim Khan", "ceo_hobbies": "板球, 阅读",
        "ceo_beliefs": "伊斯兰教", "ceo_personality": "分析型",
        "ceo_political_views": "保守",
        "monthly_usage": "3,800吨", "quarterly_usage": "11,250吨",
        "industry_product_quality": "一般"
    }'::jsonb,
    '孟加拉国达卡领先钢材进口商，年采购45,000吨热轧卷板和螺纹钢。进口总监Rafiq为决策人，月度采购，LC即期。价格竞争激烈，需注意吉大港卸货效率和滞期费风险。广交会多次接触，关系稳定。B级客户。',
    false, NULL, NULL, NOW() - INTERVAL '18 days', NOW() - INTERVAL '4 days'
);

-- 14. quoted — Pakistan, piping
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Zainab Malik', 'zainab@karachipipes.pk', '+92-21-3587-6543', '+923001234567',
    'Karachi Pipes & Tubes Pvt Ltd', 'Chief Commercial Officer',
    'quoted', 'WhatsApp', 'pending',
    '{
        "country": "Pakistan", "city": "Karachi", "region_province": "Sindh",
        "industry": "Piping", "company_website": "https://karachipipes.pk",
        "main_products": "焊管, 方管, 圆管", "about_company": "巴基斯坦管材制造商，产品用于油气和建筑行业",
        "company_size": "200-500", "position": "首席商务官",
        "customer_type": "Manufacturer", "customer_quality": "中等", "customer_grade": "B", "lead_grade": "B",
        "source_channel": "WhatsApp",
        "product_category": "带钢", "required_products": "热轧带钢 Q195-Q235 1.5-4mm x 200-500mm",
        "end_usage": "ERW焊管和方管生产",
        "budget": "$1,200,000/年", "annual_purchase": "15,000吨", "purchase_cycle": "季度",
        "decision_maker": "是",
        "downstream_payment": "LC 60天", "competitor": "中国其他供应商, 乌克兰Metinvest",
        "attack_notes": "巴基斯坦外汇紧张，LC开证可能延迟，需密切跟进",
        "requirements_notes": "PSI标准，带钢拉伸强度≥370MPa",
        "contact_notes": "Zainab女士是少有的巴基斯坦女性高管，英语和乌尔都语均可",
        "contact_address": "S.I.T.E. Area, Super Highway, Karachi 75530",
        "gender": "female",
        "religion": "伊斯兰教", "instagram": "@zainab.malik.steel", "social_platform": "WhatsApp",
        "ceo_name": "Hassan Malik", "ceo_hobbies": "板球, 诗歌",
        "ceo_beliefs": "伊斯兰教", "ceo_personality": "温和型",
        "ceo_political_views": "保守",
        "monthly_usage": "1,250吨", "quarterly_usage": "3,750吨",
        "industry_product_quality": "一般"
    }'::jsonb,
    '巴基斯坦卡拉奇管材制造商，产品用于油气和建筑行业。年采购15,000吨热轧带钢，季度采购，LC 60天。首席商务官Zainab女士为决策人。需注意巴基斯坦外汇紧张导致LC开证可能延迟。B级客户。',
    false, NULL, NULL, NOW() - INTERVAL '14 days', NOW() - INTERVAL '7 days'
);

-- 15. negotiating — Morocco, automotive
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Youssef Benali', 'y.benali@tanger-auto.ma', '+212-539-34-5678', '+212661234567',
    'Tanger Automotive Parts S.A.R.L.', 'Directeur des Achats',
    'negotiating', 'Referral', 'done',
    '{
        "country": "Morocco", "city": "Tangier", "region_province": "Tanger-Tétouan-Al Hoceïma",
        "industry": "Automotive", "company_website": "https://tanger-auto.ma",
        "main_products": "汽车零部件用冷轧板, 镀锌板", "about_company": "摩洛哥丹吉尔汽车产业区零部件供应商，服务雷诺和PSA工厂",
        "company_size": "100-200", "position": "采购总监",
        "customer_type": "Manufacturer", "customer_quality": "中上", "customer_grade": "A", "lead_grade": "A",
        "source_channel": "Referral",
        "product_category": "冷轧板", "required_products": "CR DC01-DC04 0.6-2.0mm, 镀锌板 DX51D+Z",
        "end_usage": "汽车座椅骨架与车门内板",
        "budget": "$2,500,000/年", "annual_purchase": "12,000吨", "purchase_cycle": "月度",
        "decision_maker": "是",
        "downstream_payment": "LC 90天 (Attijariwafa Bank)", "competitor": "ArcelorMittal, ThyssenKrupp",
        "attack_notes": "摩洛哥汽车产业发展迅速，丹吉尔自贸区有关税优惠，潜力巨大",
        "requirements_notes": "需要ISO/TS 16949认证，EN标准，表面质量A级",
        "contact_notes": "Youssef法语为主，英语也可，每月出差巴黎一次",
        "contact_address": "Zone Franche TFZ, Lot 58, Tangier 90000, Morocco",
        "gender": "male",
        "religion": "伊斯兰教", "instagram": "", "social_platform": "LinkedIn",
        "ceo_name": "Karim Benali", "ceo_hobbies": "骑马, 旅行",
        "ceo_beliefs": "伊斯兰教", "ceo_personality": "果断型",
        "ceo_political_views": "开放",
        "monthly_usage": "1,000吨", "quarterly_usage": "3,000吨",
        "industry_product_quality": "优质"
    }'::jsonb,
    '摩洛哥丹吉尔汽车零部件供应商，服务雷诺和PSA工厂。年采购12,000吨冷轧板和镀锌板，月度采购，LC 90天。采购总监Youssef为决策人。丹吉尔自贸区有关税优惠，汽车产业增长快速。A级客户，竞争对手为安赛乐米塔尔和蒂森克虏伯。',
    false, NULL, NULL, NOW() - INTERVAL '22 days', NOW() - INTERVAL '3 days'
);

-- 16. procuring — Peru, construction
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Luis Fernando Quispe', 'lquispe@acerosandinos.pe', '+51-1-430-8800', '+51987654321',
    'Aceros Andinos S.A.C.', 'Jefe de Logística',
    'procuring', 'Website', 'done',
    '{
        "country": "Peru", "city": "Lima", "region_province": "Lima",
        "industry": "Construction", "company_website": "https://acerosandinos.pe",
        "main_products": "螺纹钢, 型钢, 钢板", "about_company": "秘鲁安第斯地区钢材贸易商，服务矿业和建筑行业",
        "company_size": "20-50", "position": "物流主管",
        "customer_type": "Trader", "customer_quality": "中等", "customer_grade": "C", "lead_grade": "B",
        "source_channel": "Website",
        "product_category": "螺纹钢", "required_products": "螺纹钢 Ø8-Ø25mm ASTM A615 Gr60",
        "end_usage": "矿业基础设施和住宅建设",
        "budget": "$500,000/年", "annual_purchase": "6,000吨", "purchase_cycle": "季度",
        "decision_maker": "否，需老板Pablo审批",
        "downstream_payment": "TT 30%预付 + 70% CAD", "competitor": "Aceros Arequipa, Siderperú",
        "attack_notes": "秘鲁矿业投资活跃，钢材需求稳定增长。Callao港清关效率一般",
        "requirements_notes": "ASTM标准，需INDECOPI认证",
        "contact_notes": "西班牙语沟通，WhatsApp响应慢，建议发邮件",
        "contact_address": "Av. Argentina 2833, Lima 01, Peru",
        "gender": "male",
        "religion": "基督教", "instagram": "", "social_platform": "WhatsApp",
        "ceo_name": "Pablo Quispe", "ceo_hobbies": "登山, 足球",
        "ceo_beliefs": "基督教", "ceo_personality": "温和型",
        "ceo_political_views": "保守",
        "monthly_usage": "500吨", "quarterly_usage": "1,500吨",
        "industry_product_quality": "中等"
    }'::jsonb,
    '秘鲁利马钢材贸易商，服务矿业和建筑行业。年采购6,000吨螺纹钢ASTM A615 Gr60，季度采购。物流主管Luis为对接人，非决策者。C级客户，采购量中等，但秘鲁矿业投资活跃，市场有增长潜力。',
    false, NULL, NULL, NOW() - INTERVAL '28 days', NOW() - INTERVAL '2 days'
);

-- 17. booking — Turkey, home appliances
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Ayşe Demir', 'ayse.demir@ankaraev.com.tr', '+90-312-445-6789', '+905351234567',
    'Ankara Ev Aletleri A.Ş.', 'Satın Alma Müdürü',
    'booking', 'Exhibition', 'done',
    '{
        "country": "Turkey", "city": "Ankara", "region_province": "Central Anatolia",
        "industry": "Home Appliances", "company_website": "https://ankaraev.com.tr",
        "main_products": "家电用镀锌板, 冷轧板", "about_company": "土耳其中部家电制造企业，OEM生产烤箱和洗碗机",
        "company_size": "200-500", "position": "采购经理",
        "customer_type": "Manufacturer", "customer_quality": "中上", "customer_grade": "B", "lead_grade": "A",
        "source_channel": "Exhibition",
        "product_category": "镀锌板", "required_products": "GI DX51D+Z 0.4-0.8mm Z100-Z180, CR SPCC 0.5-1.0mm",
        "end_usage": "烤箱外壳和洗碗机内胆",
        "budget": "$1,600,000/年", "annual_purchase": "10,000吨", "purchase_cycle": "双月",
        "decision_maker": "否，需工厂总监审批",
        "downstream_payment": "LC 60天 (Garanti BBVA)", "competitor": "Erdemir, ThyssenKrupp",
        "attack_notes": "土耳其家电出口量全球前五，客户有长期稳定需求",
        "requirements_notes": "需要CE认证相关材料，表面无钝化处理要求",
        "contact_notes": "Ayşe女士在家电展上认识，土耳其语和英语均可",
        "contact_address": "OSTİM OSB, 100. Yıl Bulvarı No:88, Ankara 06370",
        "gender": "female",
        "religion": "伊斯兰教", "instagram": "@ayse.demir.steel", "social_platform": "WhatsApp",
        "ceo_name": "Mustafa Demir", "ceo_hobbies": "摄影, 历史研究",
        "ceo_beliefs": "伊斯兰教", "ceo_personality": "分析型",
        "ceo_political_views": "保守",
        "monthly_usage": "850吨", "quarterly_usage": "2,500吨",
        "industry_product_quality": "中上"
    }'::jsonb,
    '土耳其安卡拉家电OEM制造商，生产烤箱和洗碗机。年采购10,000吨镀锌板和冷轧板，双月采购，LC 60天。采购经理Ayşe女士为对接人，需工厂总监审批。土耳其家电出口全球前五，客户需求稳定。B级客户，A级潜力。',
    false, NULL, NULL, NOW() - INTERVAL '33 days', NOW() - INTERVAL '2 days'
);

-- 18. fulfillment — India, wire drawing
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Priya Patel', 'priya@gujaratwire.in', '+91-79-2583-4567', '+919879876543',
    'Gujarat Wire Products Ltd', 'Head of Procurement',
    'fulfillment', 'LinkedIn', 'done',
    '{
        "country": "India", "city": "Ahmedabad", "region_province": "Gujarat",
        "industry": "Wire Drawing", "company_website": "https://gujaratwire.in",
        "main_products": "拉丝线材, 镀锌线材", "about_company": "印度古吉拉特邦大型拉丝企业，产品出口至中东和非洲",
        "company_size": "200-500", "position": "采购负责人",
        "customer_type": "Manufacturer", "customer_quality": "中上", "customer_grade": "A", "lead_grade": "A",
        "source_channel": "LinkedIn",
        "product_category": "线材", "required_products": "线材 SAE1006/SAE1008 Ø5.5mm, 镀锌线材 Ø2.0-4.0mm",
        "end_usage": "铁丝、钢丝绳和镀锌铁丝生产",
        "budget": "$2,200,000/年", "annual_purchase": "35,000吨", "purchase_cycle": "月度",
        "decision_maker": "是",
        "downstream_payment": "LC 60天 (SBI)", "competitor": "Tata Steel, SAIL",
        "attack_notes": "印度拉丝产能庞大但原材料缺口大，客户长期依赖进口线材",
        "requirements_notes": "IS标准，碳含量≤0.08%，抗拉强度280-380MPa",
        "contact_notes": "Priya女士是公司创始人家族成员，英语和印地语均可，决策效率高",
        "contact_address": "Survey No. 245, Sanand-Viramgam Highway, Ahmedabad 382170",
        "gender": "female",
        "religion": "印度教", "instagram": "@priya.gujaratwire", "social_platform": "WhatsApp",
        "ceo_name": "Rakesh Patel", "ceo_hobbies": "板球, 素食烹饪",
        "ceo_beliefs": "印度教", "ceo_personality": "果断型",
        "ceo_political_views": "亲商",
        "monthly_usage": "2,900吨", "quarterly_usage": "8,750吨",
        "industry_product_quality": "中等"
    }'::jsonb,
    '印度古吉拉特邦大型拉丝企业，产品出口中东和非洲。年采购35,000吨线材，月度采购，LC 60天。采购负责人Priya女士为创始人家族成员，决策效率高。印度拉丝行业原材料缺口大，长期依赖进口。A级客户。',
    false, NULL, NULL, NOW() - INTERVAL '38 days', NOW() - INTERVAL '4 days'
);

-- 19. payment — Vietnam, machinery
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Lê Minh Tuấn', 'tuan.le@vinamechi.vn', '+84-24-3825-6789', '+84912345678',
    'Vina Machinery JSC', 'Phó Tổng Giám Đốc',
    'payment', 'Referral', 'done',
    '{
        "country": "Vietnam", "city": "Hanoi", "region_province": "北部",
        "industry": "Machinery", "company_website": "https://vinamechi.vn",
        "main_products": "机械用钢板, 圆钢, 齿轮钢", "about_company": "越南北部工业机械制造企业，服务于水泥和矿山行业",
        "company_size": "100-200", "position": "副总经理",
        "customer_type": "End User", "customer_quality": "中等", "customer_grade": "B", "lead_grade": "B",
        "source_channel": "Referral",
        "product_category": "钢板", "required_products": "中厚板 SS400/Q345B 8-40mm, 圆钢 S45C Ø40-Ø150",
        "end_usage": "水泥磨机配件与矿山设备制造",
        "budget": "$800,000/年", "annual_purchase": "6,000吨", "purchase_cycle": "季度",
        "decision_maker": "是",
        "downstream_payment": "TT 30%预付 + 70%见提单副本", "competitor": "POSCO Vietnam, 中国其他供应商",
        "attack_notes": "越南北部工业区发展迅速，客户对交货期要求严格，海防港交货",
        "requirements_notes": "JIS标准优先，需要磨机耐磨性测试报告",
        "contact_notes": "Tuấn先生由越南办事处同事推荐，越南语为主，可用简单英语",
        "contact_address": "KCN Thăng Long II, Yên Mỹ, Hưng Yên",
        "gender": "male",
        "religion": "无", "instagram": "", "social_platform": "Zalo",
        "ceo_name": "Lê Văn Đức", "ceo_hobbies": "钓鱼, 下棋",
        "ceo_beliefs": "无", "ceo_personality": "温和型",
        "ceo_political_views": "保守",
        "monthly_usage": "500吨", "quarterly_usage": "1,500吨",
        "industry_product_quality": "中等"
    }'::jsonb,
    '越南河内工业机械制造企业，服务水泥和矿山行业。年采购6,000吨中厚板和圆钢，季度采购，TT混合付款。副总经理Tuấn为决策人，由越南办事处同事推荐。对交货期要求严格，海防港交货。B级客户。',
    false, NULL, NULL, NOW() - INTERVAL '42 days', NOW() - INTERVAL '6 days'
);

-- 20. converted — Indonesia, furniture
INSERT INTO leads (
    id, full_name, email, phone, whatsapp, company, title,
    status, source, follow_up_status, custom_fields, ai_summary,
    is_cold, assigned_to, created_by, created_at, updated_at
) VALUES (
    gen_random_uuid(),
    'Dewi Kusuma Wardani', 'dewi@megafurniture.co.id', '+62-31-7890-1234', '+6281345678901',
    'PT Mega Furniture Indonesia', 'Purchasing Manager',
    'converted', 'Exhibition', 'done',
    '{
        "country": "Indonesia", "city": "Surabaya", "region_province": "East Java",
        "industry": "Furniture", "company_website": "https://megafurniture.co.id",
        "main_products": "家具用薄板, 钢管", "about_company": "印尼东爪哇省钢制家具出口商，产品出口至日本和澳大利亚",
        "company_size": "100-200", "position": "采购经理",
        "customer_type": "Manufacturer", "customer_quality": "中上", "customer_grade": "A", "lead_grade": "A",
        "source_channel": "Exhibition",
        "product_category": "钢管", "required_products": "圆管 Ø16-Ø38mm 0.8-1.2mm, 方管 20x20-40x40 0.8-1.5mm, CR 0.5-1.0mm",
        "end_usage": "出口级钢制办公家具和货架",
        "budget": "$1,000,000/年", "annual_purchase": "12,000吨", "purchase_cycle": "双月",
        "decision_maker": "是",
        "downstream_payment": "TT 100%预付 (老客户可商议)", "competitor": "中国其他供应商, 越南钢厂",
        "attack_notes": "印尼家具出口增长迅速，客户有日本质量标准要求，维护好可成为长期客户",
        "requirements_notes": "JIS标准，表面Ra≤1.6μm，管材直线度≤1mm/m",
        "contact_notes": "Dewi女士华裔，普通话流利，在CIFF家具展上认识，非常专业",
        "contact_address": "Jl. Rungkut Industri III No.18, Surabaya 60293",
        "gender": "female",
        "religion": "佛教", "instagram": "@dewi.megafurniture", "social_platform": "WhatsApp",
        "ceo_name": "Hendra Kusuma", "ceo_hobbies": "高尔夫, 收藏艺术品",
        "ceo_beliefs": "佛教", "ceo_personality": "分析型",
        "ceo_political_views": "亲商",
        "monthly_usage": "1,000吨", "quarterly_usage": "3,000吨",
        "industry_product_quality": "中上"
    }'::jsonb,
    '印尼泗水钢制家具出口商，产品出口日本和澳大利亚。年采购12,000吨钢管和冷轧板，双月采购。采购经理Dewi女士为华裔，普通话流利，CIFF展上认识。A级客户，要求JIS标准和高表面质量，已成功转化为长期客户。',
    false, NULL, NULL, NOW() - INTERVAL '55 days', NOW() - INTERVAL '1 day'
);
