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
RUNS_BIN_DIR="$CLAUDE_DIR/set-runs/bin"
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

# Bold WITHOUT escape interpretation — for lines carrying changelog-derived text.
bold_literal() { printf '%b%s%b\n' "$BOLD" "$1" "$NC"; }

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
mkdir -p "$CLAUDE_DIR" 2>/dev/null || true
mkdir -p "$COMMANDS_DIR" 2>/dev/null || true

# A read-only commands dir is the normal devcontainer setup, not a broken install:
# the host's ~/.claude/commands is bind-mounted readonly so the container reads the
# host's SET without being able to corrupt it. Under `set -e` the mkdir above would
# otherwise abort with a bare "Permission denied" and no explanation.
if ! ( : > "$COMMANDS_DIR/.set-write-probe" ) 2>/dev/null; then
  error "Cannot write to $COMMANDS_DIR"
  echo ""
  if [ -f /.dockerenv ] || [ -n "${REMOTE_CONTAINERS:-}" ] || [ -n "${CODESPACES:-}" ]; then
    error "This looks like a container, where ~/.claude/commands is typically"
    error "bind-mounted read-only from the host. That is intentional — SET is"
    error "installed once on the HOST and every container inherits it."
    echo ""
    error "  Fix: run this installer on the host, then restart the container."
    error "  Do NOT try to install SET inside the container."
  else
    error "Check ownership and permissions on that directory, then re-run."
  fi
  echo ""
  if [ -f "$COMMANDS_DIR/.set-version" ]; then
    error "Currently mounted SET version: $(cat "$COMMANDS_DIR/.set-version" 2>/dev/null)"
  fi
  exit 1
fi
rm -f "$COMMANDS_DIR/.set-write-probe"

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

# /set-build runs as a native Agent Team, which needs the task tools (TaskCreate,
# TaskList, TaskUpdate, TaskGet) registered in the session.
#
# CLAUDE_CODE_ENABLE_TODO_TOOLS is the variable that registers them. Verified by
# nonce test on 2.1.233: with only CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS set, a
# headless session reports the tools do not exist; with TODO_TOOLS it creates a
# task and reads back its id. CLAUDE_CODE_ENABLE_TASKS does NOT work — it looks
# like the obvious lever and is not one.
#
# EXPERIMENTAL_AGENT_TEAMS is still written: it is a recognized variable (it
# appears in the CLI's env table) and may gate other team behaviour. It is simply
# not sufficient on its own, which is what SET got wrong.
if jq -e '.env.CLAUDE_CODE_ENABLE_TODO_TOOLS' "$SETTINGS_FILE" &>/dev/null \
  && jq -e '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' "$SETTINGS_FILE" &>/dev/null; then
  info "Agent Teams already enabled (task tools + experimental flag)"
else
  jq '.env.CLAUDE_CODE_ENABLE_TODO_TOOLS = "true"
      | .env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1"' \
    "$SETTINGS_FILE" > "$SETTINGS_FILE.tmp" && mv "$SETTINGS_FILE.tmp" "$SETTINGS_FILE"
  info "Agent Teams enabled (task tools + experimental flag)"
  warn "Restart any running Claude Code session — these are read at session start"
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

# Single source of truth for reference files — the install loop and the Step 5
# verify loop both read this. Adding a reference means editing this line only.
SET_REFERENCES="enhanced-builder-prompt enhanced-qa-prompt learn-entry-format autonomous-mode run-store agent-return-channels"

# ERRORS may be referenced before Step 5 initializes it; ensure it exists.
ERRORS=${ERRORS:-0}

# Version notification: read the PREVIOUSLY installed version before the copy
# step below overwrites it. Never allowed to fail the install — every read
# degrades to empty on any error.
VERSION_FILE="$COMMANDS_DIR/.set-version"
# First line only, reduced to version-safe characters: a CRLF file would otherwise
# never compare equal, and this value is printed to a terminal.
PREV_VERSION="$(head -n1 "$VERSION_FILE" 2>/dev/null | tr -cd 'A-Za-z0-9.+_-' || true)"

# Clear any prior digest up front: /set-update reads this file with no knowledge
# of whether THIS run succeeded, so a leftover would be reported as fresh news
# for an install that just failed. It exists only when this run writes it.
rm -f "$COMMANDS_DIR/.set-whatsnew" 2>/dev/null || true

# Resolve the directory this script lives in (empty/unreliable under curl|bash).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
PLUGIN_ROOT=""
DOWNLOAD_TMP=""

