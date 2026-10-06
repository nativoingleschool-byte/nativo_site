#!/usr/bin/env bash
set -euo pipefail

# Uso:
#   ./scripts/prepare-supabase-real.sh --check
#   ./scripts/prepare-supabase-real.sh --build
#
# O script não imprime nem grava valores de secrets. Ele apenas valida que o
# deployment não está forçado ao modo visual e que as variáveis públicas foram
# configuradas antes de voltar a testar com os dados reais.

MODE="${1:---check}"

if [[ "$MODE" != "--check" && "$MODE" != "--build" ]]; then
  echo "Uso: $0 [--check|--build]" >&2
  exit 2
fi

if [[ -n "${VITE_VISUAL_PREVIEW:-}" && "${VITE_VISUAL_PREVIEW}" == "true" ]]; then
  echo "ERRO: VITE_VISUAL_PREVIEW=true ainda está ativo. Remova essa variável do Preview antes de testar o Supabase real." >&2
  exit 1
fi

if [[ -z "${VITE_SUPABASE_URL:-}" ]]; then
  echo "ERRO: VITE_SUPABASE_URL não está disponível neste ambiente." >&2
  exit 1
fi

if [[ -z "${VITE_SUPABASE_ANON_KEY:-}" ]]; then
  echo "ERRO: VITE_SUPABASE_ANON_KEY não está disponível neste ambiente." >&2
  exit 1
fi

if [[ "$VITE_SUPABASE_URL" != https://* ]]; then
  echo "ERRO: VITE_SUPABASE_URL deve usar HTTPS." >&2
  exit 1
fi

if [[ -n "${VITE_SUPABASE_SERVICE_ROLE_KEY:-}" || -n "${SUPABASE_SERVICE_ROLE_KEY:-}" ]]; then
  echo "AVISO: uma service role key foi encontrada no ambiente. Ela não deve ser exposta ao bundle Vite; mantenha-a somente nas funções Vercel." >&2
fi

echo "OK: Supabase público configurado e modo visual não forçado."
echo "Próximo passo: publicar esta branch/mergear o código e testar login, leitura e escrita com uma conta de professor real."

if [[ "$MODE" == "--build" ]]; then
  npm run lint
  npm run build
fi
