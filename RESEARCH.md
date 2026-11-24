# Live Competitor & User Friction Research (`RESEARCH.md`)

**Product:** AuraDesk — The Zero-Friction Open-Source AI Desktop Harness  
**Research Scope:** Live analysis of GitHub issues, Reddit communities (`r/ClaudeAI`, `r/mcp`, `r/LocalLLaMA`, `r/CLine`, `r/opencode`, `r/selfhosted`), and documentation across the top 8 AI desktop clients and agent harnesses.

---

## 1. Landscape Analysis: Top 8 AI Harnesses & MCP Clients

| Product | Primary Form Factor | Core Strength | Fatal Friction for Everyday Users |
| :--- | :--- | :--- | :--- |
| **Claude Desktop** | Consumer Desktop App (macOS / Windows) | Clean chat UI, Artifacts preview, creator of MCP | **Vendor-locked to Anthropic** (paid subscription required for heavy usage; no OpenAI, Gemini, OpenRouter, or local Ollama). Adding tools requires **manual raw JSON editing** (`claude_desktop_config.json`) with silent failures and path confusion. |
| **Cherry Studio** | Cross-Platform Desktop Client | Supports dozens of API providers, knowledge bases, and MCP | **Settings & Cognitive Overload:** Dense enterprise-like configuration menus; MCP setup still exposes raw JSON/command args (`npx`/`uvx` dependencies); lacks an autonomous, plain-English safe file-execution loop and visual workflow studio. |
| **OpenCode** | Terminal CLI + Desktop Client-Server | Fast coding agent, 75+ providers, local-first `SKILL.md` support | **Developer-Only Ergonomics:** Built around repositories, shell commands, and diffs; divergent MCP config conventions; crashes or stalls when external MCP processes fail to spawn cleanly. |
| **Cline** | VS Code IDE Extension + CLI | Pioneer of "Plan vs. Act" loop and granular tool approvals | **Requires VS Code:** Completely inaccessible to non-programmers (writers, researchers, students, operations teams). Suffers from JSON MCP config syntax fragility, lack of native visual user memory, and constant technical approval popups. |
| **OpenClaw** | Gateway Daemon + Multi-App Switchboard | Connects AI to 30+ chat apps (WhatsApp, Telegram, Signal, Slack) | **Sysadmin Setup Barrier:** Daemon/WebSocket gateway architecture (`disconnected (1008): pairing required`), container `uid 1000` vs `root` permission clashes, and indirect prompt-injection anxiety over broad system access. |
| **Hermes Agent** | Self-Hosted Daemon + WebUI (Nous Research) | Persistent curated memory, scheduled routines, self-improving skills | **Server/CLI Deployment Model:** Designed for Linux/VPS/Docker hosting rather than a 1-click native Mac/Windows app; requires managing hidden dot-directories (`~/.hermes`), environment variables, and container volume permissions. |
| **OpenHands** | Dockerized Web Platform | Heavyweight autonomous software engineering in isolated sandboxes | **Docker Dependency Wall:** Requires Docker Desktop, WSL2 (on Windows), socket mounts (`/var/run/docker.sock`), and `SANDBOX_USER_ID` alignment—an instant dead-end for 99% of non-technical computer users. |
| **TrueForge** (`truefoundry/trueforge`) | `npx` / Docker Compose / Kubernetes Harness | Vendor-neutral agent loop, human approvals, SQLite/Postgres state, MCP | **Terminal-First Launch:** Even local mode requires Node.js installed on the host and running `npx` in a terminal; built for developer/enterprise infrastructure rather than a double-click consumer desktop app. |

---

## 2. Six Systemic User Complaints Synthesized from GitHub & Reddit

