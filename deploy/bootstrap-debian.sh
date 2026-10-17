#!/usr/bin/env bash
# Debian 12 首次部署准备：安装 Node.js 24、Nginx、MySQL 8.4 LTS、中文字体与交换空间。
set -Eeuo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo '请使用 root 执行此脚本' >&2
  exit 1
fi

. /etc/os-release
if [[ "${ID:-}" != 'debian' || "${VERSION_ID:-}" != '12' ]]; then
  echo "当前仅支持 Debian 12，检测到：${PRETTY_NAME:-unknown}" >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

echo '--- 配置 2GB 交换空间 ---'
if ! swapon --show=NAME --noheadings | grep -qx '/swapfile'; then
  if [[ ! -f /swapfile ]]; then
    fallocate -l 2G /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
  fi
  swapon /swapfile
fi
grep -qF '/swapfile none swap sw 0 0' /etc/fstab \
  || printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab

echo '--- 安装基础软件 ---'
apt-get update -qq
apt-get install -y --no-install-recommends \
  ca-certificates curl xz-utils nginx sudo openssl fonts-arphic-gbsn00lp gnupg

echo '--- 安装 Node.js 24 官方二进制包 ---'
if ! command -v node >/dev/null || [[ "$(node --version)" != v24.* ]]; then
  temp_dir="$(mktemp -d)"
  trap 'rm -rf "$temp_dir"' EXIT
  curl -fsSL https://nodejs.org/dist/latest-v24.x/SHASUMS256.txt \
    -o "$temp_dir/SHASUMS256.txt"
  node_archive="$(awk '$2 ~ /^node-v24\..*-linux-x64\.tar\.xz$/ { print $2; exit }' \
    "$temp_dir/SHASUMS256.txt")"
  [[ "$node_archive" =~ ^node-v24\.[0-9]+\.[0-9]+-linux-x64\.tar\.xz$ ]] \
    || { echo '无法解析 Node.js 24 发布包名称' >&2; exit 1; }
  curl -fsSL "https://nodejs.org/dist/latest-v24.x/$node_archive" \
    -o "$temp_dir/$node_archive"
  (
    cd "$temp_dir"
    grep "  $node_archive$" SHASUMS256.txt | sha256sum --check --strict -
  )
  node_dir="${node_archive%.tar.xz}"
  tar -xJf "$temp_dir/$node_archive" -C /opt
  ln -sfn "/opt/$node_dir" /opt/node
  for executable in node npm npx corepack; do
    ln -sfn "/opt/node/bin/$executable" "/usr/local/bin/$executable"
  done
fi

echo '--- 安装 MySQL 8.4 LTS 官方 APT 包 ---'
if ! command -v mysql >/dev/null; then
  mysql_apt='/tmp/mysql-apt-config_0.8.40-1_all.deb'
  curl -fsSL https://dev.mysql.com/get/mysql-apt-config_0.8.40-1_all.deb \
    -o "$mysql_apt"
  echo '981ff0a16aab27a0cd97f4c4ee49e9fd  /tmp/mysql-apt-config_0.8.40-1_all.deb' \
    | md5sum --check --strict -
  printf '%s\n' \
    'mysql-apt-config mysql-apt-config/select-server select mysql-8.4-lts' \
    | debconf-set-selections
  dpkg -i "$mysql_apt"
  rm -f "$mysql_apt"
  apt-get update -qq
  apt-get install -y mysql-server
fi

systemctl enable --now nginx mysql

echo '--- 安装结果 ---'
/usr/local/bin/node --version
/usr/local/bin/npm --version
nginx -v 2>&1
mysql --version
systemctl is-active nginx mysql
free -h
