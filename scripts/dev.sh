#!/usr/bin/env bash
# Chạy toàn bộ stack local với ít lệnh: ./scripts/dev.sh setup | up | down | status
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

PID_DIR="$ROOT/.dev/pids"
LOG_DIR="$ROOT/.dev/logs"
VENV="$ROOT/venv"
PY="${VENV}/bin/python"
PIP="${VENV}/bin/pip"

# API/worker chạy trên máy host → Ollama luôn là localhost (không dùng host.docker.internal)
export OLLAMA_BASE_URL="http://localhost:11434"

log() { printf '\033[1;36m→\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m!\033[0m %s\n' "$*"; }
err() { printf '\033[1;31m✗\033[0m %s\n' "$*" >&2; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || { err "Thiếu lệnh: $1"; exit 1; }
}

ensure_venv() {
  if [[ ! -x "$PY" ]]; then
    err "Chưa có venv. Chạy: ./scripts/dev.sh setup"
    exit 1
  fi
}

wait_postgres() {
  log "Đợi Postgres sẵn sàng…"
  for _ in $(seq 1 40); do
    if docker compose exec -T postgres pg_isready -U raguser -d vnfinrag >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  err "Postgres chưa ready. Kiểm tra: docker compose ps"
  exit 1
}

migrate_db() {
  log "Migration database…"
  (cd "$ROOT/apps/api" && "$ROOT/venv/bin/alembic" upgrade head)
}

is_running() {
  local pidfile="$PID_DIR/$1.pid"
  [[ -f "$pidfile" ]] && kill -0 "$(cat "$pidfile")" 2>/dev/null
}

start_bg() {
  local name="$1"
  shift
  mkdir -p "$PID_DIR" "$LOG_DIR"
  if is_running "$name"; then
    warn "$name đã chạy (pid $(cat "$PID_DIR/$name.pid"))"
    return 0
  fi
  log "Khởi động ${name}..."
  nohup bash -c "$*" >>"$LOG_DIR/$name.log" 2>&1 &
  echo $! >"$PID_DIR/$name.pid"
}

stop_bg() {
  local name="$1"
  local pidfile="$PID_DIR/$name.pid"
  if [[ -f "$pidfile" ]]; then
    local pid
    pid="$(cat "$pidfile")"
    if kill -0 "$pid" 2>/dev/null; then
      # Send SIGTERM first for graceful shutdown
      kill "$pid" 2>/dev/null || true
      # Wait up to 5 seconds for graceful stop
      for _ in $(seq 1 10); do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.5
      done
      # Force kill if still alive
      kill -9 "$pid" 2>/dev/null || true
    fi
    rm -f "$pidfile"
  fi
}

# --- Orphan process cleanup ---
_cleanup_orphans() {
  local name="$1"
  case "$name" in
    api)
      # Kill any uvicorn on port 8000 not tracked by PID file
      lsof -ti :8000 2>/dev/null | while read -r pid; do
        if [[ ! -f "$PID_DIR/api.pid" ]] || [[ "$(cat "$PID_DIR/api.pid" 2>/dev/null)" != "$pid" ]]; then
          kill "$pid" 2>/dev/null || true
        fi
      done || true
      ;;
    web)
      # Kill next dev server on port 3000
      lsof -ti :3000 2>/dev/null | while read -r pid; do
        if [[ ! -f "$PID_DIR/web.pid" ]] || [[ "$(cat "$PID_DIR/web.pid" 2>/dev/null)" != "$pid" ]]; then
          kill "$pid" 2>/dev/null || true
        fi
      done || true
      ;;
    worker)
      # Kill orphan rq workers
      pgrep -f "run_worker.py" 2>/dev/null | while read -r pid; do
        if [[ ! -f "$PID_DIR/worker.pid" ]] || [[ "$(cat "$PID_DIR/worker.pid" 2>/dev/null)" != "$pid" ]]; then
          kill "$pid" 2>/dev/null || true
        fi
      done || true
      ;;
  esac
}