### Complaint 1: The "Configuration-as-UX" JSON Nightmare
In `r/ClaudeAI` and `r/mcp`, the #1 barrier to MCP adoption is `claude_desktop_config.json`:
- **Silent Failures:** A single trailing comma or unescaped Windows backslash (`C:\Users\...` instead of `C:\\Users\\...`) causes MCP tools to vanish silently with zero UI explanation.
- **Wrong Config Paths:** Windows MSIX / Store installs isolate config files inside `%LOCALAPPDATA%\Packages\Claude_...\LocalCache\Roaming\Claude\`, while the "Edit Config" button opens `%APPDATA%\Claude\`, trapping users into editing a file the app never reads.
- **Destructive Overwrites:** Updates and preference saves have repeatedly overwritten users' custom `mcpServers` JSON blocks with empty UI preference stubs.
- **Zombie Processes:** Restarting or reloading MCP servers frequently leaks orphaned background processes (`2x -> 4x -> 8x` memory bloat) with no lifecycle supervisor.

### Complaint 2: External Runtime & Docker Hell
- Tools like **OpenHands**, **OpenClaw**, **Hermes Agent**, and **TrueForge** assume users have **Docker**, **Python (`uvx`)**, **Node (`npx`)**, or **WSL2** pre-installed and on their system `PATH`.
- Non-technical users downloading a desktop app expect **zero external dependencies**. Asking a marketer, lawyer, student, or small-business owner to fix `spawn npx ENOENT` or `EACCES: permission denied` on a Docker volume results in immediate abandonment.

### Complaint 3: Intimidating Terminal & Developer Jargon
- **OpenCode**, **Cline**, and **TrueForge** expose raw shell commands (`bash -c "rm -rf ..."`), JSON payloads, exit codes, `stdio` transport flags, and token counts in the primary workspace.
- Everyday users don't want to "approve `fs.unlinkSync` with `EINVAL` fallback"—they want to read: *"AuraDesk wants to move 14 PDF invoices into `2026 Taxes` so your Downloads folder is tidy."*

### Complaint 4: Permission Fatigue vs. Scary Full Autonomy
- Users report a painful binary across **Cline** and **OpenClaw**: either click "Approve" 40 times in a row on cryptic JSON tool calls (training users to blindly click through dangerous actions), or enable "Auto-Approve / YOLO mode" and risk unintended file deletions or prompt-injection attacks.
- **Missing Middle Ground:** Scoped, human-readable folder trust (**Allow Once** / **Trust This Folder** / **Block**) with automatic read-only safety vs. explicit write/modify guardrails.

### Complaint 5: Vendor Lock-In & Subscription Fatigue
- **Claude Desktop** locks users into a single provider and monthly subscription tier; rate limits halt work mid-afternoon with no way to switch to **Gemini**, **OpenAI**, **OpenRouter**, or a **free local Ollama model** running offline on the user's own laptop.

### Complaint 6: Amnesia & Opaque "Black-Box" Memory
- Standard desktop harnesses either start every chat with total amnesia (**Cline**, **OpenCode**) or hide "memory" inside invisible cloud profiles where hallucinated facts persist forever.
- Users praise **Hermes Agent's** automatic memory concept, yet want a **transparent, visual, 1-click editable board** right inside the app where they can see, pin, edit, or delete every single fact the AI remembers about them—stored 100% locally on their own computer.

---

## 3. The AuraDesk "Zero-Friction Feature Matrix" (10x Over Claude Desktop)

| Capability / UX Dimension | Claude Desktop | Cherry Studio / Cline / OpenHands | **AuraDesk (Our Product)** | Why It Is 10x Better |
| :--- | :--- | :--- | :--- | :--- |
| **Installation & Runtime** | 1-click app, cloud account mandatory | Requires VS Code (Cline), Docker (OpenHands), or `npx`/`uvx` CLI tools | **1-Click Native Installer (`.exe` / `.dmg` / `.AppImage`), Zero External Runtimes** | Works immediately out of the box—no terminal, no Docker, no Python, no account signup wall. |
| **First-Launch Onboarding** | Mandatory Anthropic login & phone verification | Multi-screen settings maze & manual endpoint URLs | **30-Second Visual Wizard + 1-Click Ollama Auto-Detect** | Paste 1 key (Gemini, OpenAI, Anthropic, OpenRouter) OR click **"Auto-Detect Local AI"** with live connection test. |
| **AI Model Freedom** | Locked to Claude models only | Supported, but buried in complex provider configs | **Instant Multi-Provider Switcher + Offline Local AI** | Switch seamlessly mid-project between Gemini, GPT, Claude, OpenRouter, or 100% private local Ollama models. |
| **Built-In Superpowers** | Basic chat + manual MCP JSON required for local files | Requires external MCP servers that break on `PATH` issues | **Native Built-In Tools with Visual ON/OFF Toggles** | **Smart Folder Assistant**, **Live Web Research & Reader**, and **Document & PDF/CSV/DOCX Analyst** ship built-in—zero setup. |
| **Custom MCP Extensions** | Edit raw `claude_desktop_config.json` in a text editor | Raw JSON editors or fragile CLI commands | **Visual MCP App Store & Friendly Form Connector** | Simple visual form (Name, Connection Type, Command/URL, Key-Value Secret Fields) + clean process lifecycle supervision. |
| **File & Action Safety** | Technical JSON tool modals | Cryptic shell diffs or unsafe auto-run | **Plain-English Safety & Trust Guardrails** | Calm card explaining *what* will happen and *why*, with **[Allow Once]**, **[Trust This Folder]**, and **[Block]**. |
| **Long-Term Memory** | Cloud-opaque or manual project instructions | None (Cline) or CLI/server config files (Hermes) | **Live Visual Memory Board (Local SQLite Sticky Cards)** | Collapsible right-hand drawer of auto-extracted personal facts you can **Edit**, **Pin**, or **Delete** in 1 click. |
| **Reusable Workflows** | Manual copy-pasting prompts | Markdown `SKILL.md` files in git repos | **1-Click Visual Workflow Studio** | Pre-loaded visual cards (*Clean Folder*, *Deep Research*, *Extract Action Items*, *Polish Content*) + visual creator modal. |
| **Artifact & Document Output** | Read-only preview + basic copy | Raw markdown chat bubbles or IDE tabs | **Split-View Editable Artifact & Live Preview Canvas** | Edit directly in-canvas, preview live HTML/tables/reports, and export in 1 click to **PDF**, **Markdown**, or **HTML**. |
| **Live Transparency** | Generic spinner or raw tool call names | Raw JSON/stderr logs | **Plain-English Live Activity Pill** | Human status updates (*"Reading your Downloads folder..."*, *"Extracting clean article text..."*) with zero jargon. |

---

## 4. Core Product Thesis Derived from Research

Non-technical people do not want an "MCP client" or an "agent runtime"—they want a **calm, trustworthy, superhuman personal workspace** that can organize their messy folders, read their PDFs and spreadsheets, research the live web, remember how they work, and turn thoughts into polished reports—**without ever opening a terminal, installing Docker, or seeing a curly brace `{}`.**

**AuraDesk** bridges the chasm between **Claude Desktop's consumer polish** and **OpenHands / Hermes / OpenCode's local agency**, delivering 100% local SQLite ownership, multi-model freedom, built-in zero-dependency tools, and plain-English human-in-the-loop safety.
