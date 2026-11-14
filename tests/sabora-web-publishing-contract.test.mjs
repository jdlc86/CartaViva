import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const web=readFileSync(new URL('../deploy/compose.sabora-web.yml',import.meta.url),'utf8');
const caddy=readFileSync(new URL('../deploy/Caddyfile.sabora',import.meta.url),'utf8');
const dockerfile=readFileSync(new URL('../deploy/Dockerfile.web',import.meta.url),'utf8');
const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
const entrypoint=readFileSync(new URL('../deploy/entrypoint.sabora-web.sh',import.meta.url),'utf8');
const smoke=readFileSync(new URL('../scripts/ci/sabora-web-publishing-smoke.sh',import.meta.url),'utf8');

test('Sabora PWA publication cannot silently use shared ingress or unscoped operations',()=>{
 assert.match(web,/^name: sabora$/m);
 assert.match(web,/\$\{SABORA_INGRESS_BIND_IP:\?/);
 assert.match(web,/:8443:8443"/);
 assert.doesNotMatch(web,/:443:8443"/);
 assert.match(web,/\$\{SABORA_CLIENT_HOST:\?/);
 assert.match(web,/\$\{SABORA_MANAGEMENT_HOST:\?/);
 assert.match(web,/\$\{SABORA_WEB_TLS_DIRECTORY:\?/);
 assert.match(web,/networks: \[sabora_runtime_internal, sabora_ingress_filtered\]/);
 assert.match(web,/\$\{SABORA_INGRESS_FILTERED_NETWORK:\?/);
 assert.match(web,/sabora_ingress_filtered:[\s\S]*external: true/);
 assert.match(web,/user: "10001:10001"/);
 assert.match(web,/read_only: true/);
 assert.match(web,/cap_drop: \[ALL\]/);
 assert.doesNotMatch(web,/network_mode:\s*host|privileged:\s*true|docker\.sock|fleetia|container_name:|env_file:/i);
 assert.doesNotMatch(web,/\bdepends_on:/);
 assert.match(ci,/--file deploy\/compose\.sabora-web\.yml config --quiet/);
 assert.match(ci,/sabora-web-publishing-smoke\.sh/);
 assert.match(entrypoint,/valid_bind_ip/);
 assert.match(entrypoint,/0\.0\.0\.0/);
 assert.match(smoke,/-p 127\.0\.0\.1:8443:8443/);
 assert.match(smoke,/SABORA_INGRESS_BIND_IP=0\.0\.0\.0/);
});

test('HTTPS virtual hosts are independent and API is proxied without exposing backend',()=>{
 assert.match(caddy,/https:\/\/\{\$SABORA_CLIENT_HOST\}:8443/);
 assert.match(caddy,/https:\/\/\{\$SABORA_MANAGEMENT_HOST\}:8443/);
 assert.equal((caddy.match(/reverse_proxy api:4100/g)||[]).length,2);
 assert.match(caddy,/root \* \/srv\/sabora\/client/);
 assert.match(caddy,/root \* \/srv\/sabora\/management/);
 assert.match(caddy,/Cache-Control "no-store"/);
 assert.equal((caddy.match(/tls \/run\/sabora\/tls\/origin\.crt \/run\/sabora\/tls\/origin\.key/g)||[]).length,2);
 assert.doesNotMatch(caddy,/tls \/run\/sabora\/tls\/(?:client|management)\./);
 assert.match(entrypoint,/for name in origin\.crt origin\.key; do/);
 assert.match(smoke,/subjectAltName=DNS:client\.sabora\.test,DNS:management\.sabora\.test/);
 assert.doesNotMatch(smoke,/cp "\$tmp\/tls\/(?:client|management)\./);
 assert.doesNotMatch(caddy,/reverse_proxy (?:localhost|127\.0\.0\.1):/);
});

test('web image builds two real PWAs with a validated non-secret restaurant code',()=>{
 assert.match(dockerfile,/pnpm --filter @sabora\/client build/);
 assert.match(dockerfile,/pnpm --filter @sabora\/management build/);
 assert.match(dockerfile,/VITE_SABORA_RESTAURANT_CODE/);
 assert.match(dockerfile,/USER 10001:10001/);
 assert.match(dockerfile,/entrypoint\.sabora-web\.sh/);
 assert.doesNotMatch(dockerfile,/COPY \.env|COPY .*\.pem|COPY .*\.key|COPY .*secrets/);
});
