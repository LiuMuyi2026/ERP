#!/usr/bin/env bash
#
# setup_test.sh — 清理 demo 租户，创建 test 租户 + 6 个测试账号
#
# 用法: bash scripts/setup_test.sh
#
set -euo pipefail

API_URL="${API_URL:-http://localhost:8000}"
PSQL="${PSQL:-/opt/homebrew/Cellar/postgresql@17/17.7_1/bin/psql}"
DB_HOST="${DB_HOST:-localhost}"
DB_USER="${DB_USER:-nexus}"
DB_NAME="${DB_NAME:-nexus_platform}"

PLATFORM_EMAIL="admin@nexus.dev"
PLATFORM_PASS="Happy2026"

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

info()  { echo -e "${GREEN}[✓]${NC} $1"; }
warn()  { echo -e "${YELLOW}[!]${NC} $1"; }
fail()  { echo -e "${RED}[✗]${NC} $1"; exit 1; }

# ─── 0. Check backend is running ────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "  Nexus ERP — Test Environment Setup"
echo "═══════════════════════════════════════════════"
echo ""

curl -sf "${API_URL}/api/auth/bootstrap-status" > /dev/null 2>&1 \
  || fail "Backend not reachable at ${API_URL}. Start it first."

info "Backend is running at ${API_URL}"

# ─── 1. Clean up demo tenant ────────────────────────────────────────────────
echo ""
echo "── Step 1: Cleaning demo tenant ──"

$PSQL -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -q <<'SQL'
DROP SCHEMA IF EXISTS tenant_demo CASCADE;
DELETE FROM platform.tenants WHERE slug = 'demo';
SQL

info "Demo tenant dropped"

# Also clean up test tenant if it exists (idempotent re-run)
$PSQL -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -q <<'SQL'
DROP SCHEMA IF EXISTS tenant_test CASCADE;
DELETE FROM platform.tenants WHERE slug = 'test';
SQL

info "Previous test tenant cleaned (if any)"

# ─── 2. Get platform admin token ────────────────────────────────────────────
echo ""
echo "── Step 2: Platform admin login ──"

RESPONSE=$(curl -s -X POST "${API_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"${PLATFORM_EMAIL}\",\"password\":\"${PLATFORM_PASS}\"}")

PLATFORM_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
[ -n "$PLATFORM_TOKEN" ] || fail "Platform admin login failed"
info "Platform admin authenticated"

# ─── 3. Create test tenant ──────────────────────────────────────────────────
echo ""
echo "── Step 3: Creating test tenant ──"

RESPONSE=$(curl -s -X POST "${API_URL}/api/platform/tenants" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer ${PLATFORM_TOKEN}" \
  -d '{
    "name": "Nuo Gang",
    "slug": "test",
    "admin_email": "admin@test.com",
    "admin_password": "Happy2026",
    "admin_name": "罗总"
  }')

echo "$RESPONSE" | python3 -c "import sys,json; d=json.load(sys.stdin); print()" > /dev/null 2>&1 \
  || fail "Tenant creation failed: ${RESPONSE}"
info "Test tenant created (slug: test)"

# Ensure users table has all required columns
$PSQL -h "$DB_HOST" -U "$DB_USER" -d "$DB_NAME" -q <<'SQL'
ALTER TABLE tenant_test.users ADD COLUMN IF NOT EXISTS plain_password VARCHAR(255);
ALTER TABLE tenant_test.users ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE;
SQL
info "Schema columns verified"

# ─── 4. Login as tenant admin ───────────────────────────────────────────────
echo ""
echo "── Step 4: Tenant admin login ──"

RESPONSE=$(curl -s -X POST "${API_URL}/api/auth/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@test.com","password":"Happy2026","tenant_slug":"test"}')

TENANT_TOKEN=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")
[ -n "$TENANT_TOKEN" ] || fail "Tenant admin login failed"
info "Tenant admin authenticated (admin@test.com)"

# ─── 5. Invite users ────────────────────────────────────────────────────────
echo ""
echo "── Step 5: Inviting test users ──"

invite_user() {
  local email="$1" name="$2" role="$3"
  RESPONSE=$(curl -s -X POST "${API_URL}/api/admin/users/invite" \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer ${TENANT_TOKEN}" \
    -d "{\"email\":\"${email}\",\"full_name\":\"${name}\",\"role\":\"${role}\",\"password\":\"Happy2026\"}")

  if echo "$RESPONSE" | python3 -c "import sys,json; json.load(sys.stdin)['id']" > /dev/null 2>&1; then
    info "Invited: ${name} <${email}> (${role})"
  else
    warn "Failed to invite ${email}: ${RESPONSE}"
  fi
}

invite_user "wang@test.com"  "王经理" "manager"
invite_user "li@test.com"    "李娜"   "tenant_user"
invite_user "zhang@test.com" "张芳"   "tenant_user"
invite_user "liu@test.com"   "刘洋"   "manager"
invite_user "zhao@test.com"  "赵明"   "tenant_user"

# ─── 6. Verify all logins ───────────────────────────────────────────────────
echo ""
echo "── Step 6: Verifying logins ──"

verify_login() {
  local email="$1" name="$2"
  RESPONSE=$(curl -s -X POST "${API_URL}/api/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"Happy2026\",\"tenant_slug\":\"test\"}" 2>&1)

  if echo "$RESPONSE" | python3 -c "import sys,json; json.load(sys.stdin)['access_token']" > /dev/null 2>&1; then
    info "Login OK: ${name} <${email}>"
  else
    warn "Login FAILED: ${name} <${email}>"
  fi
}

verify_login "admin@test.com" "罗总"
verify_login "wang@test.com"  "王经理"
verify_login "li@test.com"    "李娜"
verify_login "zhang@test.com" "张芳"
verify_login "liu@test.com"   "刘洋"
verify_login "zhao@test.com"  "赵明"

# ─── Done ────────────────────────────────────────────────────────────────────
echo ""
echo "═══════════════════════════════════════════════"
echo "  Setup complete!"
echo ""
echo "  Frontend:  http://localhost:3000/test"
echo "  Tenant:    test"
echo "  Accounts:  6 (see TEST_GUIDE.md)"
echo "═══════════════════════════════════════════════"
echo ""
