#!/usr/bin/env bash
set -euo pipefail
# Disposable GitHub Actions runner only: local Vite preview, no backend or external data.
output=/tmp/sabora-management-visual-smoke
mkdir -p "$output"
pnpm --filter @sabora/management exec vite preview --host 127.0.0.1 --port 4178 --strictPort >"$output/preview.log" 2>&1 &
server_pid=$!
trap 'kill "$server_pid" 2>/dev/null || true' EXIT
ready=0
for attempt in $(seq 1 30); do
  if curl --fail --silent --output /dev/null http://127.0.0.1:4178/; then ready=1; break; fi
  sleep 1
done
if [[ "$ready" != 1 ]]; then
  cat "$output/preview.log"
  echo 'Local management preview did not start' >&2
  exit 1
fi
for width in 360 460 900 1440; do
  for area in resumen comandas; do
    target="$output/${area}-${width}.png"
    timeout --signal=TERM --kill-after=5s 45s npm exec --yes --package=playwright@1.56.1 -- playwright screenshot \
      --browser chromium --viewport-size "${width},900" --full-page \
      --wait-for-timeout 500 "http://127.0.0.1:4178/#${area}" "$target"
    test -s "$target"
    file "$target" | grep -q 'PNG image data'
  done
done
printf 'Captured %s PNG screenshots from isolated localhost preview\n' "$(find "$output" -name '*.png' | wc -l)"
