#!/usr/bin/env bash
set -euo pipefail

tarball=$(realpath "$1")
work=$(mktemp -d)
cd "$work"
npm init -y > /dev/null
npm install --no-audit --no-fund "$tarball"

npx loopcraft init --sample
npx loopcraft validate diagram.json
npx loopcraft loops diagram.json --format md
npx loopcraft check diagram.json --format json > /dev/null
# PNG は resvg のネイティブモジュールを使うので、パッケージから入れた状態で確かめる
npx loopcraft render diagram.json -o diagram.png
head -c 8 diagram.png | od -An -c | grep -q 'P   N   G'

# npx を挟むと $! が npx になり、止めてもサーバーが残るので、直接起動する
./node_modules/.bin/loopcraft serve diagram.json --no-open --port 4799 > serve.log 2>&1 &
server=$!
finish() {
  local status=$?
  kill "$server" 2> /dev/null || true
  if [ "$status" -ne 0 ]; then
    echo "--- serve.log"
    cat serve.log
  fi
}
trap finish EXIT
for _ in $(seq 1 40); do
  grep -q "token=" serve.log && break
  sleep 0.25
done
url=$(grep -o 'http://127.0.0.1:4799/?token=[^ ]*' serve.log)
curl -fsS "$url" | grep -q 'name="loopcraft-session"'
echo "smoke test passed: $(basename "$tarball")"
