import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const web=readFileSync(new URL('../deploy/compose.sabora-web.yml',import.meta.url),'utf8');
const caddy=readFileSync(new URL('../deploy/Caddyfile.sabora',import.meta.url),'utf8');
const dockerfile=readFileSync(new URL('../deploy/Dockerfile.web',import.meta.url),'utf8');
const ci=readFileSync(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');

test('Sabora PWA publication cannot silently use shared ingress or unscoped operations',()=>{
 assert.match(web,/^name: sabora$/m);
 assert.match(web,/\$\{SABORA_INGRESS_BIND_IP:\?/);
 assert.match(web,/\$\{SABORA_CLIENT_HOST:\?/);
 assert.match(web,/\$\{SABORA_MANAGEMENT_HOST:\?/);
 assert.match(web,/\$\{SABORA_WEB_TLS_DIRECTORY:\?/);
 assert.match(web,/networks: \[sabora_runtime_internal\]/);
 assert.match(web,/user: "10001:10001"/);
 assert.match(web,/read_only: true/);
 assert.match(web,/cap_drop: \[ALL\]/);
 assert.doesNotMatch(web,/network_mode:\s*host|privileged:\s*true|docker\.sock|fleetia|container_name:|env_file:/i);
 assert.doesNotMatch(web,/\bdepends_on:/);
 assert.match(ci,/--file deploy\/compose\.sabora-web\.yml config --quiet/);
 assert.match(ci,/sabora-web-publishing-smoke\.sh/);
});

test('HTTPS virtual hosts are independent and API is proxied without exposing backend',()=>{
 assert.match(caddy,/https:\/\/\{\$SABORA_CLIENT_HOST\}:8443/);
 assert.match(caddy,/https:\/\/\{\$SABORA_MANAGEMENT_HOST\}:8443/);
 assert.equal((caddy.match(/reverse_proxy api:4100/g)||[]).length,2);
 assert.match(caddy,/root \* \/srv\/sabora\/client/);
 assert.match(caddy,/root \* \/srv\/sabora\/management/);
 assert.match(caddy,/Cache-Control "no-store"/);
 assert.match(caddy,/tls \/run\/sabora\/tls\/client\.crt \/run\/sabora\/tls\/client\.key/);
 assert.match(caddy,/tls \/run\/sabora\/tls\/management\.crt \/run\/sabora\/tls\/management\.key/);
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
