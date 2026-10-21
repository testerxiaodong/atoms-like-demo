#!/bin/zsh
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd "$(dirname "$0")" || exit 1
npm run demo:stop
result=$?
printf "\n按回车关闭窗口…"
read -r reply
exit "$result"
