#!/usr/bin/env bash
# Try to add @mastra/core for compatibility CI. Skip (exit 0) if the 7-day
# minimumReleaseAge gate or the registry blocks the install.
set -u

spec="${1:-}"
case "${spec}" in
  min)
    pkg='@mastra/core@1.63.2'
    ;;
  latest)
    pkg='@mastra/core@latest'
    ;;
  *)
    echo "usage: mastra-compat.sh min|latest" >&2
    exit 1
    ;;
esac

if ! pnpm add -wD "${pkg}"; then
  echo "skip: mastra not installable (${pkg})"
  exit 0
fi

pnpm --filter @mastra-evolution/mastra build
pnpm --filter @mastra-evolution/mastra test
