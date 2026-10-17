#!/usr/bin/env bash
# Development mode: Go backend, traffic proxy, and Next.js dev server.
#
set -euo pipefail
cd "$(cd "$(dirname "$0")/.." && pwd)"

# Stop both child processes on exit.
cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

go run ./cmd/artex -addr :8787 -proxy 127.0.0.1:8788 &

( cd web && npm run dev ) &

echo "[DEV] Backend :8787 / proxy :8788 / frontend http://localhost:5173 (Ctrl+C to stop)"
wait