_check_port() {
  local port="$1"
  local name="$2"
  if lsof -ti ":$port" >/dev/null 2>&1; then
    warn "Port $port đang bị chiếm (cần cho $name). Dùng: lsof -ti :$port | xargs kill"
  fi
}

cmd_setup() {
  need_cmd docker
  need_cmd python3
  need_cmd npm

  if [[ ! -d "$VENV" ]]; then
    log "Tạo venv Python…"
    python3 -m venv "$VENV"
  fi

  log "Cài Python packages…"
  "$PIP" install -q --upgrade pip
  "$PIP" install -q -r apps/api/requirements.txt -r apps/worker/requirements.txt

  if [[ ! -f .env ]]; then
    cp .env.example .env
    warn "Đã tạo .env — hãy thêm GEMINI_API_KEY vào file này"
  fi

  if [[ ! -f apps/web/.env.local ]]; then
    cp apps/web/.env.local.example apps/web/.env.local
  fi

  log "Cài npm (web)…"
  (cd apps/web && npm install --silent)

  log "Docker: Postgres + Redis…"
  docker compose up -d postgres redis
  wait_postgres
  migrate_db

  echo ""
  log "Setup xong."
  echo "  Tiếp theo:"
  echo "    1. ollama pull nomic-embed-text   (nếu chưa có)"
  echo "    2. brew install tesseract tesseract-lang   (OCR PDF scan)"
  echo "    3. Sửa .env → GEMINI_API_KEY=..."
  echo "    4. ./scripts/dev.sh up"
}

cmd_up() {
  need_cmd docker
  ensure_venv

  if [[ ! -f .env ]]; then
    err "Thiếu .env — chạy: ./scripts/dev.sh setup"
    exit 1
  fi

  docker compose up -d postgres redis
  wait_postgres
  migrate_db

  # Check ports before starting
  _check_port 8000 "API"
  _check_port 3000 "Web"

  # Cleanup orphan processes
  _cleanup_orphans api
  _cleanup_orphans worker
  _cleanup_orphans web

  # API
  start_bg api "cd '$ROOT/apps/api' && exec '$VENV/bin/uvicorn' app.main:app --reload --port 8000"

  # Worker (macOS: SimpleWorker trong run_worker.py)
  start_bg worker "cd '$ROOT/apps/worker' && exec '$PY' run_worker.py"

  # Web
  start_bg web "cd '$ROOT/apps/web' && exec npm run dev"

  sleep 2
  cmd_status

  echo ""
  log "Đã bật stack. Mở: \033[1;32mhttp://localhost:3000\033[0m"
  echo "  Logs: ./scripts/dev.sh logs"
  echo "  Dừng: ./scripts/dev.sh down"
}

cmd_down() {
  log "Dừng API / Worker / Web…"
  stop_bg web
  stop_bg worker
  stop_bg api

  # Cleanup any orphan processes
  _cleanup_orphans api
  _cleanup_orphans worker
  _cleanup_orphans web

  log "Xong (Docker Postgres/Redis vẫn chạy — tắt bằng: docker compose stop)"
}

# --- NEW: restart command ---
cmd_restart() {
  local target="${1:-all}"
  case "$target" in
    api)
      log "Restart API…"
      stop_bg api
      _cleanup_orphans api
      start_bg api "cd '$ROOT/apps/api' && exec '$VENV/bin/uvicorn' app.main:app --reload --port 8000"
      ;;
    worker)
      log "Restart Worker…"
      stop_bg worker
      _cleanup_orphans worker
      start_bg worker "cd '$ROOT/apps/worker' && exec '$PY' run_worker.py"
      ;;
    web)
      log "Restart Web…"
      stop_bg web
      _cleanup_orphans web
      start_bg web "cd '$ROOT/apps/web' && exec npm run dev"
      ;;
    all)
      cmd_down
      sleep 1
      cmd_up
      ;;
    *)
      err "Usage: ./scripts/dev.sh restart [api|worker|web|all]"
      exit 1
      ;;
  esac
  sleep 1
  cmd_status
}

