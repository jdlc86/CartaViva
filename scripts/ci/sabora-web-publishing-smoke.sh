#!/usr/bin/env bash
# One isolated integration: production Caddy image + two real built PWAs +
# real TLS name checks + live API route proxy. CI fixture only; NEVER VPS.
set -euo pipefail
tmp="$(mktemp -d)"
tag="${GITHUB_RUN_ID:-local}-$$"
net="sabora-web-ci-internal-${tag}"
ingress="sabora-web-ci-ingress-${tag}"
web="sabora-web-ci-${tag}"
api="sabora-api-stub-ci-${tag}"
cleanup(){
 local exit_status=$?
 if [ "$exit_status" -ne 0 ]; then
  # CI fixture only: bounded process status and sanitized startup logs, no tokens.
  echo "Sabora HTTPS publication fixture failed (exit $exit_status)" >&2
  docker inspect "$web" --format 'web state={{.State.Status}} exit={{.State.ExitCode}}' >&2 || true
  docker logs --tail 90 "$web" >&2 || true
  curl --noproxy '*' --verbose --max-time 5 --cacert "$tmp/tls/client.crt" \
   --resolve 'client.sabora.test:18443:127.0.0.1' \
   'https://client.sabora.test:18443/' -o /dev/null 2>&1 | tail -n 25 >&2 || true
 fi
 docker rm -f "$web" "$api" >/dev/null 2>&1 || true
 docker network rm "$net" "$ingress" >/dev/null 2>&1 || true
 rm -rf "$tmp"
}
trap cleanup EXIT
mkdir -p "$tmp/tls"
openssl req -x509 -newkey rsa:2048 -nodes -days 1 -keyout "$tmp/tls/client.key" -out "$tmp/tls/client.crt" \
 -subj "/CN=client.sabora.test" -addext "subjectAltName=DNS:client.sabora.test,DNS:management.sabora.test" >/dev/null 2>&1
cp "$tmp/tls/client.crt" "$tmp/tls/management.crt"
cp "$tmp/tls/client.key" "$tmp/tls/management.key"
# Test-only certs; production key permissions are provisioned separately.
chmod 755 "$tmp" "$tmp/tls"
chmod 644 "$tmp/tls/"*
docker network create --internal "$net" >/dev/null
# In CI only: a disposable inbound bridge permits host-port routing. Production
# requires an externally filtered, Sabora-only bridge before any activation.
docker network create "$ingress" >/dev/null
docker run -d --name "$api" --network "$net" --network-alias api --read-only \
 --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges \
 --entrypoint node node:22-alpine -e 'require("node:http").createServer((req,res)=>{res.setHeader("content-type","application/json");res.setHeader("cache-control","no-store");res.end(JSON.stringify({route:req.url,via:"sabora-ci-api"}))}).listen(4100,"0.0.0.0")' >/dev/null
docker run -d --name "$web" --network "$ingress" --read-only --tmpfs /tmp \
 --user 10001:10001 --cap-drop ALL --security-opt no-new-privileges \
 -p 127.0.0.1:18443:8443 -v "$tmp/tls:/run/sabora/tls:ro" \
 -e SABORA_CLIENT_HOST=client.sabora.test \
 -e SABORA_MANAGEMENT_HOST=management.sabora.test \
 -e XDG_CONFIG_HOME=/tmp/caddy-config -e XDG_DATA_HOME=/tmp/caddy-data \
 sabora-web:ci >/dev/null
# API remains on a second, internal-only network; web is the only dual-homed
# frontend. No connection to other CI, Fleetia or host projects.
docker network connect "$net" "$web"
request(){
 local host="$1" path="$2"
 curl --noproxy '*' --silent --show-error --fail \
 --connect-timeout 2 --max-time 8 \
 --cacert "$tmp/tls/client.crt" \
 --resolve "$host:18443:127.0.0.1" \
 "https://$host:18443$path"
}
for attempt in $(seq 1 25); do
 if request client.sabora.test / >"$tmp/client.html" 2>/dev/null; then break; fi
 sleep 1
done
grep -q 'Sabora · Carta digital' "$tmp/client.html"
request management.sabora.test / >"$tmp/management.html"
grep -q 'Sabora · Gestión' "$tmp/management.html"
! cmp -s "$tmp/client.html" "$tmp/management.html"
request client.sabora.test /manifest.webmanifest >"$tmp/client-manifest.json"
request management.sabora.test /manifest.webmanifest >"$tmp/management-manifest.json"
node -e '
const fs=require("node:fs");
const [c,m]=process.argv.slice(1).map(p=>JSON.parse(fs.readFileSync(p,"utf8")));
if(!c.id||!m.id||c.id===m.id)throw Error("non_separate_pwa_identity");
if(c.scope!=="/"||m.scope!=="/")throw Error("unexpected_pwa_scope");
if(!c.name||!m.name)throw Error("manifest_missing_name");
' "$tmp/client-manifest.json" "$tmp/management-manifest.json"
request client.sabora.test /sw.js >"$tmp/client-sw.js"
request management.sabora.test /sw.js >"$tmp/management-sw.js"
! cmp -s "$tmp/client-sw.js" "$tmp/management-sw.js"
request client.sabora.test /api/v1/catalog >"$tmp/api.json"
node -e 'const v=require("node:fs").readFileSync(process.argv[1],"utf8");if(JSON.parse(v).route!=="/api/v1/catalog"||JSON.parse(v).via!=="sabora-ci-api")process.exit(1)' "$tmp/api.json"
request management.sabora.test /api/v1/admin/tables >"$tmp/admin-api.json"
node -e 'const v=JSON.parse(require("node:fs").readFileSync(process.argv[1],"utf8"));if(v.route!=="/api/v1/admin/tables")process.exit(1)' "$tmp/admin-api.json"
# A mismatched TLS name must never be accepted.
if curl --noproxy '*' --silent --fail --max-time 5 --cacert "$tmp/tls/client.crt" \
 --resolve 'other.sabora.test:18443:127.0.0.1' \
 'https://other.sabora.test:18443/' >/dev/null 2>&1; then
 echo 'Unexpected TLS/name acceptance' >&2
 exit 1
fi
echo "PASS: 2 separate PWA builds, valid TLS identities, same-origin API proxy and wrong-host rejection"
