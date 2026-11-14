#!/usr/bin/env bash
set -euo pipefail
# Applies the candidate rules only inside a throwaway Linux network namespace.
# The host ruleset, Docker networks and every persistent system remain outside
# the test boundary. Syntax-only validation is not sufficient for this gate.
if [[ "${GITHUB_ACTIONS:-}" != true || "${CI:-}" != true || -z "${RUNNER_TEMP:-}" ||
      -z "${GITHUB_RUN_ID:-}" || "$(id -u)" -ne 0 ]]; then
 echo 'sabora_nft_lab_stop:root_disposable_actions_context_required' >&2
 exit 1
fi
[[ "${SABORA_NODE_BIN:-}" = /* && -x "${SABORA_NODE_BIN}" ]] || {
 echo 'sabora_nft_lab_stop:absolute_node_binary_required' >&2; exit 1;
}
for tool in ip nft python3 curl sha256sum; do command -v "$tool" >/dev/null; done

suffix="${GITHUB_RUN_ID: -4}$$"
suffix="${suffix: -7}"
rtr="sbr-${suffix}-r"; ext="sbr-${suffix}-x"; web="sbr-${suffix}-w"
app="sbr-${suffix}-a"; dst="sbr-${suffix}-d"
policy="${RUNNER_TEMP}/sabora-network-policy-enforced-${suffix}.nft"
receipt_dir="${RUNNER_TEMP}/sabora-network-enforcement"
pids=(); created_namespaces=(); created_host_links=()
policy_created=false; receipt_owned=false
[[ ! -e "$policy" && ! -e "$receipt_dir" ]] || {
 echo 'sabora_nft_lab_stop:output_preexisted' >&2; exit 1;
}
cleanup(){
 local status=$?
 trap - EXIT
 set +e
 for pid in "${pids[@]:-}"; do kill "$pid" >/dev/null 2>&1 || true; done
 for namespace in "${created_namespaces[@]:-}"; do
  ip netns delete "$namespace" >/dev/null 2>&1 || true
 done
 for link in "${created_host_links[@]:-}"; do
  ip link delete "$link" >/dev/null 2>&1 || true
 done
 if [[ "$policy_created" = true ]]; then rm -f -- "$policy"; fi
 if [[ $status -ne 0 && "$receipt_owned" = true ]]; then rm -rf -- "$receipt_dir"; fi
 exit "$status"
}
trap cleanup EXIT

host_tables_before="$(nft list tables 2>/dev/null | LC_ALL=C sort)"
for namespace in "$rtr" "$ext" "$web" "$app" "$dst"; do
 ip netns add "$namespace"
 created_namespaces=("$namespace" "${created_namespaces[@]}")
 ip -n "$namespace" link set lo up
done

make_pair(){
 local left="$1" right="$2" left_ns="$3" right_ns="$4" left_name="$5" right_name="$6"
 ip link add "$left" type veth peer name "$right"
 created_host_links+=("$left" "$right")
 ip link set "$left" netns "$left_ns"; ip link set "$right" netns "$right_ns"
 ip -n "$left_ns" link set "$left" name "$left_name"
 ip -n "$right_ns" link set "$right" name "$right_name"
}
make_pair "rx${suffix}" "ex${suffix}" "$rtr" "$ext" rx0 ex0
make_pair "ri${suffix}" "wi${suffix}" "$rtr" "$web" ri0 wi0
make_pair "re${suffix}" "ae${suffix}" "$rtr" "$app" re0 ae0
make_pair "rd${suffix}" "dd${suffix}" "$rtr" "$dst" rd0 dd0

ip -n "$rtr" link add br-0123456789ab type bridge
ip -n "$rtr" link add br-abcdef123456 type bridge
ip -n "$rtr" link set ri0 master br-0123456789ab
ip -n "$rtr" link set re0 master br-abcdef123456
for interface in rx0 ri0 re0 rd0 br-0123456789ab br-abcdef123456; do
 ip -n "$rtr" link set "$interface" up
done
for spec in "$ext ex0" "$web wi0" "$app ae0" "$dst dd0"; do
 read -r namespace interface <<< "$spec"; ip -n "$namespace" link set "$interface" up
done

ip -n "$rtr" addr add 198.51.100.1/24 dev rx0
ip -n "$rtr" addr add 192.0.2.1/24 dev rx0
ip -n "$ext" addr add 198.51.100.10/24 dev ex0
ip -n "$ext" addr add 192.0.2.10/24 dev ex0
ip -n "$ext" route add default via 198.51.100.1

ip -n "$rtr" addr add 172.28.240.1/24 dev br-0123456789ab
ip -n "$web" addr add 172.28.240.2/24 dev wi0
ip -n "$web" route add default via 172.28.240.1

ip -n "$rtr" addr add 172.28.241.1/24 dev br-abcdef123456
ip -n "$app" addr add 172.28.241.2/24 dev ae0
ip -n "$app" route add default via 172.28.241.1
ip -n "$rtr" -6 addr add 2001:db8:241::1/64 dev br-abcdef123456
ip -n "$app" -6 addr add 2001:db8:241::2/64 dev ae0
ip -n "$app" -6 route add 2001:db8:113::/64 via 2001:db8:241::1 dev ae0

ip -n "$rtr" addr add 203.0.113.1/24 dev rd0
ip -n "$dst" addr add 203.0.113.10/24 dev dd0
ip -n "$dst" addr add 203.0.113.30/24 dev dd0
ip -n "$dst" route add default via 203.0.113.1
ip -n "$rtr" -6 addr add 2001:db8:113::1/64 dev rd0
ip -n "$dst" -6 addr add 2001:db8:113::10/64 dev dd0
ip -n "$dst" -6 route add 2001:db8:241::/64 via 2001:db8:113::1 dev dd0
ip netns exec "$rtr" sysctl -qw net.ipv4.ip_forward=1
ip netns exec "$rtr" sysctl -qw net.ipv6.conf.all.forwarding=1

serve(){
 local namespace="$1" address="$2" port="$3"
 if [[ "$address" == *:* ]]; then
  ip netns exec "$namespace" python3 -c '
import socket,sys
server=socket.socket(socket.AF_INET6,socket.SOCK_STREAM)
server.setsockopt(socket.SOL_SOCKET,socket.SO_REUSEADDR,1)
server.bind((sys.argv[1],int(sys.argv[2])))
server.listen(8)
while True:
 connection,_=server.accept()
 try:
  connection.recv(8192)
  connection.sendall(b"HTTP/1.1 200 OK\r\nContent-Length: 2\r\nConnection: close\r\n\r\nok")
 finally:
  connection.close()
' "$address" "$port" >/dev/null 2>&1 &
 else
  ip netns exec "$namespace" python3 -m http.server "$port" --bind "$address" >/dev/null 2>&1 &
 fi
 pids+=("$!")
}
serve "$web" 172.28.240.2 8443
serve "$web" 172.28.240.2 9443
serve "$ext" 198.51.100.10 9443
serve "$dst" 203.0.113.10 443
serve "$dst" 203.0.113.10 8443
serve "$dst" 203.0.113.30 443
serve "$dst" 2001:db8:113::10 7443

request(){
 local namespace="$1"; shift
 ip netns exec "$namespace" curl --noproxy '*' --silent --show-error --fail \
  --connect-timeout 1 --max-time 2 "$@" >/dev/null 2>&1
}
must_reach(){
 local label="$1"; shift
 for attempt in 1 2 3 4 5; do if request "$@"; then return 0; fi; sleep 0.2; done
 if [[ "$label" = egress_ipv6_pre ]]; then
  ip -n "$app" -6 address show >&2; ip -n "$app" -6 route show >&2
  ip -n "$rtr" -6 address show >&2; ip -n "$rtr" -6 route show >&2
  ip -n "$dst" -6 address show >&2; ip -n "$dst" -6 route show >&2
  ip netns exec "$dst" ss -lnt6 >&2 || true
  ip netns exec "$app" curl --noproxy '*' --verbose --connect-timeout 1 --max-time 2 \
   http://[2001:db8:113::10]:7443/ >&2 || true
 fi
 echo "sabora_nft_lab_stop:expected_reachable:${label}" >&2; exit 1
}
must_block(){
 local label="$1"; shift
 if request "$@"; then echo "sabora_nft_lab_stop:unexpected_reachable:${label}" >&2; exit 1; fi
}

# Establish that every negative endpoint is genuinely reachable before policy.
must_reach ingress_allowed_pre "$ext" --interface 198.51.100.10 http://172.28.240.2:8443/
must_reach ingress_direct_pre "$ext" --interface 192.0.2.10 http://172.28.240.2:8443/
must_reach ingress_wrong_port_pre "$ext" --interface 198.51.100.10 http://172.28.240.2:9443/
must_reach ingress_reverse_pre "$web" http://198.51.100.10:9443/
must_reach egress_allowed_pre "$app" http://203.0.113.10:443/
must_reach egress_wrong_port_pre "$app" http://203.0.113.10:8443/
must_reach egress_wrong_ip_pre "$app" http://203.0.113.30:443/
must_reach egress_ipv6_pre "$app" http://[2001:db8:113::10]:7443/

policy_created=true
"$SABORA_NODE_BIN" scripts/ci/sabora-nftables-lab-fixture.mjs "$policy"
ip netns exec "$rtr" nft --check --file "$policy"
ip netns exec "$rtr" nft --file "$policy"
ip netns exec "$rtr" nft list table inet sabora_ingress_guard >/dev/null
ip netns exec "$rtr" nft list table inet sabora_egress_guard >/dev/null

must_reach ingress_cloudflare_exact "$ext" --interface 198.51.100.10 http://172.28.240.2:8443/
must_block ingress_direct_origin "$ext" --interface 192.0.2.10 http://172.28.240.2:8443/
must_block ingress_wrong_port "$ext" --interface 198.51.100.10 http://172.28.240.2:9443/
must_block ingress_container_outbound "$web" http://198.51.100.10:9443/
must_reach egress_exact_destination "$app" http://203.0.113.10:443/
must_block egress_wrong_port "$app" http://203.0.113.10:8443/
must_block egress_wrong_ipv4 "$app" http://203.0.113.30:443/
must_block egress_ipv6_default_deny "$app" http://[2001:db8:113::10]:7443/

ip netns exec "$rtr" nft delete table inet sabora_ingress_guard
ip netns exec "$rtr" nft delete table inet sabora_egress_guard
if ip netns exec "$rtr" nft list tables | grep -q 'sabora_'; then
 echo 'sabora_nft_lab_stop:rollback_left_sabora_tables' >&2; exit 1
fi
must_reach rollback_ingress_restored "$ext" --interface 192.0.2.10 http://172.28.240.2:8443/
must_reach rollback_egress_restored "$app" http://203.0.113.30:443/
host_tables_after="$(nft list tables 2>/dev/null | LC_ALL=C sort)"
[[ "$host_tables_before" == "$host_tables_after" ]] || {
 echo 'sabora_nft_lab_stop:host_table_inventory_changed' >&2; exit 1;
}

mkdir -m 0755 "$receipt_dir"
receipt_owned=true
policy_sha="$(sha256sum "$policy" | cut -d' ' -f1)"
printf '%s\n' \
 '{' \
 '  "schema": "sabora-nft-enforcement-lab/v1",' \
 "  \"runId\": \"${GITHUB_RUN_ID}\"," \
 "  \"policySha256\": \"${policy_sha}\"," \
 '  "appliedOnlyInsideDisposableNamespace": true,' \
 '  "hostTableInventoryUnchanged": true,' \
 '  "ingressAllowedExactSourcePort": true,' \
 '  "ingressDirectWrongPortAndReverseDenied": true,' \
 '  "egressAllowedExactIpv4Port": true,' \
 '  "egressWrongIpv4PortAndIpv6Denied": true,' \
 '  "rollbackRemovedBothSaboraTables": true,' \
 '  "operationalHostReceipt": false' \
 '}' > "${receipt_dir}/receipt.json"
chmod 0644 "${receipt_dir}/receipt.json"
echo "sabora_nft_enforcement_lab_ok:${policy_sha}"
