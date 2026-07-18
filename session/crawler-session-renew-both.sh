#!/usr/bin/env bash
set -u
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
status=0
"$HERE/crawler-session-renew.sh" crawler-01 || status=$?
"$HERE/crawler-session-renew.sh" crawler-02 || status=$?
exit "$status"
