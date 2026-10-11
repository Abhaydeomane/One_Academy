#!/usr/bin/env bash
# Proves the architectural rules R1-R4 still fail the build.
#
# The ESLint config in packages/config/eslint/api.js is what keeps the module
# boundaries real. A refactor could silently disable it and nothing else would
# notice, so this script lints deliberate violations and asserts each one is
# still rejected — and that legal code is still accepted.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ESLINT="$REPO_ROOT/node_modules/.bin/eslint"
FIXTURE_DIR="$(mktemp -d)"
trap 'rm -rf "$FIXTURE_DIR"' EXIT

mkdir -p "$FIXTURE_DIR/src/modules/alpha" "$FIXTURE_DIR/src/modules/beta" "$FIXTURE_DIR/src/lib"

cat > "$FIXTURE_DIR/eslint.config.js" <<EOF
import api from '$REPO_ROOT/packages/config/eslint/api.js'
export default api
EOF

# --- Violations: each must be reported -------------------------------------
printf "import { prisma } from '@one/db'\nexport const r = prisma\n" \
  > "$FIXTURE_DIR/src/modules/alpha/alpha.routes.ts"
printf "import { x } from '../beta/beta.repository.js'\nexport const s = x\n" \
  > "$FIXTURE_DIR/src/modules/alpha/alpha.service.ts"
printf "import express from 'express'\nexport const t = express\n" \
  > "$FIXTURE_DIR/src/modules/beta/beta.service.ts"
printf "import { y } from '../alpha/alpha.service.js'\nexport const u = y\n" \
  > "$FIXTURE_DIR/src/modules/beta/beta.routes.ts"
printf "import { prisma } from '@one/db'\nexport const bad = prisma\n" \
  > "$FIXTURE_DIR/src/lib/leak.ts"

# --- Legal code: must NOT be reported --------------------------------------
printf "import { prisma } from '@one/db'\nexport const ok = prisma\n" \
  > "$FIXTURE_DIR/src/modules/alpha/alpha.repository.ts"
printf "import { z } from 'zod'\nimport { a } from '../alpha/alpha.service.js'\nexport const legal = [z, a]\n" \
  > "$FIXTURE_DIR/src/modules/beta/beta2.service.ts"

OUTPUT="$(cd "$FIXTURE_DIR" && "$ESLINT" src --no-warn-ignored 2>&1 || true)"

EXPECTED_VIOLATIONS=5
ACTUAL_VIOLATIONS="$(printf '%s' "$OUTPUT" | grep -c 'no-restricted-imports' || true)"

FAILED=0

assert_contains() {
  if ! printf '%s' "$OUTPUT" | grep -q "$1"; then
    echo "FAIL: expected a violation matching: $1"
    FAILED=1
  fi
}

assert_clean() {
  if printf '%s' "$OUTPUT" | grep -q "$1"; then
    echo "FAIL: legal file was rejected: $1"
    FAILED=1
  fi
}

assert_contains 'alpha.routes.ts'
assert_contains 'alpha.service.ts'
assert_contains 'beta.service.ts'
assert_contains 'beta.routes.ts'
assert_contains 'leak.ts'
assert_clean 'alpha.repository.ts'
assert_clean 'beta2.service.ts'

if [ "$ACTUAL_VIOLATIONS" -ne "$EXPECTED_VIOLATIONS" ]; then
  echo "FAIL: expected $EXPECTED_VIOLATIONS boundary violations, got $ACTUAL_VIOLATIONS"
  FAILED=1
fi

if [ "$FAILED" -ne 0 ]; then
  echo ""
  echo "--- eslint output ---"
  printf '%s\n' "$OUTPUT"
  echo ""
  echo "The architectural guardrails are not working. Fix packages/config/eslint/api.js"
  echo "before merging — R1-R4 are no longer enforced."
  exit 1
fi

echo "Lint guardrails verified: R1-R4 reject $EXPECTED_VIOLATIONS violations and accept legal code."
