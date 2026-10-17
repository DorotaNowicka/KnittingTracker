#!/usr/bin/env sh
# Serve apps/web/dist with the production nginx configuration (docker/nginx/) on :8080, without
# Docker. Used to run the e2e suite against the real headers and caching rules:
#
#   pnpm build && scripts/serve-nginx.sh
#   E2E_BASE_URL=http://localhost:8080 pnpm e2e
#   scripts/serve-nginx.sh stop
#
# Needs a local nginx (any recent version). Writes its temporary files to ./.nginx-local/.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
dir="$root/.nginx-local"
if [ "${1:-}" = "stop" ]; then
  [ -f "$dir/nginx.pid" ] && kill "$(cat "$dir/nginx.pid")" && echo "stopped"
  exit 0
fi
mkdir -p "$dir/tmp"
sed -e "s#/usr/share/nginx/html#$root/apps/web/dist#" \
    -e "s#/etc/nginx/snippets/security-headers.conf#$root/docker/nginx/security-headers.conf#" \
    "$root/docker/nginx/default.conf" > "$dir/site.conf"
mime=/etc/nginx/mime.types
[ -f "$mime" ] || mime=/usr/local/etc/nginx/mime.types
[ -f "$mime" ] || mime=/opt/homebrew/etc/nginx/mime.types
cat > "$dir/nginx.conf" <<CONF
worker_processes 1;
pid $dir/nginx.pid;
error_log $dir/error.log;
events { worker_connections 256; }
http {
  include $mime;
  default_type application/octet-stream;
  access_log off;
  client_body_temp_path $dir/tmp;
  sendfile on;
  include $dir/site.conf;
}
CONF
nginx -t -c "$dir/nginx.conf"
nginx -c "$dir/nginx.conf"
echo "serving $root/apps/web/dist on http://localhost:8080"
