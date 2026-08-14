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

# Check for uv (Serena's plugin launches via uvx). Serena is OPTIONAL and opt-in, so a
# missing uv is a skip, not a failure — SET's learning shards are plain markdown and work
# without any MCP server.
HAVE_UV=1
if ! command -v uv &> /dev/null; then
  HAVE_UV=0
else
  info "uv found: $(which uv)"
fi

# Serena is opt-in. Prompt only when a human is actually there to answer: under
# `curl | bash`, stdin is the SCRIPT ITSELF, so a bare `read` would swallow installer
# source as the answer. Read from /dev/tty instead, and skip entirely when there is no
# tty (CI, devcontainer builds, piped installs) — default is no.
ask_yes_no() {
  local prompt="$1" reply=""
  # /dev/tty's device node exists even when it cannot be opened (piped install, CI,
  # container build), so test that it actually opens rather than that it exists.
  { : < /dev/tty; } 2>/dev/null || return 1
  read -r -p "$prompt" reply < /dev/tty 2>/dev/null || return 1
  [[ "$reply" =~ ^[Yy] ]]
}

# Install Serena as a Claude Code plugin (optional enhancement)
bold ""
bold "Step 0: Serena MCP (optional)"
bold "-----------------------------"

# Claude Code reads MCP servers from four places, not one. A standalone Serena in
# ANY of them runs alongside the plugin's — duplicate uvx processes, and /plugin
# reporting -32000 from the conflicting config keys. Scan all four and report the
# ones that hold a `serena` key. Purely diagnostic: we never edit these files,
# because per-project and repo-level config is the user's (or their team's) call.
#
# Note ~/.claude.json sits OUTSIDE ~/.claude/, so it does not cross into
# devcontainers that bind-mount ~/.claude — anything stored there is host-only.
LEGACY_SERENA_LOCATIONS=()

scan_legacy_serena() {
  LEGACY_SERENA_LOCATIONS=()

  # 1. Global settings — universal MCP servers belong here.
  if jq -e '.mcpServers.serena' "$SETTINGS_FILE" &>/dev/null; then
    LEGACY_SERENA_LOCATIONS+=("$SETTINGS_FILE (.mcpServers.serena)")
  fi

  # 2. Per-project servers, keyed by absolute path.
  if [ -f "$HOME/.claude.json" ]; then
    while IFS= read -r proj; do
      [ -n "$proj" ] && LEGACY_SERENA_LOCATIONS+=("$HOME/.claude.json (project: $proj)")
    done < <(jq -r '.projects // {} | to_entries[] | select(.value.mcpServers.serena) | .key' \
      "$HOME/.claude.json" 2>/dev/null)
  fi

  # 3+4. Repo-local config in the cwd — checked in (.mcp.json) and personal
  # (.claude/settings.local.json). Only meaningful when install.sh runs from a project.
  local f
  for f in ".mcp.json" ".claude/settings.local.json"; do
    if [ -f "$f" ] && jq -e '.mcpServers.serena' "$f" &>/dev/null; then
      LEGACY_SERENA_LOCATIONS+=("$(pwd)/$f (.mcpServers.serena)")
    fi
  done
}

scan_legacy_serena

