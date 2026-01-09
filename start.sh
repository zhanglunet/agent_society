#!/bin/bash
# Agent Society 服务器启动脚本 (Unix/macOS)
#
# 用法:
#   ./start.sh [数据目录] [选项]
#
# 选项:
#   --port, -p <端口>  HTTP 服务器端口 (默认: 3000)
#   --no-browser       不自动打开浏览器
#
# 示例:
#   ./start.sh                           # 使用默认配置
#   ./start.sh ./my-data                 # 自定义数据目录
#   ./start.sh --port 3001               # 自定义端口
#   ./start.sh ./my-data -p 3001 --no-browser

# 获取脚本所在目录
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "============================================================"
echo "           Agent Society 启动脚本"
echo "============================================================"
echo ""

# 检测 bun
echo "[1/3] 检测 bun 运行时..."

# 先检查常见安装路径
if [ -f "$HOME/.bun/bin/bun" ]; then
    export PATH="$HOME/.bun/bin:$PATH"
fi

if command -v bun &> /dev/null; then
    echo "     bun 已安装"
else
    # bun 未安装，询问用户是否安装
    echo "     bun 未安装"
    echo ""
    echo "bun 是本项目所需的 JavaScript 运行时。"
    echo "是否自动安装 bun? (安装来源: https://bun.sh)"
    echo ""
    read -p "请输入 y 安装，n 退出 [y/n]: " INSTALL_BUN

    if [[ "$INSTALL_BUN" != "y" && "$INSTALL_BUN" != "Y" ]]; then
        echo ""
        echo "您选择不安装 bun。"
        echo "请手动安装 bun 后重新运行此脚本。"
        echo "安装指南: https://bun.sh"
        exit 0
    fi

    # 检查 curl 是否可用
    if ! command -v curl &> /dev/null; then
        echo ""
        echo "错误: 未找到 curl 命令"
        echo "解决方案: 请先安装 curl，然后重新运行此脚本"
        echo "  Ubuntu/Debian: sudo apt install curl"
        echo "  macOS: curl 通常已预装"
        exit 1
    fi

    # 安装 bun
    echo ""
    echo "[1/3] 正在安装 bun..."
    echo "     执行: curl -fsSL https://bun.sh/install | bash"
    echo ""
    curl -fsSL https://bun.sh/install | bash

    if [ $? -ne 0 ]; then
        echo ""
        echo "错误: bun 安装失败"
        echo "解决方案: 请手动安装 bun"
        echo "安装指南: https://bun.sh"
        exit 1
    fi

    # 添加 bun 到 PATH
    export PATH="$HOME/.bun/bin:$PATH"

    # 验证 bun 安装
    if ! command -v bun &> /dev/null; then
        echo ""
        echo "错误: bun 安装后无法找到"
        echo "解决方案: 请关闭此终端，重新打开后再运行此脚本"
        echo "或手动安装 bun: https://bun.sh"
        exit 1
    fi
    echo "     bun 安装成功"
fi

# 安装依赖
echo ""
echo "[2/3] 安装项目依赖..."
echo "     执行: bun install"
echo ""
bun install

if [ $? -ne 0 ]; then
    echo ""
    echo "错误: 依赖安装失败"
    echo "解决方案: 请检查网络连接，或检查 package.json 是否正确"
    exit 1
fi

# 启动服务器
echo ""
echo "[3/3] 启动服务器..."
echo ""
bun run start.js "$@"
