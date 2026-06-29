#!/usr/bin/env bash
#
# SET (Superpowers Engineering Team) Installer
#
# Installs all marketplaces, plugins, commands, and settings
# needed to run the SET workflow in Claude Code.
#
# Usage:
#   curl -sL <url>/set-install.sh | bash
#   -- or --
#   chmod +x set-install.sh && ./set-install.sh
#
# Prerequisites:
#   - Claude Code CLI installed (https://docs.anthropic.com/en/docs/claude-code)
#   - jq installed (brew install jq / apt install jq)
#

set -euo pipefail

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
CLAUDE_DIR="$HOME/.claude"
COMMANDS_DIR="$CLAUDE_DIR/commands"
SETTINGS_FILE="$CLAUDE_DIR/settings.json"

# Marketplace sources
OFFICIAL_MARKETPLACE_REPO="anthropics/claude-plugins-official"

# Raw base for fetching SET command files when not running from a repo checkout
SET_RAW_BASE="https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main"

# Colors (disable if not a terminal)
if [ -t 1 ]; then
  GREEN='\033[0;32m'
  YELLOW='\033[1;33m'
  RED='\033[0;31m'
  BOLD='\033[1m'
  NC='\033[0m'
else
  GREEN='' YELLOW='' RED='' BOLD='' NC=''
fi

info()  { echo -e "${GREEN}[SET]${NC} $1"; }
warn()  { echo -e "${YELLOW}[SET]${NC} $1"; }
error() { echo -e "${RED}[SET]${NC} $1"; }
bold()  { echo -e "${BOLD}$1${NC}"; }

# ---------------------------------------------------------------------------
# Preflight checks
# ---------------------------------------------------------------------------
bold "============================================"
bold "  SET — Superpowers Engineering Team"
bold "  Installer"
bold "============================================"
echo ""

# Check for Claude Code
if ! command -v claude &> /dev/null; then
  error "Claude Code CLI not found."
  error "Install it first: https://docs.anthropic.com/en/docs/claude-code"
  exit 1
fi
info "Claude Code CLI found: $(which claude)"

# Check for jq
if ! command -v jq &> /dev/null; then
  error "jq not found. Install it first:"
  error "  macOS:  brew install jq"
  error "  Linux:  sudo apt install jq"
  exit 1
fi
info "jq found: $(which jq)"

# Check for uv (required for Serena)
if ! command -v uv &> /dev/null; then
  error "uv is required to install Serena."
  error "Install it from https://docs.astral.sh/uv/ then re-run install.sh"
  exit 1
fi
info "uv found: $(which uv)"

# Install Serena MCP server
bold ""
bold "Step 0: Installing Serena MCP"
bold "-----------------------------"
if command -v serena &> /dev/null; then
  info "Serena already installed: $(which serena)"
else
  info "Installing serena-agent via uv..."
  if uv tool install serena-agent; then
    info "Serena installed"
  else
    error "Failed to install serena-agent. Ensure Python 3.11+ is available and retry."
    exit 1
  fi
fi

# Write Serena MCP entry to ~/.claude/settings.json
SERENA_BIN="$(command -v serena)"
if jq -e '.mcpServers.serena' "$SETTINGS_FILE" &>/dev/null 2>&1; then
  info "Serena already configured in settings.json"
else
  jq --arg bin "$SERENA_BIN" \
    '.mcpServers.serena = {"command": $bin, "args": ["start-mcp-server", "--context=claude-code"]}' \
    "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  info "Serena written to $SETTINGS_FILE"
fi

# Ensure .claude directory exists
mkdir -p "$CLAUDE_DIR"
mkdir -p "$COMMANDS_DIR"

# ---------------------------------------------------------------------------
# Step 1: Register marketplaces in settings.json
# ---------------------------------------------------------------------------
bold ""
bold "Step 1: Registering marketplaces"
bold "--------------------------------"

if [ ! -f "$SETTINGS_FILE" ]; then
  info "Creating $SETTINGS_FILE"
  echo '{}' > "$SETTINGS_FILE"
fi

# Add extraKnownMarketplaces entries
add_marketplace() {
  local name="$1"
  local source_type="$2"
  local source_value="$3"

  if jq -e ".extraKnownMarketplaces.\"$name\"" "$SETTINGS_FILE" &>/dev/null; then
    info "Marketplace '$name' already registered"
  else
    if [ "$source_type" = "github" ]; then
      jq --arg name "$name" --arg repo "$source_value" \
        '.extraKnownMarketplaces[$name] = {"source": {"source": "github", "repo": $repo}}' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    else
      jq --arg name "$name" --arg url "$source_value" \
        '.extraKnownMarketplaces[$name] = {"source": {"source": "git", "url": $url}}' \
        "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
    fi
    info "Registered marketplace: $name"
  fi
}

add_marketplace "claude-plugins-official" "github" "$OFFICIAL_MARKETPLACE_REPO"

# ---------------------------------------------------------------------------
# Step 2: Enable Agent Teams
# ---------------------------------------------------------------------------
bold ""
bold "Step 2: Enabling Agent Teams (optional build mode)"
bold "--------------------------------------------------"

# The default /set-build path uses native dynamic workflows and does NOT require
# this flag. It enables the optional autonomous Agent Team build mode
# (/set-build --use-agent-team). Written by default so that mode works out of the box.
if jq -e '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' "$SETTINGS_FILE" &>/dev/null; then
  info "Agent Teams already enabled (for /set-build --use-agent-team)"
