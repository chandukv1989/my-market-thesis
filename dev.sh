#!/usr/bin/env bash
# Restart backend and frontend dev servers on custom ports.
# Usage: ./dev.sh            (restart both)
#        BACKEND_PORT=4101 FRONTEND_PORT=4201 ./dev.sh
set -u
cd "$(dirname "$0")"

BACKEND_PORT="${BACKEND_PORT:-4100}"
FRONTEND_PORT="${FRONTEND_PORT:-4200}"
LOG_DIR=".dev-logs"
mkdir -p "$LOG_DIR"

kill_port() {
  local port="$1" pids
  pids=$(lsof -ti tcp:"$port" 2>/dev/null)
  if [ -n "$pids" ]; then
    echo "Killing process(es) on port $port: $pids"
    kill $pids 2>/dev/null
    sleep 1
    pids=$(lsof -ti tcp:"$port" 2>/dev/null)
    [ -n "$pids" ] && kill -9 $pids 2>/dev/null
  fi
}

wait_for_port() {
  local port="$1" i
  for i in $(seq 1 30); do
    lsof -ti tcp:"$port" >/dev/null 2>&1 && return 0
    sleep 1
  done
  return 1
}

kill_port "$BACKEND_PORT"
kill_port "$FRONTEND_PORT"

echo "Starting backend on :$BACKEND_PORT ..."
PORT="$BACKEND_PORT" nohup npx tsx server.ts > "$LOG_DIR/backend.log" 2>&1 &
echo $! > "$LOG_DIR/backend.pid"

echo "Starting frontend on :$FRONTEND_PORT ..."
API_PROXY_TARGET="http://localhost:$BACKEND_PORT" nohup npx vite --port "$FRONTEND_PORT" --strictPort --host 0.0.0.0 > "$LOG_DIR/frontend.log" 2>&1 &
echo $! > "$LOG_DIR/frontend.pid"

wait_for_port "$BACKEND_PORT"  && echo "Backend  up:  http://localhost:$BACKEND_PORT  (log: $LOG_DIR/backend.log)"  || echo "Backend did not come up; see $LOG_DIR/backend.log"
wait_for_port "$FRONTEND_PORT" && echo "Frontend up:  http://localhost:$FRONTEND_PORT (log: $LOG_DIR/frontend.log)" || echo "Frontend did not come up; see $LOG_DIR/frontend.log"
