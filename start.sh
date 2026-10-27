#!/bin/bash
# macOS / Linux 一键启动脚本
cd "$(dirname "$0")"
echo "正在启动本地服务器..."
open http://localhost:8080 2>/dev/null || xdg-open http://localhost:8080 2>/dev/null
node server.js
