#!/bin/sh
set -e


find /config ! -user peertube -exec chown peertube {} \; || true

# first arg is `-f` or `--some-option`
# or first arg is `something.conf`
if [ "${1#-}" != "$1" ] || [ "${1%.conf}" != "$1" ]; then
    set -- node "$@"
fi

# allow the container to be started with `--user`
if [ "$1" = 'node' -a "$(id -u)" = '0' ]; then
    find /data ! -user peertube -exec chown peertube {} \;
    exec gosu peertube "$0" "$@"
fi

# Apply custom plugin patches (idempotent, non-fatal). Runs as the peertube
# user so it can write to /data/plugins. See support/docker/production/patches/.
if [ "$1" = 'node' ] && [ -f /usr/local/bin/patch-nvenc-av1.js ]; then
    node /usr/local/bin/patch-nvenc-av1.js || true
fi

exec "$@"
