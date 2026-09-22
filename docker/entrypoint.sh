#!/bin/sh
# Entrypoint for the unified examples image.
#
# Renders deployment-specific runtime config (accounts domain + OAuth client
# IDs) into a config.js consumed by each app (see
# shared/src/lib/runtime-config.ts), enables the subset of apps requested via
# EXAMPLES_ENABLED_APPS, and removes the rest from the served tree. Launchpad is the
# index page at / and is always served.
set -eu

ALL_APPS="tasks notes photos board chat passwords"
# Accept space- or comma-separated lists.
EXAMPLES_ENABLED_APPS="$(printf '%s' "${EXAMPLES_ENABLED_APPS:-$ALL_APPS}" | tr ',' ' ')"
DOMAIN="${EXAMPLES_ACCOUNTS_DOMAIN:-localhost:5377}"

# Values are embedded into a <script> body — only allow conservative
# hostname/client-ID characters through.
valid_value() {
  case "$1" in
    ''|*[!A-Za-z0-9.:_-]*) return 1 ;;
    *) return 0 ;;
  esac
}

if ! valid_value "$DOMAIN"; then
  echo "entrypoint: invalid EXAMPLES_ACCOUNTS_DOMAIN: $DOMAIN" >&2
  exit 1
fi

client_id() {
  case "$1" in
    launchpad) echo "${LAUNCHPAD_CLIENT_ID:-}" ;;
    tasks) echo "${TASKS_CLIENT_ID:-}" ;;
    notes) echo "${NOTES_CLIENT_ID:-}" ;;
    photos) echo "${PHOTOS_CLIENT_ID:-}" ;;
    board) echo "${BOARD_CLIENT_ID:-}" ;;
    chat) echo "${CHAT_CLIENT_ID:-}" ;;
    passwords) echo "${PASSWORDS_CLIENT_ID:-}" ;;
    *) echo "" ;;
  esac
}

app_dir() {
  if [ "$1" = "launchpad" ]; then
    echo "/srv"
  else
    echo "/srv/$1"
  fi
}

enabled() {
  case " launchpad $EXAMPLES_ENABLED_APPS " in
    *" $1 "*) return 0 ;;
    *) return 1 ;;
  esac
}

# Fail fast on unknown app names — a typo would otherwise silently drop
# the app from the portal.
for app in $EXAMPLES_ENABLED_APPS; do
  case " launchpad $ALL_APPS " in
    *" $app "*) ;;
    *) echo "entrypoint: unknown app in EXAMPLES_ENABLED_APPS: $app" >&2; exit 1 ;;
  esac
done

# Build the apps object (launchpad plus each enabled app). Apps without a
# client ID are still served but omitted from the config (their login
# buttons will not complete OAuth).
APPS_JS=""
for app in launchpad $ALL_APPS; do
  enabled "$app" || continue
  id="$(client_id "$app")"
  if [ -z "$id" ]; then
    echo "entrypoint: warning: no client ID for $app (login disabled there)" >&2
    continue
  fi
  if ! valid_value "$id"; then
    echo "entrypoint: invalid client ID for $app" >&2
    exit 1
  fi
  APPS_JS="$APPS_JS  $app: { clientId: \"$id\" },
"
done

CONFIG_JS="window.__BETTERBASE__ = {
  domain: \"$DOMAIN\",
  apps: {
$APPS_JS  },
};
"

# Write config.js into every enabled app dir and inject the script tag into
# its built index.html (idempotent). Disable apps by removing their trees.
for app in launchpad $ALL_APPS; do
  dir="$(app_dir "$app")"
  if enabled "$app"; then
    printf '%s' "$CONFIG_JS" > "$dir/config.js"
    if ! grep -q 'src="./config.js"' "$dir/index.html"; then
      sed -i 's|<head>|<head><script src="./config.js"></script>|' "$dir/index.html"
    fi
  elif [ -d "$dir" ]; then
    rm -rf "$dir"
  fi
done

exec "$@"
