#!/usr/bin/env bash
# Run the actual activation script with fake services and an isolated release tree.
set -Eeuo pipefail
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
scratch="$(mktemp -d)"
trap 'rm -rf -- "$scratch"' EXIT
deploy_root="$scratch/app"
previous="$deploy_root/releases/previous"
sha=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
mkdir -p "$previous" "$deploy_root/shared" "$scratch/bin" "$scratch/bundle/web" "$scratch/bundle/server/dist/scripts"
printf 'test-only\n' > "$deploy_root/shared/server.env"
printf '<html></html>\n' > "$scratch/bundle/web/index.html"
touch "$scratch/bundle/server/dist/index.js" "$scratch/bundle/server/dist/scripts/checkAppDistribution.js"
printf '{}\n' > "$scratch/bundle/server/package-lock.json"
ln -s "$previous" "$deploy_root/current"
export OPERATIONS="$scratch/operations" ACTIVE_LINK="$deploy_root/current" EXPECTED_ACTIVE="$previous"
cat > "$scratch/bin/node" <<'MOCK'
#!/usr/bin/env bash
set -eu
[[ "$1" == dist/scripts/checkAppDistribution.js ]]
[[ "$(readlink -f "$ACTIVE_LINK")" == "$EXPECTED_ACTIVE" ]]
echo schema >> "$OPERATIONS"
[[ "$SCHEMA_READY" == true ]]
MOCK
for command in npm sudo curl; do
  printf '#!/usr/bin/env bash\necho %s >> "$OPERATIONS"\n' "$command" > "$scratch/bin/$command"
done
chmod +x "$scratch/bin/"*
export PATH="$scratch/bin:$PATH"
package() {
  tar -czf "$scratch/release.tar.gz" -C "$scratch/bundle" web server
  checksum="$(sha256sum "$scratch/release.tar.gz" | cut -d' ' -f1)"
}
activate() {
  bash "$script_dir/remote-deploy.sh" "$scratch/release.tar.gz" "$checksum" "$deploy_root" "$sha" api http://localhost/api/health 5 false
}
# Missing schema must fail before switching or restarting, even with migrations disabled.
export SCHEMA_READY=false
package
if activate > "$scratch/missing.log" 2>&1; then echo 'Missing schema unexpectedly activated' >&2; exit 1; fi
[[ "$(readlink -f "$deploy_root/current")" == "$previous" ]]
[[ ! -e "$deploy_root/releases/$sha" ]]
[[ "$(cat "$OPERATIONS")" == $'npm\nschema' ]]
# A ready database activates normally; checks run before any service restart.
export SCHEMA_READY=true
: > "$OPERATIONS"
package
activate > "$scratch/ready.log" 2>&1
[[ "$(readlink -f "$deploy_root/current")" == "$deploy_root/releases/$sha" ]]
[[ "$(cat "$OPERATIONS")" == $'npm\nschema\nsudo\ncurl' ]]
# Retrying the active revision still checks schema and leaves it intact on failure.
export SCHEMA_READY=false EXPECTED_ACTIVE="$deploy_root/releases/$sha"
: > "$OPERATIONS"
package
if activate > "$scratch/retry.log" 2>&1; then echo 'Active revision skipped schema validation' >&2; exit 1; fi
[[ -d "$deploy_root/releases/$sha" ]]
[[ "$(cat "$OPERATIONS")" == schema ]]
echo 'PASS: missing schema blocks activation; ready schema activates; retries validate again'
