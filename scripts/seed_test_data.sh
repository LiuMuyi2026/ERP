#!/usr/bin/env bash
#
# seed_test_data.sh — 为 test 租户填充各模块测试数据
#
# 前置条件: 已运行 setup_test.sh（test 租户 + 6 个账号已创建）
# 用法: bash scripts/seed_test_data.sh
#
set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
fail()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }
step()  { echo -e "${CYAN}[→]${NC} $1"; }

# JSON field extractor (uses python3)
json_get() {
  python3 -c "import sys,json; print(json.load(sys.stdin)$1)" 2>/dev/null
}

# URL-encode a string (for Chinese chars in query params)
urlencode() {
  python3 -c "import urllib.parse; print(urllib.parse.quote('$1'))"
}

# ─── 0. Check backend is running ────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "  Nexus ERP — Test Tenant Data Seeding"
echo "═══════════════════════════════════════════════"
echo ""

curl -sf "${API_URL}/api/auth/bootstrap-status" > /dev/null 2>&1 \
  || fail "Backend not reachable at ${API_URL}. Start it first."

info "Backend is running at ${API_URL}"

# ─── 1. Login as tenant admin ────────────────────────────────────────
echo ""
echo "── Step 1: 登录 (admin@test.com) ──"

RESPONSE=$(curl -s -X POST "${API_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"Happy2026","tenant_slug":"test"}')

TOKEN=$(echo "$RESPONSE" | json_get "['access_token']")
[ -n "$TOKEN" ] || fail "Login failed: ${RESPONSE}"
info "已登录: 罗总 (admin@test.com)"

AUTH="Authorization: Bearer ${TOKEN}"

# Helper: POST with JSON body
api_post() {
  local endpoint="$1"
  local data="$2"
  curl -s -X POST "${API_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -H "${AUTH}" \
    -d "${data}"
}

# Helper: POST without body
api_post_no_body() {
  local endpoint="$1"
  curl -s -X POST "${API_URL}${endpoint}" \
    -H "Content-Type: application/json" \
    -H "${AUTH}"
}

# Helper: GET
api_get() {
  local endpoint="$1"
  curl -s -X GET "${API_URL}${endpoint}" \
    -H "${AUTH}"
}

# ════════════════════════════════════════════════════════════════════
# 2. 会计科目表
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 2: 会计科目表 ──"

RESPONSE=$(api_post_no_body "/api/accounting/accounts/seed")
info "会计科目表已初始化"

# ════════════════════════════════════════════════════════════════════
# 3. HR: 4 个部门
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 3: HR 部门 ──"

create_dept() {
  local name="$1"
  local encoded=$(urlencode "$name")
  RESPONSE=$(curl -s -X POST "${API_URL}/api/hr/departments?name=${encoded}" \
    -H "Content-Type: application/json" \
    -H "${AUTH}")
  echo "$RESPONSE" | json_get "['id']"
}

DEPT_SALES=$(create_dept "销售部")
info "部门: 销售部 (${DEPT_SALES})"

DEPT_FINANCE=$(create_dept "财务部")
info "部门: 财务部 (${DEPT_FINANCE})"

DEPT_TECH=$(create_dept "技术部")
info "部门: 技术部 (${DEPT_TECH})"

DEPT_HR=$(create_dept "人事部")
info "部门: 人事部 (${DEPT_HR})"

# ════════════════════════════════════════════════════════════════════
# 4. HR: 6 个员工（对应 6 个测试账号）
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 4: HR 员工 ──"

create_employee() {
  local name="$1" email="$2" dept_id="$3" title="$4" salary="$5"
  RESPONSE=$(api_post "/api/hr/employees" "{
    \"full_name\": \"${name}\",
    \"email\": \"${email}\",
    \"department_id\": \"${dept_id}\",
    \"title\": \"${title}\",
    \"employment_type\": \"full_time\",
    \"start_date\": \"2025-01-01\",
    \"salary\": ${salary},
    \"currency\": \"CNY\"
  }")
  echo "$RESPONSE" | json_get "['id']"
}

EMP_LUO=$(create_employee "罗总" "admin@test.com" "${DEPT_SALES}" "总经理" 50000)
info "员工: 罗总 — 总经理 / 销售部"

EMP_WANG=$(create_employee "王经理" "wang@test.com" "${DEPT_SALES}" "业务经理" 25000)
info "员工: 王经理 — 业务经理 / 销售部"

EMP_LI=$(create_employee "李娜" "li@test.com" "${DEPT_SALES}" "业务员" 12000)
info "员工: 李娜 — 业务员 / 销售部"

EMP_ZHANG=$(create_employee "张芳" "zhang@test.com" "${DEPT_FINANCE}" "财务主管" 18000)
info "员工: 张芳 — 财务主管 / 财务部"

EMP_LIU=$(create_employee "刘洋" "liu@test.com" "${DEPT_HR}" "HR经理" 20000)
info "员工: 刘洋 — HR经理 / 人事部"

EMP_ZHAO=$(create_employee "赵明" "zhao@test.com" "${DEPT_TECH}" "采购专员" 15000)
info "员工: 赵明 — 采购专员 / 技术部"

# ════════════════════════════════════════════════════════════════════
# 5. HR: 1 条请假记录
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 5: HR 请假 ──"

RESPONSE=$(api_post "/api/hr/leave-requests" "{
  \"employee_id\": \"${EMP_LI}\",
  \"leave_type\": \"annual\",
  \"start_date\": \"2026-03-10\",
  \"end_date\": \"2026-03-14\",
  \"days\": 5,
  \"reason\": \"回家探亲，春季休假\"
}")
info "请假: 李娜 — 年假 5 天 (3/10-3/14)"

# ════════════════════════════════════════════════════════════════════
# 6. CRM: 5 条线索
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 6: CRM 线索 ──"

RESPONSE=$(api_post "/api/crm/leads" '{
  "full_name": "Omar Al-Farsi",
  "email": "omar@gulfsteel.ae",
  "phone": "+971-4-887-3300",
  "whatsapp": "+971-50-234-7890",
  "company": "Gulf Steel Trading LLC",
  "title": "采购总监",
  "source": "展会",
  "status": "inquiry",
  "custom_fields": {"country": "阿联酋", "city": "迪拜", "industry": "钢材贸易", "budget": "$320,000"}
}')
LEAD1=$(echo "$RESPONSE" | json_get "['id']")
info "线索: Omar Al-Farsi — Gulf Steel (inquiry)"

RESPONSE=$(api_post "/api/crm/leads" '{
  "full_name": "Maria Kowalski",
  "email": "maria@polsteel.pl",
  "phone": "+48-22-456-7890",
  "whatsapp": "+48-601-234-567",
  "company": "Pol Steel Works Sp. z o.o.",
  "title": "国际采购经理",
  "source": "邮件开发",
  "status": "replied",
  "custom_fields": {"country": "波兰", "city": "华沙", "industry": "钢结构建筑", "budget": "$280,000"}
}')
LEAD2=$(echo "$RESPONSE" | json_get "['id']")
info "线索: Maria Kowalski — Pol Steel (replied)"

RESPONSE=$(api_post "/api/crm/leads" '{
  "full_name": "James Okafor",
  "email": "james@lagosbuild.ng",
  "phone": "+234-1-463-2200",
  "whatsapp": "+234-803-456-7890",
  "company": "Lagos Building Materials Ltd",
  "title": "采购总监",
  "source": "展会",
  "status": "quoted",
  "custom_fields": {"country": "尼日利亚", "city": "拉各斯", "industry": "建材贸易", "budget": "$650,000"}
}')
LEAD3=$(echo "$RESPONSE" | json_get "['id']")
info "线索: James Okafor — Lagos Building (quoted)"

RESPONSE=$(api_post "/api/crm/leads" '{
  "full_name": "Nguyen Van Thanh",
  "email": "thanh@vietsteel.vn",
  "phone": "+84-28-3822-5500",
  "whatsapp": "+84-908-123-456",
  "company": "Viet Steel Distribution Co.",
  "title": "总经理",
  "source": "平台",
  "status": "inquiry",
  "custom_fields": {"country": "越南", "city": "胡志明市", "industry": "钢材分销", "budget": "$380,000"}
}')
LEAD4=$(echo "$RESPONSE" | json_get "['id']")
info "线索: Nguyen Van Thanh — Viet Steel (inquiry)"

RESPONSE=$(api_post "/api/crm/leads" '{
  "full_name": "Ahmed Hassan",
  "email": "ahmed@sabicsteel.sa",
  "phone": "+966-11-465-3300",
  "whatsapp": "+966-55-678-9012",
  "company": "SABIC Steel Trading Co.",
  "title": "采购与物流总监",
  "source": "引荐",
  "status": "quoted",
  "custom_fields": {"country": "沙特", "city": "利雅得", "industry": "建筑钢材", "budget": "$1,200,000"}
}')
LEAD5=$(echo "$RESPONSE" | json_get "['id']")
info "线索: Ahmed Hassan — SABIC Steel (quoted)"

# ════════════════════════════════════════════════════════════════════
# 7. CRM: 3 个客户账号
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 7: CRM 客户 ──"

RESPONSE=$(api_post "/api/crm/accounts" '{
  "name": "Gulf Steel Trading LLC",
  "industry": "钢材贸易",
  "country": "阿联酋",
  "credit_level": "normal",
  "status": "active",
  "notes": "迪拜自贸区钢管经销商，中东市场覆盖广"
}')
ACCT1=$(echo "$RESPONSE" | json_get "['id']")
info "客户: Gulf Steel Trading LLC"

RESPONSE=$(api_post "/api/crm/accounts" '{
  "name": "Pol Steel Works Sp. z o.o.",
  "industry": "钢结构建筑",
  "country": "波兰",
  "credit_level": "normal",
  "status": "active",
  "notes": "波兰钢结构建筑承包商，承接欧洲中小型项目"
}')
ACCT2=$(echo "$RESPONSE" | json_get "['id']")
info "客户: Pol Steel Works"

RESPONSE=$(api_post "/api/crm/accounts" '{
  "name": "SABIC Steel Trading Co.",
  "industry": "建筑钢材",
  "country": "沙特",
  "credit_level": "high",
  "status": "active",
  "notes": "沙特Vision 2030基建项目长期合作客户"
}')
ACCT3=$(echo "$RESPONSE" | json_get "['id']")
info "客户: SABIC Steel Trading"

# ════════════════════════════════════════════════════════════════════
# 8. CRM: 2 份合同
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 8: CRM 合同 ──"

RESPONSE=$(api_post "/api/crm/contracts" "{
  \"contract_no\": \"CTR-2026-001\",
  \"account_id\": \"${ACCT1}\",
  \"account_name\": \"Gulf Steel Trading LLC\",
  \"lead_id\": \"${LEAD1}\",
  \"contract_amount\": 320000,
  \"currency\": \"USD\",
  \"payment_method\": \"TT\",
  \"incoterm\": \"FOB\",
  \"sign_date\": \"2026-02-15\",
  \"eta\": \"2026-04-10\",
  \"status\": \"active\",
  \"risk_level\": \"normal\",
  \"remarks\": \"ERW焊接钢管80吨，FOB上海，30%预付+70%见提单\"
}")
info "合同: CTR-2026-001 — Gulf Steel \$320,000"

RESPONSE=$(api_post "/api/crm/contracts" "{
  \"contract_no\": \"CTR-2026-002\",
  \"account_id\": \"${ACCT3}\",
  \"account_name\": \"SABIC Steel Trading Co.\",
  \"lead_id\": \"${LEAD5}\",
  \"contract_amount\": 1200000,
  \"currency\": \"USD\",
  \"payment_method\": \"TT\",
  \"incoterm\": \"CFR\",
  \"sign_date\": \"2026-02-20\",
  \"eta\": \"2026-05-15\",
  \"status\": \"draft\",
  \"risk_level\": \"normal\",
  \"remarks\": \"工字钢+钢管桩1800MT，沙特Vision 2030基建项目\"
}")
info "合同: CTR-2026-002 — SABIC Steel \$1,200,000"

# ════════════════════════════════════════════════════════════════════
# 9. 库存: 2 个仓库
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 9: 仓库 ──"

RESPONSE=$(api_post "/api/inventory/warehouses" '{
  "name": "上海主仓",
  "address": "上海市浦东新区外高桥保税区华京路88号",
  "is_active": true
}')
WH1=$(echo "$RESPONSE" | json_get "['id']")
info "仓库: 上海主仓"

RESPONSE=$(api_post "/api/inventory/warehouses" '{
  "name": "深圳分仓",
  "address": "深圳市南山区蛇口港仓储中心B栋",
  "is_active": true
}')
WH2=$(echo "$RESPONSE" | json_get "['id']")
info "仓库: 深圳分仓"

# ════════════════════════════════════════════════════════════════════
# 10. 库存: 3 个供应商
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 10: 供应商 ──"

RESPONSE=$(api_post "/api/inventory/suppliers" '{
  "name": "鞍钢集团国际贸易有限公司",
  "rating": "S",
  "company_info": "鞍钢集团旗下核心出口平台，主营热轧板卷、冷轧板卷，年供应量超500万吨，ISO 9001 / API 5L多项认证",
  "contact_person": "刘建明",
  "contact_info": "电话：024-8846-5500 | 邮箱：liujm@ansteel-intl.com"
}')
SUP1=$(echo "$RESPONSE" | json_get "['id']")
info "供应商: 鞍钢集团 (S级)"

RESPONSE=$(api_post "/api/inventory/suppliers" '{
  "name": "宝钢资源有限公司",
  "rating": "A",
  "company_info": "宝武钢铁集团贸易旗舰，覆盖热轧、冷轧、涂镀全品类，质量追溯体系完善",
  "contact_person": "陈志远",
  "contact_info": "电话：021-6840-3388 | 邮箱：chenzhy@baosteel-resources.com"
}')
SUP2=$(echo "$RESPONSE" | json_get "['id']")
info "供应商: 宝钢资源 (A级)"

RESPONSE=$(api_post "/api/inventory/suppliers" '{
  "name": "天津钢铁集团有限公司",
  "rating": "B",
  "company_info": "天钢管材事业部，ERW焊接钢管/无缝钢管双线，持有API 5CT / API 5L认证",
  "contact_person": "王磊",
  "contact_info": "电话：022-8830-1234 | 邮箱：wanglei@tisg-trade.com"
}')
SUP3=$(echo "$RESPONSE" | json_get "['id']")
info "供应商: 天津钢铁 (B级)"

# ════════════════════════════════════════════════════════════════════
# 11. 库存: 5 个产品
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 11: 产品 ──"

RESPONSE=$(api_post "/api/inventory/products" "{
  \"sku\": \"ERW-4IN-SCH40\",
  \"name\": \"ERW焊接钢管（4英寸 SCH40）\",
  \"description\": \"API 5L B级 ERW焊接钢管，4英寸，壁厚SCH40，6m定尺，两端带防护端盖\",
  \"category\": \"钢管\",
  \"unit\": \"吨\",
  \"cost_price\": 4800,
  \"sell_price\": 5650,
  \"currency\": \"USD\",
  \"reorder_point\": 20,
  \"warehouse_id\": \"${WH1}\"
}")
PROD1=$(echo "$RESPONSE" | json_get "['id']")
info "产品: ERW焊接钢管 (\$4,800/\$5,650)"

RESPONSE=$(api_post "/api/inventory/products" "{
  \"sku\": \"HRC-Q235B-6MM\",
  \"name\": \"热轧钢板（Q235B 6mm）\",
  \"description\": \"Q235B热轧钢板，6mm×1500mm×C，适用于建筑钢结构及机械制造\",
  \"category\": \"板材\",
  \"unit\": \"吨\",
  \"cost_price\": 4250,
  \"sell_price\": 5020,
  \"currency\": \"USD\",
  \"reorder_point\": 50,
  \"warehouse_id\": \"${WH1}\"
}")
PROD2=$(echo "$RESPONSE" | json_get "['id']")
info "产品: 热轧钢板 (\$4,250/\$5,020)"

RESPONSE=$(api_post "/api/inventory/products" "{
  \"sku\": \"CRC-SPCC-12MM\",
  \"name\": \"冷轧钢卷（SPCC 1.2mm）\",
  \"description\": \"SPCC冷轧钢卷，1.2mm×1219mm×C，表面质量D级，内径610mm\",
  \"category\": \"板材\",
  \"unit\": \"吨\",
  \"cost_price\": 5100,
  \"sell_price\": 6050,
  \"currency\": \"USD\",
  \"reorder_point\": 30,
  \"warehouse_id\": \"${WH1}\"
}")
PROD3=$(echo "$RESPONSE" | json_get "['id']")
info "产品: 冷轧钢卷 (\$5,100/\$6,050)"

RESPONSE=$(api_post "/api/inventory/products" "{
  \"sku\": \"HW200-Q345B\",
  \"name\": \"H型钢（HW200×200 Q345B）\",
  \"description\": \"Q345B热轧H型钢，HW200×200×8×12，符合GB/T 11263及EN 10034标准\",
  \"category\": \"型材\",
  \"unit\": \"吨\",
  \"cost_price\": 4600,
  \"sell_price\": 5450,
  \"currency\": \"USD\",
  \"reorder_point\": 40,
  \"warehouse_id\": \"${WH2}\"
}")
PROD4=$(echo "$RESPONSE" | json_get "['id']")
info "产品: H型钢 (\$4,600/\$5,450)"

RESPONSE=$(api_post "/api/inventory/products" "{
  \"sku\": \"GI-PIPE-2IN\",
  \"name\": \"镀锌钢管（2英寸）\",
  \"description\": \"Q235B基管热浸镀锌，2英寸×6m定尺，镀锌层≥45μm，符合BS EN 10255标准\",
  \"category\": \"钢管\",
  \"unit\": \"吨\",
  \"cost_price\": 5200,
  \"sell_price\": 6180,
  \"currency\": \"USD\",
  \"reorder_point\": 15,
  \"warehouse_id\": \"${WH2}\"
}")
PROD5=$(echo "$RESPONSE" | json_get "['id']")
info "产品: 镀锌钢管 (\$5,200/\$6,180)"

# ════════════════════════════════════════════════════════════════════
# 12. 采购订单: 2 张
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 12: 采购订单 ──"

RESPONSE=$(api_post "/api/orders/purchase" "{
  \"po_number\": \"PO-2026-001\",
  \"vendor_company_id\": \"${SUP1}\",
  \"product_name\": \"热轧钢板（Q235B）\",
  \"specs\": \"6mm×1500mm×C\",
  \"quantity\": \"60吨\",
  \"unit_price\": 4250,
  \"total\": 255000,
  \"currency\": \"USD\",
  \"expected_date\": \"2026-03-25\",
  \"payment_method\": \"TT 30天\",
  \"notes\": \"向鞍钢采购热轧钢板，用于Gulf Steel出口订单\",
  \"status\": \"confirmed\"
}")
info "采购单: PO-2026-001 — 鞍钢/热轧钢板 60吨 \$255,000"

RESPONSE=$(api_post "/api/orders/purchase" "{
  \"po_number\": \"PO-2026-002\",
  \"vendor_company_id\": \"${SUP3}\",
  \"product_name\": \"ERW焊接钢管（API 5L B级）\",
  \"specs\": \"4英寸 SCH40 6m定尺\",
  \"quantity\": \"80吨\",
  \"unit_price\": 4800,
  \"total\": 384000,
  \"currency\": \"USD\",
  \"expected_date\": \"2026-04-01\",
  \"payment_method\": \"TT 30天\",
  \"notes\": \"天钢管材采购，用于SABIC钢管桩项目备货\",
  \"status\": \"draft\"
}")
info "采购单: PO-2026-002 — 天钢/ERW钢管 80吨 \$384,000"

# ════════════════════════════════════════════════════════════════════
# 13. 会计: 2 张发票（1 应收 + 1 应付）
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 13: 发票 ──"

RESPONSE=$(api_post "/api/accounting/invoices" '{
  "type": "receivable",
  "contact_name": "Gulf Steel Trading LLC",
  "issue_date": "2026-02-15",
  "due_date": "2026-03-15",
  "currency": "USD",
  "tax_rate": 0,
  "notes": "Gulf Steel — ERW焊接钢管出口发票（CTR-2026-001）",
  "line_items": [
    {
      "description": "ERW焊接钢管 4英寸 SCH40 — 80吨",
      "quantity": 80,
      "unit_price": 5650
    }
  ]
}')
info "发票: 应收 — Gulf Steel \$452,000"

RESPONSE=$(api_post "/api/accounting/invoices" '{
  "type": "payable",
  "contact_name": "鞍钢集团国际贸易有限公司",
  "issue_date": "2026-02-20",
  "due_date": "2026-03-20",
  "currency": "USD",
  "tax_rate": 0,
  "notes": "鞍钢 — 热轧钢板采购发票（PO-2026-001）",
  "line_items": [
    {
      "description": "热轧钢板 Q235B 6mm×1500mm — 60吨",
      "quantity": 60,
      "unit_price": 4250
    }
  ]
}')
info "发票: 应付 — 鞍钢 \$255,000"

# ════════════════════════════════════════════════════════════════════
# 14. 会计: 2 笔记账凭证（借贷平衡）
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 14: 记账凭证 ──"

RESPONSE=$(api_post "/api/accounting/journal-entries" '{
  "date": "2026-02-15",
  "description": "收到 Gulf Steel Trading 预付款 30%（CTR-2026-001）",
  "lines": [
    {
      "account_code": "1002",
      "account_name": "银行存款",
      "description": "Gulf Steel TT预付款入账",
      "debit": 135600,
      "credit": 0
    },
    {
      "account_code": "2203",
      "account_name": "预收账款",
      "description": "Gulf Steel 合同预付30%",
      "debit": 0,
      "credit": 135600
    }
  ]
}')
info "凭证: 收到 Gulf Steel 预付款 \$135,600 (借:银行存款 贷:预收账款)"

RESPONSE=$(api_post "/api/accounting/journal-entries" '{
  "date": "2026-02-20",
  "description": "支付鞍钢集团采购定金（PO-2026-001）",
  "lines": [
    {
      "account_code": "1123",
      "account_name": "预付账款",
      "description": "鞍钢热轧钢板采购定金30%",
      "debit": 76500,
      "credit": 0
    },
    {
      "account_code": "1002",
      "account_name": "银行存款",
      "description": "支付鞍钢定金",
      "debit": 0,
      "credit": 76500
    }
  ]
}')
info "凭证: 支付鞍钢定金 \$76,500 (借:预付账款 贷:银行存款)"

# ════════════════════════════════════════════════════════════════════
# 15. Workspace: 默认工作区 + 2 个页面
# ════════════════════════════════════════════════════════════════════
echo ""
echo "── Step 15: Workspace ──"

RESPONSE=$(api_post_no_body "/api/workspace/setup")
info "默认工作区已初始化"

# Get team workspace ID
RESPONSE=$(api_get "/api/workspace/workspaces")
WS_ID=$(echo "$RESPONSE" | python3 -c "
import sys, json
ws = json.load(sys.stdin)
for w in ws:
    if '团队' in w.get('name',''):
        print(w['id'])
        break
else:
    if ws:
        print(ws[0]['id'])
" 2>/dev/null || echo "")

if [ -n "$WS_ID" ]; then
  info "团队工作区: ${WS_ID}"

  # Page 1: 销售计划
  RESPONSE=$(api_post "/api/workspace/pages" "{
    \"workspace_id\": \"${WS_ID}\",
    \"title\": \"2026 Q1 销售计划\",
    \"content\": {
      \"blocks\": [
        {\"type\": \"heading\", \"text\": \"2026 Q1 销售目标\"},
        {\"type\": \"paragraph\", \"text\": \"本季度销售目标：USD 2,000,000\"},
        {\"type\": \"paragraph\", \"text\": \"重点客户：Gulf Steel Trading、SABIC Steel Trading\"},
        {\"type\": \"paragraph\", \"text\": \"重点产品：ERW焊接钢管、热轧钢板、H型钢\"},
        {\"type\": \"heading\", \"text\": \"各区域分配\"},
        {\"type\": \"paragraph\", \"text\": \"中东地区：\$800,000（Gulf Steel + SABIC）\"},
        {\"type\": \"paragraph\", \"text\": \"东南亚：\$500,000（Viet Steel 等）\"},
        {\"type\": \"paragraph\", \"text\": \"非洲：\$400,000（Lagos Building 等）\"},
        {\"type\": \"paragraph\", \"text\": \"欧洲：\$300,000（Pol Steel 等）\"}
      ]
    },
    \"position\": 0,
    \"icon\": \"📊\"
  }")
  info "页面: 2026 Q1 销售计划"

  # Page 2: 供应商评估
  RESPONSE=$(api_post "/api/workspace/pages" "{
    \"workspace_id\": \"${WS_ID}\",
    \"title\": \"供应商年度评估\",
    \"content\": {
      \"blocks\": [
        {\"type\": \"heading\", \"text\": \"2026 年度供应商评估\"},
        {\"type\": \"paragraph\", \"text\": \"评估周期：2026年1月-12月\"},
        {\"type\": \"heading\", \"text\": \"鞍钢集团（S级）\"},
        {\"type\": \"paragraph\", \"text\": \"交期：准时率98% | 质量：优秀 | 价格竞争力：强 | 结论：继续作为核心供应商\"},
        {\"type\": \"heading\", \"text\": \"宝钢资源（A级）\"},
        {\"type\": \"paragraph\", \"text\": \"交期：准时率95% | 质量：优秀 | 价格竞争力：中等 | 结论：主力供应商，冷轧产品首选\"},
        {\"type\": \"heading\", \"text\": \"天津钢铁（B级）\"},
        {\"type\": \"paragraph\", \"text\": \"交期：准时率85% | 质量：良好 | 价格竞争力：强 | 结论：备选供应商，管材价格有优势\"}
      ]
    },
    \"position\": 1,
    \"icon\": \"📋\"
  }")
  info "页面: 供应商年度评估"
else
  warn "未找到工作区，跳过页面创建"
fi

# ════════════════════════════════════════════════════════════════════
# Done
# ════════════════════════════════════════════════════════════════════
echo ""
echo "═══════════════════════════════════════════════"
echo "  数据填充完成！"
echo ""
echo "  会计科目:   默认科目表"
echo "  HR:         4 部门 + 6 员工 + 1 请假"
echo "  CRM:        5 线索 + 3 客户 + 2 合同"
echo "  库存:       2 仓库 + 3 供应商 + 5 产品"
echo "  采购:       2 采购单"
echo "  发票:       2 张（1 应收 + 1 应付）"
echo "  凭证:       2 笔（借贷平衡）"
echo "  Workspace:  默认工作区 + 2 页面"
echo ""
echo "  前端: http://localhost:3000/test"
echo "  账号: admin@test.com / Happy2026"
echo "═══════════════════════════════════════════════"
echo ""