if [ -n "$SCRIPT_DIR" ] && [ -d "$SCRIPT_DIR/plugins/set" ]; then
  PLUGIN_ROOT="$SCRIPT_DIR/plugins/set"
  info "Using local checkout: $PLUGIN_ROOT"
else
  # No checkout (curl | bash). Download the repo ONCE.
  # KNOWN LIMITATION: this tarball is unauthenticated — a mutable refs/heads/main
  # with no pinned ref, checksum, or signature. Everything it carries, CHANGELOG.md
  # included, is untrusted input (see sanitize_digest).
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
# plugin.json arrives with the unauthenticated tarball, so the version is untrusted:
# same whitelist as PREV_VERSION, since it reaches both the printed banner and disk.
NEW_VERSION=""
if [ -n "$PLUGIN_ROOT" ] && [ -f "$PLUGIN_ROOT/.claude-plugin/plugin.json" ]; then
  NEW_VERSION="$(jq -r '.version // empty' "$PLUGIN_ROOT/.claude-plugin/plugin.json" 2>/dev/null \
    | head -n1 | tr -cd 'A-Za-z0-9.+_-' || true)"
fi

# Digest bounds. CHANGELOG.md arrives with the unauthenticated tarball above, so
# treat its text as untrusted: it is printed to a terminal and handed to
# /set-update, which relays it into an LLM's context.
DIGEST_MAX_BULLETS=10
DIGEST_MAX_LINE=120

# sanitize_digest — stdin to stdout. Strips ANSI escape sequences and control
# characters, caps line length and line count. Never fails.
sanitize_digest() {
  LC_ALL=C sed 's/'$'\033''\[[0-9;?]*[ -\/]*[@-~]//g; s/'$'\033''[@-Z\\-_]//g' 2>/dev/null \
    | LC_ALL=C tr -d '\000-\010\013\014\016-\037\177' 2>/dev/null \
    | awk -v max_line="$DIGEST_MAX_LINE" -v max_bullets="$DIGEST_MAX_BULLETS" '
        n >= max_bullets { truncated = 1; next }
        {
          # ASCII marker only — awk length() counts bytes, so a multibyte "…" would overshoot max_line.
          if (length($0) > max_line) $0 = substr($0, 1, max_line - 3) "..."
          print
          n++
        }
        END { if (truncated) print "  • ...more changes - see CHANGELOG.md" }
      ' 2>/dev/null || true
}

# extract_changelog_section <version> <changelog-path>
# Prints the body of "## [<version>]" up to (not including) the next "## [".
# Empty output + zero exit on any failure (missing file, no matching section) —
# this notification must never fail the install.
extract_changelog_section() {
  local version="$1" changelog="$2"
  [ -f "$changelog" ] || return 0
  awk -v ver="$version" '
    BEGIN { found=0; heading="## [" ver "]" }
    /^## \[/ {
      if (found) exit
      if (index($0, heading) == 1) { found=1; next }
      next
    }
    found { print }
  ' "$changelog" 2>/dev/null || true
}

# extract_changelog_range <new-version> <prev-version> <changelog-path>
# Prints the bodies of every "## [x.y.z]" section newer than <prev-version>, up to
# and including <new-version>, each preceded by a "@@VERSION x.y.z" marker line.
#
# A user who skips releases must still see what changed in the ones they skipped:
# upgrading 1.2.0 -> 1.3.0 has to report 1.2.1's changes too, or they ship silently.
# An empty or unparseable <prev-version> falls back to the single newest section,
# which is the correct behaviour for a first install.
extract_changelog_range() {
  local new_version="$1" prev_version="$2" changelog="$3"
  [ -f "$changelog" ] || return 0
  awk -v newv="$new_version" -v prevv="$prev_version" '
    # Compare dotted versions numerically, component by component. Non-numeric or
    # missing components sort as 0, so a malformed tag degrades to "oldest" rather
    # than throwing. Returns -1, 0, or 1.
    function vcmp(a, b,   an, bn, x, y, i, n, na, nb) {
      na = split(a, x, ".")
      nb = split(b, y, ".")
      n = (na > nb) ? na : nb
      for (i = 1; i <= n; i++) {
        an = (x[i] ~ /^[0-9]+$/) ? x[i] + 0 : 0
        bn = (y[i] ~ /^[0-9]+$/) ? y[i] + 0 : 0
        if (an > bn) return 1
        if (an < bn) return -1
      }
      return 0
    }
    /^## \[/ {
      emit = 0
      # Section version is the text between the first [ and the following ].
      if (match($0, /\[[^]]+\]/)) {
        secv = substr($0, RSTART + 1, RLENGTH - 2)
        # Include it when it is no newer than the version being installed and
        # strictly newer than what the user already has.
        if (vcmp(secv, newv) <= 0 && (prevv == "" || vcmp(secv, prevv) > 0)) {
          emit = 1
          print "@@VERSION " secv
        }
      }
      next
    }
    emit { print }
  ' "$changelog" 2>/dev/null || true
}