else
  jq '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"' \
    "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  info "Agent Teams enabled (for /set-build --use-agent-team)"
fi

# ---------------------------------------------------------------------------
# Step 3: Install plugins via Claude Code CLI
# ---------------------------------------------------------------------------
bold ""
bold "Step 3: Installing plugins"
bold "--------------------------"

info "Installing Superpowers plugin..."
claude plugin install superpowers@claude-plugins-official 2>/dev/null || warn "Superpowers may already be installed or requires manual install"

# ---------------------------------------------------------------------------
# Step 4: Install SET commands
# ---------------------------------------------------------------------------
bold ""
bold "Step 4: Installing SET commands"
bold "-------------------------------"

# SET command + reference files are the source of truth under plugins/set/.
# Install them by copying from a local checkout when available, otherwise by
# fetching the same files from GitHub raw (supports `curl -sL .../install.sh | bash`).
mkdir -p "$COMMANDS_DIR/references"

# Resolve the directory this script lives in (empty/unreliable under curl|bash).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
PLUGIN_ROOT=""
if [ -n "$SCRIPT_DIR" ] && [ -d "$SCRIPT_DIR/plugins/set" ]; then
  PLUGIN_ROOT="$SCRIPT_DIR/plugins/set"
fi

# ERRORS may be referenced before Step 5 initializes it; ensure it exists.
ERRORS=${ERRORS:-0}

# install_file <src-path-under-plugins/set/> <dest-path-under-COMMANDS_DIR>
install_file() {
  local rel="$1" dest="$2"
  if [ -n "$PLUGIN_ROOT" ] && [ -f "$PLUGIN_ROOT/$rel" ]; then
    cp "$PLUGIN_ROOT/$rel" "$COMMANDS_DIR/$dest"
    info "Installed $dest (copied)"
  elif curl -fsSL "$SET_RAW_BASE/plugins/set/$rel" -o "$COMMANDS_DIR/$dest" 2>/dev/null; then
    info "Installed $dest (fetched)"
  else
    error "Failed to install $dest (no local checkout and fetch failed)"
    ERRORS=$((ERRORS + 1))
  fi
}

# Commands. Plugin files are named build.md/plan.md/etc; installed as set-build.md/etc.
install_file "commands/init.md"   "set-init.md"
install_file "commands/design.md" "set-design.md"
install_file "commands/plan.md"   "set-plan.md"
install_file "commands/build.md"  "set-build.md"
install_file "commands/review.md" "set-review.md"
install_file "commands/learn.md"  "set-learn.md"
install_file "commands/update.md" "set-update.md"

# Reference files (under plugins/set/references/, installed under references/).
install_file "references/enhanced-builder-prompt.md" "references/enhanced-builder-prompt.md"
install_file "references/enhanced-qa-prompt.md"      "references/enhanced-qa-prompt.md"
install_file "references/learn-entry-format.md"      "references/learn-entry-format.md"

# ---------------------------------------------------------------------------
# Step 5: Verify
# ---------------------------------------------------------------------------
bold ""
bold "Step 5: Verifying installation"
bold "------------------------------"

# Preserve any install failures recorded in Step 4.
ERRORS=${ERRORS:-0}

# Check settings
if jq -e '.extraKnownMarketplaces."claude-plugins-official"' "$SETTINGS_FILE" &>/dev/null; then
  info "Marketplace: claude-plugins-official"
else
  error "Missing marketplace: claude-plugins-official"
  ERRORS=$((ERRORS + 1))
fi

if jq -e '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' "$SETTINGS_FILE" &>/dev/null; then
  info "Agent Teams: enabled (for /set-build --use-agent-team)"
else
  warn "Agent Teams: not enabled (only needed for /set-build --use-agent-team)"
fi

if jq -e '.mcpServers.serena' "$SETTINGS_FILE" &>/dev/null; then
  info "Serena MCP: configured"
else
  error "Serena MCP: not configured in settings.json"
  ERRORS=$((ERRORS + 1))
fi

# Check commands
for cmd in set-init set-design set-plan set-build set-review set-learn set-update; do
  if [ -f "$COMMANDS_DIR/$cmd.md" ]; then
    info "Command: /$cmd"
  else
    error "Missing command: /$cmd"
    ERRORS=$((ERRORS + 1))
  fi
done

for ref in enhanced-builder-prompt enhanced-qa-prompt learn-entry-format; do
  if [ -f "$COMMANDS_DIR/references/$ref.md" ]; then
    info "Reference: $ref.md"
  else
    error "Missing reference: $ref.md"
    ERRORS=$((ERRORS + 1))
  fi
done

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
bold ""
bold "============================================"
if [ $ERRORS -eq 0 ]; then
  bold "  SET installed successfully!"
else
  bold "  SET installed with $ERRORS warning(s)"
fi
bold "============================================"
echo ""
info "Pipeline:"
info "  /set-init (once per project)"
info "  /set-design → /set-plan → /set-build → /set-review → /set-learn"
echo ""
warn "NOTE: If the 'claude plugin install' command above did not"
warn "succeed, install Superpowers manually. In Claude Code, run:"
warn "  /plugin install superpowers@claude-plugins-official"
echo ""
info "  Dynamic workflows: built into Claude Code (Pro users enable via /config)"
info "  Serena MCP:    ✓ installed and configured"
info "To initialize a project, open it in Claude Code and run: /set-init"
echo ""
