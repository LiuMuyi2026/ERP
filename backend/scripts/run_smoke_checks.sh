#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

PYTHON_BIN="${PYTHON_BIN:-python3}"
if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  PYTHON_BIN="python"
fi

echo "[1/2] Checking tenant schema health..."
"${PYTHON_BIN}" "${SCRIPT_DIR}/check_tenant_schema_health.py"

echo "[2/2] Running backend smoke checks..."
"${PYTHON_BIN}" "${SCRIPT_DIR}/smoke_check_backend.py"

echo "Smoke checks completed."
