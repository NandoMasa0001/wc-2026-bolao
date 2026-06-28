#!/usr/bin/env bash
# Deploy do app (Cloudflare Workers) por liga.
#
#   ./scripts/deploy.sh trupe      # só a trupe   -> worker wc-2026-bolao
#   ./scripts/deploy.sh familia    # só a família -> worker bolaofamilia
#   ./scripts/deploy.sh scib       # só a scib    -> worker bolao-scib
#   ./scripts/deploy.sh all        # as três
#
# Cada liga é buildada com o Supabase DELA (as VITE_* são embutidas no
# build via "mode" do Vite). Há um GUARD que aborta se o bundle gerado não
# apontar pro Supabase esperado — assim nunca dá pra subir a trupe no lugar
# da família por engano.
#
# Pré-requisito p/ família e scib: o .env.<liga> precisa ter as DUAS linhas
#   VITE_SUPABASE_URL=...        VITE_SUPABASE_ANON_KEY=...   (chave publishable)
# (.env* é gitignored — pode guardar sem medo.)
set -euo pipefail
cd "$(dirname "$0")/.."

deploy_one() {
  local league="$1" mode wenv worker envfile expected
  case "$league" in
    trupe)   mode="production"; wenv="";              worker="wc-2026-bolao"; envfile=".env" ;;
    familia) mode="familia";    wenv="--env familia"; worker="bolaofamilia";  envfile=".env.familia" ;;
    scib)    mode="scib";       wenv="--env scib";    worker="bolao-scib";    envfile=".env.scib" ;;
    *) echo "Liga desconhecida: $league (use trupe|familia|scib|all)"; return 1 ;;
  esac

  # Host de Supabase esperado, pra validar o build depois.
  expected=$(grep -E '^(VITE_)?SUPABASE_URL=' "$envfile" | head -1 \
             | sed -E 's#.*//([^/.]+\.supabase\.co).*#\1#')
  if [ -z "$expected" ]; then
    echo "✗ [$league] não achei SUPABASE_URL em $envfile"; return 1
  fi

  echo "==> [$league] build (mode=$mode, esperado: $expected)"
  npx vite build --mode "$mode"

  # GUARD: o bundle TEM que conter o Supabase da liga. Se não, o build pegou
  # o .env errado (provavelmente faltam as VITE_* no $envfile) — aborta.
  if ! grep -rq "$expected" dist/assets/*.js; then
    echo "✗ [$league] o build NÃO aponta pra $expected."
    echo "   Confere se VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY estão em $envfile."
    return 1
  fi

  echo "==> [$league] deploy → worker $worker"
  npx wrangler deploy $wenv
  echo "✓ [$league] no ar (Supabase $expected)."
}

case "${1:-trupe}" in
  all) for l in trupe familia scib; do deploy_one "$l"; echo; done ;;
  *)   deploy_one "${1:-trupe}" ;;
esac
