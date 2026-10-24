#!/usr/bin/env bash
# 在目标 Linux 服务器执行：解包 CI 构建产物、原子切换版本、探活并在失败时回滚。
set -Eeuo pipefail

archive="${1:?缺少发布包路径}"
expected_checksum="${2:?缺少发布包校验值}"
deploy_root="${3:?缺少部署根目录}"
release_id="${4:?缺少版本号}"
api_service="${5:?缺少完整后端服务名}"
api_health_url="${6:?缺少完整后端健康检查地址}"
keep_releases="${7:-5}"
run_db_migrations="${8:-false}"

if [[ "$deploy_root" != /* || "$deploy_root" == "/" ]]; then
  echo "拒绝不安全的部署根目录：$deploy_root" >&2
  exit 2
fi
if [[ ! "$release_id" =~ ^[0-9a-f]{40}$ ]]; then
  echo "版本号不是完整 Git SHA：$release_id" >&2
  exit 2
fi
if [[ ! "$expected_checksum" =~ ^[0-9a-f]{64}$ ]]; then
  echo '发布包 SHA-256 格式无效' >&2
  exit 2
fi
if [[ ! "$keep_releases" =~ ^([2-9]|[1-9][0-9]+)$ ]]; then
  echo '保留版本数必须是大于等于 2 的整数' >&2
  exit 2
fi
if [[ "$run_db_migrations" != 'true' && "$run_db_migrations" != 'false' ]]; then
  echo '数据库迁移开关只能是 true 或 false' >&2
  exit 2
fi

releases_dir="$deploy_root/releases"
shared_dir="$deploy_root/shared"
release_dir="$releases_dir/$release_id"
current_link="$deploy_root/current"
previous_target=''
switched=false
created_release=false

cleanup_archive() {
  rm -f -- "$archive"
}

rollback() {
  local exit_code=$?
  trap - ERR
  if [[ "$switched" == true ]]; then
    if [[ -n "$previous_target" && -d "$previous_target" ]]; then
      echo "部署失败，回滚到：$previous_target" >&2
      ln -sfn "$previous_target" "$deploy_root/current.rollback"
      mv -Tf "$deploy_root/current.rollback" "$current_link"
    else
      echo '首次部署探活失败，移除 current 软链接' >&2
      rm -f -- "$current_link"
    fi
    restart_services || true
  fi
  if [[ "$created_release" == true && -d "$release_dir" ]]; then
    rm -rf -- "$release_dir"
  fi
  cleanup_archive
  exit "$exit_code"
}

restart_one() {
  local service="$1"
  [[ "$service" == '-' ]] && return 0
  sudo -n systemctl restart "$service"
}

restart_services() {
  restart_one "$api_service"
}

healthcheck() {
  local url="$1"
  [[ "$url" == '-' ]] && return 0
  curl --fail --silent --show-error \
    --retry 12 --retry-delay 2 --retry-connrefused \
    --max-time 5 "$url" >/dev/null
}

check_app_distribution() {
  # 只读校验，不依赖 RUN_DB_MIGRATIONS，也不要求运行账号具备 DDL 权限。
  # 历史发布包可能不含 App 模块，允许这些包继续使用原部署流程。
  if [[ -f "$1/server/dist/scripts/checkAppDistribution.js" ]]; then
    (cd "$1/server" && node dist/scripts/checkAppDistribution.js)
  fi
}

trap rollback ERR
trap cleanup_archive EXIT

echo "$expected_checksum  $archive" | sha256sum --check --status
mkdir -p "$releases_dir" "$shared_dir/storage/attachments"

if [[ ! -s "$shared_dir/server.env" ]]; then
  echo "缺少 $shared_dir/server.env，请先按 deploy/server.env.example 配置" >&2
  exit 3
fi
if [[ -d "$release_dir" && -L "$current_link" && "$(readlink -f "$current_link")" == "$release_dir" ]]; then
  echo "版本已处于活动状态，重新执行服务探活：$release_id"
  check_app_distribution "$release_dir"
  restart_services
  healthcheck "$api_health_url"
  exit 0
fi
if [[ -e "$release_dir" ]]; then
  echo "版本目录已存在，拒绝覆盖：$release_dir" >&2
  exit 3
fi
if [[ -L "$current_link" ]]; then
  previous_target="$(readlink -f "$current_link")"
elif [[ -e "$current_link" ]]; then
  echo "$current_link 必须是软链接，拒绝覆盖现有文件或目录" >&2
  exit 3
fi

mkdir "$release_dir"
created_release=true
tar -xzf "$archive" -C "$release_dir"
test -f "$release_dir/web/index.html"
test -f "$release_dir/server/dist/index.js"
test -f "$release_dir/server/package-lock.json"

ln -s "$shared_dir/server.env" "$release_dir/server/.env"
ln -s "$shared_dir/storage" "$release_dir/server/storage"

(
  cd "$release_dir/server"
  npm ci --omit=dev --no-audit --no-fund
  if [[ "$run_db_migrations" == 'true' ]]; then
    echo '执行幂等数据库结构升级（不会执行 db:reset）'
    node dist/db/init.js
  fi
)

# 必须在 current 切换前验证新模块的数据结构，缺表时保留旧服务。
check_app_distribution "$release_dir"

ln -s "$release_dir" "$deploy_root/current.next"
mv -Tf "$deploy_root/current.next" "$current_link"
switched=true

restart_services
healthcheck "$api_health_url"

switched=false
created_release=false
echo "部署成功：$release_id"

# 仅清理部署根目录 releases 下的旧版本；当前版本和上一版本始终保留在计数内。
mapfile -t old_releases < <(
  find "$releases_dir" -mindepth 1 -maxdepth 1 -type d -printf '%T@ %p\n' \
    | sort -nr \
    | tail -n "+$((keep_releases + 1))" \
    | cut -d' ' -f2-
)
for old_release in "${old_releases[@]}"; do
  [[ "$old_release" == "$releases_dir"/* ]] || { echo "拒绝清理越界路径：$old_release" >&2; exit 4; }
  rm -rf -- "$old_release"
done
