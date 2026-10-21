#!/usr/bin/env bash
# Re-observe GitHub READMEs for Hub plugins whose README fact was recorded as
# unavailable, then upsert the fresh observation so the public page can pass the
# indexability gate again.
#
# Usage: backfill-readme.sh LIST.tsv [offset] [limit] [parallelism]
#   LIST.tsv: one "slug<TAB>owner/repo" per line.
#
# Each item writes OUT_DIR/results/<slug>.json ({slug, repo, status, detail}).
# Re-running skips items that already recorded an upsert, so a run can resume.
set -uo pipefail

LIST=${1:?need a slug<TAB>repo list}
OFFSET=${2:-0}
LIMIT=${3:-0}
PARALLEL=${4:-4}
CLI=${DSHX_HUB_CLI:-packages/framework-hub-cli/dist/index.js}
OUT_DIR=${OUT_DIR:-/tmp/dshx-readme-backfill}
TOKEN_FILE=${TOKEN_FILE:-/tmp/.dshx-gh-token}

mkdir -p "$OUT_DIR/obs" "$OUT_DIR/upsert" "$OUT_DIR/results"

rows=$(tail -n +$((OFFSET + 1)) "$LIST")
if [ "$LIMIT" -gt 0 ]; then rows=$(printf '%s\n' "$rows" | head -n "$LIMIT"); fi

emit() {
  slug=$1 repo=$2 status=$3 detail=${4:-}
  python3 - "$OUT_DIR/results/$slug.json" "$slug" "$repo" "$status" "$detail" <<'PY'
import json, sys
path, slug, repo, status, detail = sys.argv[1:6]
with open(path, "w") as fh:
    json.dump({"slug": slug, "repo": repo, "status": status, "detail": detail[:400]}, fh)
    fh.write("\n")
PY
}

# The REST budget is shared by every worker and is drained by blob reads, so
# park the run while it is nearly empty instead of burning a retryable failure.
wait_for_budget() {
  local snapshot remaining reset now pause
  while :; do
    snapshot=$(curl -s --max-time 20 \
      -H "Authorization: Bearer $(cat "$TOKEN_FILE")" \
      https://api.github.com/rate_limit)
    remaining=$(printf '%s' "$snapshot" |
      python3 -c 'import json,sys; print(json.load(sys.stdin)["resources"]["core"]["remaining"])' 2>/dev/null || echo 0)
    if [ "${remaining:-0}" -gt 15 ]; then return 0; fi
    reset=$(printf '%s' "$snapshot" |
      python3 -c 'import json,sys; print(json.load(sys.stdin)["resources"]["core"]["reset"])' 2>/dev/null || echo 0)
    now=$(date +%s)
    pause=$((reset - now + 5))
    [ "$pause" -lt 30 ] && pause=60
    [ "$pause" -gt 3600 ] && pause=3600
    echo "budget exhausted (remaining=$remaining); sleeping ${pause}s until reset" >&2
    sleep "$pause"
  done
}

readme_states() {
  python3 - "$1" <<'PY'
import json, sys
try:
    doc = json.load(open(sys.argv[1]))
except Exception:
    print("unknown"); raise SystemExit
data = doc.get("data", doc)
items = data.get("observations", data) if isinstance(data, dict) else data
if isinstance(items, dict):
    items = [items]
values = []
for item in items or []:
    readme = (item.get("facts") or {}).get("readme") or {}
    values.append(str(readme.get("availability")))
print(",".join(sorted(set(values))) or "none")
PY
}

# plugin upsert exits 0 even when it rejects an item, so the result has to come
# from the response body: any rejection leaves the stored README untouched.
upsert_outcome() {
  python3 - "$1" <<'PY'
import json, sys
try:
    doc = json.load(open(sys.argv[1]))
except Exception:
    print("rejected unreadable response"); raise SystemExit
results = ((doc.get("data") or {}).get("results")) or []
if not results:
    print("rejected no results"); raise SystemExit
for item in results:
    if item.get("status") == "rejected":
        code = ((item.get("error") or {}).get("code")) or "rejected"
        print(f"rejected {code}")
        raise SystemExit
print("upserted " + ",".join(sorted({str(i.get("status")) for i in results})))
PY
}

run_one() {
  local line=$1 slug repo obs up attempt
  slug=${line%%$'\t'*}
  repo=${line#*$'\t'}
  [ -z "$slug" ] && return 0
  [ -f "$OUT_DIR/results/$slug.json" ] &&
    grep -q '"status": "upserted"' "$OUT_DIR/results/$slug.json" && return 0

  obs="$OUT_DIR/obs/$slug.json"
  wait_for_budget
  for attempt in 1 2 3; do
    if GITHUB_TOKEN=$(cat "$TOKEN_FILE") node "$CLI" source inspect "github:$repo" --output "$obs" \
        >"$OUT_DIR/obs/$slug.stdout" 2>&1; then break; fi
    if grep -q "github_rate_limited\|unreachable" "$OUT_DIR/obs/$slug.stdout"; then
      sleep $((attempt * 60))
      continue
    fi
    break
  done
  if [ ! -s "$obs" ]; then
    emit "$slug" "$repo" inspect_failed "$(tr -d '\n' <"$OUT_DIR/obs/$slug.stdout" | head -c 300)"
    return 0
  fi

  up="$OUT_DIR/upsert/$slug.json"
  node "$CLI" plugin upsert --input "$obs" --output "$up" >"$OUT_DIR/upsert/$slug.stdout" 2>&1
  if [ ! -s "$up" ]; then
    emit "$slug" "$repo" upsert_failed "$(tr -d '\n' <"$OUT_DIR/upsert/$slug.stdout" | head -c 300)"
    return 0
  fi

  local outcome kind detail
  outcome=$(upsert_outcome "$up")
  kind=${outcome%% *}
  detail=${outcome#* }
  emit "$slug" "$repo" "$kind" "readme=$(readme_states "$obs") $detail"
}

# bash 3.2 has no `wait -n`, so let xargs own the pool. NUL-separated records keep
# the slug<TAB>repo pair intact (whitespace-separated mode splits on the tab).
export -f run_one wait_for_budget emit readme_states upsert_outcome
export CLI OUT_DIR TOKEN_FILE LIST OFFSET LIMIT PARALLEL
printf '%s\n' "$rows" | tr '\n' '\0' | xargs -0 -P "$PARALLEL" -I{} bash -c 'run_one "$1"' _ "{}"