# --- NEW: reset command ---
cmd_reset() {
  echo ""
  warn "⚠️  Thao tác này sẽ XÓA TOÀN BỘ dữ liệu đã index (giữ nguyên schema)."
  echo "  Bao gồm: documents, document_chunks, document_pages, financial_tables,"
  echo "  financial_facts, companies, chat_sessions, chat_messages."
  echo ""
  printf "  Bạn có chắc chắn? (y/N): "
  read -r confirm
  if [[ "${confirm:-n}" != "y" && "${confirm:-n}" != "Y" ]]; then
    log "Đã hủy."
    return 0
  fi

  docker compose up -d postgres redis >/dev/null 2>&1
  wait_postgres

  log "Truncate tất cả bảng dữ liệu…"
  docker compose exec -T postgres psql -U raguser -d vnfinrag -c \
    "TRUNCATE document_chunks, document_pages, financial_tables, financial_facts, chat_messages, chat_sessions, documents, companies CASCADE;" \
    2>/dev/null

  # Clear Redis failed/finished queues
  log "Clear Redis queues…"
  docker compose exec -T redis redis-cli FLUSHDB >/dev/null 2>&1 || true

  log "Reset xong. Chạy lại worker để auto-seed: ./scripts/dev.sh restart worker"
}

# --- NEW: seed command ---
cmd_seed() {
  ensure_venv
  docker compose up -d postgres redis >/dev/null 2>&1
  wait_postgres

  local manifest="${1:-public_demo.jsonl}"
  shift || true
  local limit_arg=""
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --limit) limit_arg="--limit $2"; shift 2 ;;
      --dry-run) limit_arg="$limit_arg --dry-run"; shift ;;
      *) shift ;;
    esac
  done

  local manifest_path
  if [[ -f "$manifest" ]]; then
    manifest_path="$manifest"
  elif [[ -f "$ROOT/samples/manifests/$manifest" ]]; then
    manifest_path="$ROOT/samples/manifests/$manifest"
  else
    err "Manifest không tìm thấy: $manifest"
    echo "  Các file có sẵn:"
    ls -1 "$ROOT/samples/manifests/"*.jsonl 2>/dev/null | while read -r f; do
      echo "    $(basename "$f")"
    done
    exit 1
  fi

  log "Seed từ: $(basename "$manifest_path") $limit_arg"
  (cd "$ROOT/apps/worker" && "$PY" -m worker.seed_runner "$manifest_path" $limit_arg)
  warn "Cần worker đang chạy để xử lý. Kiểm tra: ./scripts/dev.sh status"
}

cmd_status() {
  echo "── Docker ──"
  docker compose ps postgres redis 2>/dev/null || true

  echo ""
  echo "── App processes ──"
  for name in api worker web; do
    if is_running "$name"; then
      echo "  ✓ $name (pid $(cat "$PID_DIR/$name.pid"))"
    else
      echo "  ✗ $name"
    fi
  done

  echo ""
  echo "── Health ──"
  if curl -sf http://localhost:8000/health >/dev/null 2>&1; then
    echo "  ✓ API http://localhost:8000"
  else
    echo "  ✗ API chưa phản hồi"
  fi
  if curl -sf -o /dev/null http://localhost:3000 2>/dev/null; then
    echo "  ✓ Web http://localhost:3000"
  else
    echo "  ✗ Web chưa phản hồi (có thể đang build…)"
  fi
  if curl -sf "${OLLAMA_BASE_URL}/api/tags" >/dev/null 2>&1; then
    # Show which models are available
    local models
    models=$(curl -sf "${OLLAMA_BASE_URL}/api/tags" 2>/dev/null | grep -o '"name":"[^"]*"' | head -5 | sed 's/"name":"//g;s/"//g' | tr '\n' ', ' | sed 's/,$//')
    echo "  ✓ Ollama ${OLLAMA_BASE_URL} [${models:-no models}]"
  else
    warn "Ollama chưa chạy → embedding sẽ lỗi (ollama serve && ollama pull nomic-embed-text)"
  fi

  # GEMINI_API_KEY status (show whether configured, never show the key)
  if [[ -f .env ]]; then
    local gemini_key
    gemini_key=$(grep -E '^GEMINI_API_KEY=' .env 2>/dev/null | head -1 | cut -d= -f2)
    if [[ -n "$gemini_key" && "$gemini_key" != "your_key_here" ]]; then
      echo "  ✓ GEMINI_API_KEY đã cấu hình"
    else
      warn "GEMINI_API_KEY chưa cấu hình trong .env → chat sẽ lỗi"
    fi
  fi

  if docker compose exec -T postgres pg_isready -U raguser -d vnfinrag >/dev/null 2>&1; then
    echo ""
    echo "── Dữ liệu ──"
    docker compose exec -T postgres psql -U raguser -d vnfinrag -t -A -c \
      "SELECT
         (SELECT count(*) FROM documents WHERE status = 'ready'),
         (SELECT count(*) FROM documents WHERE status NOT IN ('ready', 'failed')),
         (SELECT count(*) FROM documents WHERE status = 'failed'),
         (SELECT count(*) FROM document_chunks),
         (SELECT coalesce(title, left(id::text, 8)) FROM documents
          WHERE status NOT IN ('ready', 'failed')
          ORDER BY updated_at DESC LIMIT 1);" 2>/dev/null \
      | while IFS='|' read -r ready processing failed chunks current; do
          echo "  ready: ${ready:-0} | đang xử lý: ${processing:-0} | lỗi: ${failed:-0} | chunks: ${chunks:-0}"
          if [[ -n "${current:-}" ]]; then
            echo "  hiện tại: ${current} (OCR ~1–3 phút/báo cáo — xem: ./scripts/dev.sh logs worker)"
          fi
        done
  fi
}