# SET installs Serena via the official plugin rather than a hand-written
# mcpServers entry. The plugin ships the same stdio server, but launches it with
# `uvx --from git+...` so it tracks upstream instead of pinning whatever binary
# happened to be installed, and Claude Code refcounts its lifecycle across
# sessions. Existing standalone installs are left alone — see below.
if [ ${#LEGACY_SERENA_LOCATIONS[@]} -gt 0 ]; then
  warn "Serena is already configured standalone in:"
  for loc in "${LEGACY_SERENA_LOCATIONS[@]}"; do
    warn "  - $loc"
  done
  warn "  Leaving it as-is. Running it alongside the plugin starts duplicate"
  warn "  Serena processes and makes /plugin report -32000 on the conflicting keys."
  warn "  To switch to the plugin, remove the serena entry from the file(s) above,"
  warn "  then run: claude plugin install serena@claude-plugins-official"
elif jq -e '.enabledPlugins | keys[] | select(startswith("serena@"))' "$SETTINGS_FILE" &>/dev/null 2>&1; then
  info "Serena plugin already installed"
elif [ "$HAVE_UV" -eq 0 ]; then
  info "Serena not installed — uv not found (Serena launches via uvx)."
  info "  Optional. SET works without it; learning shards are plain markdown."
  info "  To add it later: install uv (https://docs.astral.sh/uv/), then run"
  info "  /plugin install serena@claude-plugins-official"
else
  echo ""
  echo "  Serena adds semantic recall over your learning shards. SET works fully"
  echo "  without it — the same shards are searched by keyword instead. It is not"
  echo "  usable inside walled devcontainers, where no agent can reach an MCP server."
  echo ""
  if ask_yes_no "  Install Serena? [y/N] "; then
    info "Installing Serena plugin..."
    if claude plugin install serena@claude-plugins-official 2>/dev/null; then
      info "Serena plugin installed"
    else
      warn "Could not install the Serena plugin (optional — SET works without it)."
      warn "  To retry, in Claude Code run: /plugin install serena@claude-plugins-official"
    fi
  else
    info "Skipping Serena (optional)."
    info "  To add it later: /plugin install serena@claude-plugins-official"
  fi
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
bold "Step 2: Enabling Agent Teams (required for the default build path)"
bold "------------------------------------------------------------------"

# /set-build runs as a native Agent Team by default, which requires this flag.
# Without it, /set-build prompts the user to fall back to the dynamic-workflow
# path (/set-build --use-workflow), which needs no flag.
if jq -e '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' "$SETTINGS_FILE" &>/dev/null; then
  info "Agent Teams already enabled (required for the default /set-build path)"
else
  jq '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"' \
    "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  info "Agent Teams enabled (required for the default /set-build path)"
  warn "Restart any running Claude Code session — this variable is read at session start"
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
# Resolve ONE source tree, then copy all files from it locally:
#   1. a local repo checkout (when running `bash install.sh` from a clone), or
#   2. a single download of the repo (tarball, fallback git clone) when piped
#      via `curl | bash`. One network call instead of one-per-file.
mkdir -p "$COMMANDS_DIR/references"

# ERRORS may be referenced before Step 5 initializes it; ensure it exists.
ERRORS=${ERRORS:-0}

# Version notification: read the PREVIOUSLY installed version before the copy
# step below overwrites it. Never allowed to fail the install — every read
# degrades to empty on any error.
VERSION_FILE="$COMMANDS_DIR/.set-version"
PREV_VERSION="$(cat "$VERSION_FILE" 2>/dev/null || true)"

# Resolve the directory this script lives in (empty/unreliable under curl|bash).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
PLUGIN_ROOT=""
DOWNLOAD_TMP=""

if [ -n "$SCRIPT_DIR" ] && [ -d "$SCRIPT_DIR/plugins/set" ]; then
  PLUGIN_ROOT="$SCRIPT_DIR/plugins/set"
  info "Using local checkout: $PLUGIN_ROOT"
else
  # No checkout (curl | bash). Download the repo ONCE.
  info "No local checkout — downloading SET once..."
  # Tolerate a blocked/failed mktemp (e.g. a sandbox) without aborting under set -e,
  # so we reach the clear guidance below instead of dying on a cryptic mktemp error.
  DOWNLOAD_TMP="$(mktemp -d 2>/dev/null || mktemp -d -t set-install 2>/dev/null || true)"
  if [ -z "$DOWNLOAD_TMP" ] || [ ! -d "$DOWNLOAD_TMP" ]; then
    : # leave PLUGIN_ROOT empty -> the error block below fires
  elif curl -fsSL "https://github.com/bhall2001/superpowers-engineering-team/archive/refs/heads/main.tar.gz" \
       -o "$DOWNLOAD_TMP/set.tar.gz" 2>/dev/null \
     && tar -xzf "$DOWNLOAD_TMP/set.tar.gz" -C "$DOWNLOAD_TMP" 2>/dev/null \
     && [ -d "$DOWNLOAD_TMP/superpowers-engineering-team-main/plugins/set" ]; then
    PLUGIN_ROOT="$DOWNLOAD_TMP/superpowers-engineering-team-main/plugins/set"
    info "Downloaded SET (tarball)"
  elif command -v git &>/dev/null \
       && git clone --depth 1 "https://github.com/bhall2001/superpowers-engineering-team.git" \
            "$DOWNLOAD_TMP/repo" &>/dev/null \
       && [ -d "$DOWNLOAD_TMP/repo/plugins/set" ]; then
    PLUGIN_ROOT="$DOWNLOAD_TMP/repo/plugins/set"
    info "Downloaded SET (git clone)"
  fi

  if [ -z "$PLUGIN_ROOT" ]; then
    error "Could not download SET (no local checkout, and the download failed)."
    error "Most common cause: this ran inside Claude Code's sandbox, which blocks"
    error "network access and writes outside the project. Re-run with the sandbox"
    error "disabled, or run the installer yourself in a terminal:"
    error "  curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash"
    ERRORS=$((ERRORS + 1))
  fi
fi

# Incoming version from the source tree, now that PLUGIN_ROOT is resolved.
NEW_VERSION=""
if [ -n "$PLUGIN_ROOT" ] && [ -f "$PLUGIN_ROOT/.claude-plugin/plugin.json" ]; then
  NEW_VERSION="$(jq -r '.version // empty' "$PLUGIN_ROOT/.claude-plugin/plugin.json" 2>/dev/null || true)"
fi

# extract_changelog_section <version> <changelog-path>
# Prints the body of "## [<version>]" up to (not including) the next "## [".
# Empty output + zero exit on any failure (missing file, no matching section) —
# this notification must never fail the install.
extract_changelog_section() {
  local version="$1" changelog="$2"
  [ -f "$changelog" ] || return 0
  awk -v ver="$version" '
    BEGIN { found=0 }
    /^## \[/ {
      if (found) exit
      if ($0 ~ "^## \\[" ver "\\]") { found=1; next }
      next
    }
    found { print }
  ' "$changelog" 2>/dev/null || true
}

# changelog_headline <version> <changelog-path>
# Prints the text after the version in "## [<ver>] — <headline>". Empty on failure.
changelog_headline() {
  local version="$1" changelog="$2"
  [ -f "$changelog" ] || return 0
  grep -m1 "^## \[$version\]" "$changelog" 2>/dev/null \
    | sed 's/^## \[[^]]*\][[:space:]]*—[[:space:]]*//' 2>/dev/null || true
}

# changelog_digest <version> <changelog-path>
# One "  • " line per top-level `- **lead**` bullet in the version's section.
# A full changelog section is release-note prose; this is the scannable form.
changelog_digest() {
  local version="$1" changelog="$2"
  extract_changelog_section "$version" "$changelog" \
    | grep '^- \*\*' 2>/dev/null \
    | sed 's/^- \*\*\(.*\)\*\*.*/  • \1/' 2>/dev/null \
    | sed 's/[.:]$//' 2>/dev/null || true
}

# install_file <src-path-under-plugins/set/> <dest-path-under-COMMANDS_DIR>
install_file() {
  local rel="$1" dest="$2"
  if [ -n "$PLUGIN_ROOT" ] && [ -f "$PLUGIN_ROOT/$rel" ]; then
    cp "$PLUGIN_ROOT/$rel" "$COMMANDS_DIR/$dest"
    info "Installed $dest"
  else
    error "Failed to install $dest (source not available)"
    ERRORS=$((ERRORS + 1))
  fi
}

# Only attempt file installs if we resolved a source tree.
if [ -n "$PLUGIN_ROOT" ]; then
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
  install_file "references/autonomous-mode.md"         "references/autonomous-mode.md"
fi

# Capture the changelog digest while the source tree still exists — under
# `curl | bash` PLUGIN_ROOT lives inside DOWNLOAD_TMP, removed on the next line.
WHATS_NEW=""
WHATS_NEW_HEADLINE=""
if [ -n "$NEW_VERSION" ] && [ "$NEW_VERSION" != "$PREV_VERSION" ]; then
  WHATS_NEW_HEADLINE="$(changelog_headline "$NEW_VERSION" "$PLUGIN_ROOT/../../CHANGELOG.md")"
  WHATS_NEW="$(changelog_digest "$NEW_VERSION" "$PLUGIN_ROOT/../../CHANGELOG.md")"
fi

# Clean up any downloaded tree.
[ -n "$DOWNLOAD_TMP" ] && rm -rf "$DOWNLOAD_TMP"

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
  info "Agent Teams: enabled (required for the default /set-build path)"
else
  error "Agent Teams: not enabled — the default /set-build path will not run"
  ERRORS=$((ERRORS + 1))
fi

# Re-scan: the plugin install above may have changed things, and a standalone
# entry anywhere counts as "configured" — erroring out on a working per-project
# Serena would be a false negative.
scan_legacy_serena
if jq -e '.enabledPlugins | keys[] | select(startswith("serena@"))' "$SETTINGS_FILE" &>/dev/null; then
  info "Serena MCP: installed as a plugin"
  if [ ${#LEGACY_SERENA_LOCATIONS[@]} -gt 0 ]; then
    warn "  Conflict: a standalone Serena is also configured in ${#LEGACY_SERENA_LOCATIONS[@]} location(s)."
    for loc in "${LEGACY_SERENA_LOCATIONS[@]}"; do
      warn "    - $loc"
    done
    warn "  Remove the serena entry there — duplicate servers cause /plugin -32000 errors."
  fi
elif [ ${#LEGACY_SERENA_LOCATIONS[@]} -gt 0 ]; then
  info "Serena MCP: configured (standalone entry in ${LEGACY_SERENA_LOCATIONS[0]})"
else
  info "Serena MCP: not installed (optional) — SET runs without it"
  info "  Learning shards in .claude/set/learnings/ are the source of truth and work"
  info "  standalone. Serena adds semantic recall over them for the lead session only."
fi

# Check commands exist. Also assert no stale pre-1.0 markers leaked through — a bare
# existence check would pass even if nothing was written this run, which is how a
# silently-failed update can look "successful". The pre-1.0 commands referenced the
# Compound Teams *marketplace/plugin id*; 1.0+ commands never do (the prose mentions
# of "Compound Teams" in 1.0 docs don't include the marketplace/plugin id), so it is
# a clean stale-leftover signal.
CMD_OK=0
for cmd in set-init set-design set-plan set-build set-review set-learn set-update; do
  if [ ! -f "$COMMANDS_DIR/$cmd.md" ]; then
    error "Missing command: /$cmd"
    ERRORS=$((ERRORS + 1))
  elif grep -qiE "compound-teams-marketplace|compound-teams@" "$COMMANDS_DIR/$cmd.md"; then
    error "/$cmd is STALE (pre-1.0 leftover) — install did not update it"
    ERRORS=$((ERRORS + 1))
  else
    info "Command: /$cmd"
    CMD_OK=$((CMD_OK + 1))
  fi
done

for ref in enhanced-builder-prompt enhanced-qa-prompt learn-entry-format autonomous-mode; do
  if [ -f "$COMMANDS_DIR/references/$ref.md" ]; then
    info "Reference: $ref.md"
  else
    error "Missing reference: $ref.md"
    ERRORS=$((ERRORS + 1))
  fi
done

info "SET commands current: $CMD_OK/7"

# ---------------------------------------------------------------------------
# Done
# ---------------------------------------------------------------------------
bold ""
bold "============================================"
if [ "$ERRORS" -eq 0 ]; then
  bold "  ✅ SET installed successfully!"
else
  bold "  ❌ SET install FAILED — $ERRORS problem(s) above"
fi
bold "============================================"
echo ""

# Version notification. Write-after-success + "What's new" — never allowed to
# fail or affect ERRORS/exit code; every step is guarded.
if [ "$ERRORS" -eq 0 ] && [ -n "$NEW_VERSION" ]; then
  echo "$NEW_VERSION" > "$VERSION_FILE" 2>/dev/null || true

  if [ "$NEW_VERSION" != "$PREV_VERSION" ]; then
    if [ -n "$PREV_VERSION" ]; then
      VERSION_LINE="SET updated $PREV_VERSION → $NEW_VERSION"
    else
      VERSION_LINE="SET $NEW_VERSION installed"
    fi
    [ -n "$WHATS_NEW_HEADLINE" ] && VERSION_LINE="$VERSION_LINE — $WHATS_NEW_HEADLINE"

    bold ""
    bold "$VERSION_LINE"
    if [ -n "$WHATS_NEW" ]; then
      echo "$WHATS_NEW"
      echo ""
      info "Full notes: CHANGELOG.md (or the repo's Releases page)"
    fi
    echo ""

    # Hand the digest to /set-update, which reports it in the conversation —
    # the installer's own stdout is not where a Claude Code user reads it.
    {
      printf '%s\n' "$VERSION_LINE"
      [ -n "$WHATS_NEW" ] && printf '%s\n' "$WHATS_NEW"
    } > "$COMMANDS_DIR/.set-whatsnew" 2>/dev/null || true
  else
    rm -f "$COMMANDS_DIR/.set-whatsnew" 2>/dev/null || true
  fi
fi

if [ "$ERRORS" -ne 0 ]; then
  error "SET did not install cleanly. Check the problems listed above. Common causes:"
  error ""
  error "  Agent Teams not enabled — /set-build's default path needs this in"
  error "    ~/.claude/settings.json:  \"env\": { \"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS\": \"1\" }"
  error "    Restart Claude Code after setting it. To skip Agent Teams entirely,"
  error "    run /set-build --use-workflow, which needs no flag."
  error ""
  error "  Commands not installed/updated — this often means the installer ran inside"
  error "    Claude Code's sandbox (blocks network + writes to ~/.claude). Re-run with"
  error "    the sandbox disabled, or run it in your own terminal:"
  error "      curl -sL https://raw.githubusercontent.com/bhall2001/superpowers-engineering-team/main/install.sh | bash"
  echo ""
  exit 1
fi

info "Pipeline:"
info "  /set-init (once per project)"
info "  /set-design → /set-plan → /set-build → /set-review → /set-learn"
echo ""
warn "NOTE: If the 'claude plugin install' command above did not"
warn "succeed, install Superpowers manually. In Claude Code, run:"
warn "  /plugin install superpowers@claude-plugins-official"
echo ""
info "  Dynamic workflows: built into Claude Code (Pro users enable via /config)"
info "  Serena MCP:    ✓ installed"
info "To initialize a project, open it in Claude Code and run: /set-init"
echo ""