# changelog_headline <version> <changelog-path>
# Prints the text after the separator in "## [<ver>] — <headline>" (em-dash or
# ASCII hyphen). Empty when the heading carries no separated headline.
changelog_headline() {
  local version="$1" changelog="$2"
  [ -f "$changelog" ] || return 0
  awk -v ver="$version" '
    BEGIN { heading="## [" ver "]" }
    index($0, heading) == 1 {
      rest = substr($0, length(heading) + 1)
      if (sub(/^[[:space:]]*(—|-)[[:space:]]*/, "", rest) && rest != "") print rest
      exit
    }
  ' "$changelog" 2>/dev/null | sanitize_digest || true
}

# changelog_digest <version> <changelog-path> [prev-version]
# One "  • " line per top-level `- **lead**` bullet, bounded and sanitized. A full
# changelog section is release-note prose; this is the scannable form.
#
# With <prev-version>, covers every release in (prev, version] rather than just the
# newest — a user upgrading across skipped versions sees their changes too. When the
# range spans more than one release, each is introduced by a "  1.2.1:" header so the
# bullets stay attributable. Omitting <prev-version> keeps the single-section form.
changelog_digest() {
  local version="$1" changelog="$2" prev="${3:-}"
  local raw
  # A prev that is not dotted-numeric compares as 0.0.0, which would make every
  # section "newer" and dump the entire history. Treat it as unknown instead.
  case "$prev" in
    *[!0-9.]* | .* | *.) prev="" ;;
  esac
  if [ -n "$prev" ]; then
    raw="$(extract_changelog_range "$version" "$prev" "$changelog")"
  else
    raw="$(printf '@@VERSION %s\n%s\n' "$version" "$(extract_changelog_section "$version" "$changelog")")"
  fi
  printf '%s\n' "$raw" \
    | awk '
        /^@@VERSION / { versions[++nv] = substr($0, 11); order[nv] = ""; cur = nv; next }
        /^- \*\*/ {
          line = $0
          sub(/^- \*\*/, "", line)
          sub(/\*\*.*/, "", line)
          sub(/[.:]$/, "", line)
          if (cur) bullets[cur] = bullets[cur] line "\n"
        }
        END {
          # Header the versions only when more than one contributed bullets.
          shown = 0
          for (i = 1; i <= nv; i++) if (bullets[i] != "") shown++
          for (i = 1; i <= nv; i++) {
            if (bullets[i] == "") continue
            if (shown > 1) print "  " versions[i] ":"
            n = split(bullets[i], b, "\n")
            for (j = 1; j <= n; j++) if (b[j] != "") print (shown > 1 ? "    • " : "  • ") b[j]
          }
        }
      ' 2>/dev/null \
    | sanitize_digest || true
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
  for ref in $SET_REFERENCES; do
    install_file "references/$ref.md" "references/$ref.md"
  done

  # Durable run store. Needs node:sqlite — stable on Node 24, flagged on Node 22.
  # A failure here is not fatal: the other six commands do not touch the store.
  if [ -d "$PLUGIN_ROOT/bin" ]; then
    SQLITE_FLAG=""
    if node -e "require('node:sqlite')" >/dev/null 2>&1; then
      SQLITE_OK=1
    elif node --experimental-sqlite -e "require('node:sqlite')" >/dev/null 2>&1; then
      SQLITE_OK=1
      SQLITE_FLAG="--experimental-sqlite"
    else
      SQLITE_OK=0
    fi

    if [ "$SQLITE_OK" -eq 1 ]; then
      mkdir -p "$RUNS_BIN_DIR"
      cp "$PLUGIN_ROOT"/bin/*.mjs "$PLUGIN_ROOT"/bin/*.sql "$RUNS_BIN_DIR/" 2>/dev/null || true
      chmod +x "$RUNS_BIN_DIR"/*.mjs 2>/dev/null || true

      # A shim rather than a config key the orchestrator must remember to read:
      # commands invoke one path and the flag is baked in where it is needed.
      cat > "$RUNS_BIN_DIR/set-run" <<SHIM
#!/bin/sh
# Generated by install.sh. Runs the durable-run store CLI with whatever
# node:sqlite needs on this machine.
exec node $SQLITE_FLAG "\$(dirname "\$0")/set-run.mjs" "\$@"
SHIM
      chmod +x "$RUNS_BIN_DIR/set-run"

      if [ -n "$SQLITE_FLAG" ]; then
        info "Installed run store (node:sqlite needs $SQLITE_FLAG here — baked into the shim)"
      else
        info "Installed run store"
      fi
    else
      warn "node:sqlite unavailable — durable/resumable runs are OFF."
      warn "  Everything else works. Node 24 has it built in; Node 22 needs --experimental-sqlite."
    fi
  fi
fi

# Capture the changelog digest while the source tree still exists — under
# `curl | bash` PLUGIN_ROOT lives inside DOWNLOAD_TMP, removed on the next line.
WHATS_NEW=""
WHATS_NEW_HEADLINE=""
if [ -n "$NEW_VERSION" ] && [ "$NEW_VERSION" != "$PREV_VERSION" ]; then
  WHATS_NEW_HEADLINE="$(changelog_headline "$NEW_VERSION" "$PLUGIN_ROOT/../../CHANGELOG.md")"
  WHATS_NEW="$(changelog_digest "$NEW_VERSION" "$PLUGIN_ROOT/../../CHANGELOG.md" "$PREV_VERSION")"
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

if jq -e '.env.CLAUDE_CODE_ENABLE_TODO_TOOLS' "$SETTINGS_FILE" &>/dev/null; then
  info "Agent Teams: task tools enabled (CLAUDE_CODE_ENABLE_TODO_TOOLS)"
else
  error "Agent Teams: task tools NOT enabled — /set-build cannot run"
  error "  CLAUDE_CODE_ENABLE_TODO_TOOLS is what registers TaskCreate/TaskList/"
  error "  TaskUpdate/TaskGet. Without it the Agent Team path has no task list."
  ERRORS=$((ERRORS + 1))
fi

if jq -e '.env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS' "$SETTINGS_FILE" &>/dev/null; then
  info "Agent Teams: experimental flag set"
else
  error "Agent Teams: CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS not set"
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

for ref in $SET_REFERENCES; do
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
#
# .set-whatsnew is written on EVERY successful run, carrying an explicit
# STATUS line, so /set-update can tell "installed, nothing changed" from
# "install failed" — the file is absent only when this run failed or the
# commands dir was unwritable.
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
    bold_literal "$VERSION_LINE"
    if [ -n "$WHATS_NEW" ]; then
      printf '%s\n' "$WHATS_NEW"
      echo ""
      info "Full notes: CHANGELOG.md (or the repo's Releases page)"
    fi
    echo ""

    # Hand the digest to /set-update, which reports it in the conversation —
    # the installer's own stdout is not where a Claude Code user reads it.
    {
      printf 'STATUS: install-ok version-changed\n'
      printf '%s\n' "$VERSION_LINE"
      [ -n "$WHATS_NEW" ] && printf '%s\n' "$WHATS_NEW"
    } > "$COMMANDS_DIR/.set-whatsnew" 2>/dev/null || true
  else
    {
      printf 'STATUS: install-ok no-change\n'
      printf 'SET %s reinstalled — already current, no changelog entry to report.\n' "$NEW_VERSION"
    } > "$COMMANDS_DIR/.set-whatsnew" 2>/dev/null || true
  fi
elif [ "$ERRORS" -eq 0 ]; then
  # Clean install, but the incoming version was unreadable — record the success
  # without claiming a version.
  printf 'STATUS: install-ok version-unknown\n' \
    > "$COMMANDS_DIR/.set-whatsnew" 2>/dev/null || true
fi

if [ "$ERRORS" -ne 0 ]; then
  error "SET did not install cleanly. Check the problems listed above. Common causes:"
  error ""
  error "  Agent Teams not enabled — /set-build needs BOTH of these in"
  error "    ~/.claude/settings.json:"
  error "      \"env\": {"
  error "        \"CLAUDE_CODE_ENABLE_TODO_TOOLS\": \"true\","
  error "        \"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS\": \"1\""
  error "      }"
  error "    TODO_TOOLS is what registers TaskCreate/TaskList/TaskUpdate/TaskGet;"
  error "    without it the team has no task list and the build cannot run."
  error "    Restart Claude Code after setting them — read at session start."
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