cmd_logs() {
  local target="${1:-all}"
  case "$target" in
    api) tail -f "$LOG_DIR/api.log" ;;
    worker) tail -f "$LOG_DIR/worker.log" ;;
    web) tail -f "$LOG_DIR/web.log" ;;
    all)
      tail -f "$LOG_DIR/api.log" "$LOG_DIR/worker.log" "$LOG_DIR/web.log" 2>/dev/null
      ;;
    *) err "Usage: ./scripts/dev.sh logs [api|worker|web|all]"; exit 1 ;;
  esac
}

cmd_reindex() {
  ensure_venv
  docker compose up -d postgres redis
  wait_postgres
  log "Xếp hàng reindex báo cáo trống (cần worker đang chạy)…"
  (cd "$ROOT/apps/worker" && "$PY" -m worker.reindex_empty)
  warn "Mỗi PDF OCR ~1–3 phút. Theo dõi: ./scripts/dev.sh logs worker"
}

cmd_help() {
  cat <<EOF
VN Financial Report RAG — dev helper

  ./scripts/dev.sh setup       Lần đầu: venv, pip, npm, docker, migrate
  ./scripts/dev.sh up          Bật API + Worker + Web (+ docker DB)
  ./scripts/dev.sh down        Tắt API / Worker / Web
  ./scripts/dev.sh restart     Restart tất cả (hoặc: restart api|worker|web)
  ./scripts/dev.sh status      Kiểm tra trạng thái
  ./scripts/dev.sh logs        Xem log (api|worker|web|all)
  ./scripts/dev.sh reindex     Index lại PDF chưa có chunk
  ./scripts/dev.sh seed        Seed thủ công (seed [manifest] [--limit N])
  ./scripts/dev.sh reset       Xóa toàn bộ dữ liệu (giữ schema)

Hoặc dùng: make setup | make up | make down

EOF
}

main() {
  local cmd="${1:-help}"
  shift || true
  case "$cmd" in
    setup) cmd_setup ;;
    up|start) cmd_up ;;
    down|stop) cmd_down ;;
    restart) cmd_restart "${1:-all}" ;;
    status|ps) cmd_status ;;
    logs) cmd_logs "${1:-all}" ;;
    reindex) cmd_reindex ;;
    seed) cmd_seed "$@" ;;
    reset) cmd_reset ;;
    help|-h|--help) cmd_help ;;
    *)
      err "Lệnh không rõ: $cmd"
      cmd_help
      exit 1
      ;;
  esac
}

main "$@"
