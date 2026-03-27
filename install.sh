#!/bin/bash
# Install no-cap skill for Claude Code
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILL_DIR="$HOME/.claude/skills/no-cap"

echo "Installing no-cap skill..."
mkdir -p "$SKILL_DIR"
cp "$SCRIPT_DIR/skill/SKILL.md" "$SKILL_DIR/SKILL.md"

echo "Installing dependencies..."
cd "$SCRIPT_DIR" && npm install

# Save repo path to config
CONFIG_FILE="$HOME/.no-cap/config.json"
mkdir -p "$HOME/.no-cap"
if [ -f "$CONFIG_FILE" ]; then
  # Update existing config with repoPath using a temp file approach
  node -e "
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync('$CONFIG_FILE', 'utf-8'));
    config.repoPath = '$SCRIPT_DIR';
    fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
    fs.chmodSync('$CONFIG_FILE', 0o600);
  "
else
  node -e "
    const fs = require('fs');
    const config = { repoPath: '$SCRIPT_DIR' };
    fs.writeFileSync('$CONFIG_FILE', JSON.stringify(config, null, 2));
    fs.chmodSync('$CONFIG_FILE', 0o600);
  "
fi

echo ""
echo "No Cap installed!"
echo "Run /no-cap setup in Claude Code to configure."
echo ""
