import React, { useState } from 'react';
import {
  CheckCircle2,
  FileSpreadsheet,
  FolderCheck,
  FolderOpen,
  FolderPlus,
  Globe,
  Loader2,
  Plug,
  Plus,
  RefreshCw,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AllowedFolder,
  BuiltInToolSettings,
  FolderTrustMode,
  McpServerConfig,
  McpTransportType,
  SaveMcpServerInput,
} from '@shared/types';

interface SuperpowersStoreProps {
  builtInTools: BuiltInToolSettings;
  allowedFolders: AllowedFolder[];
  mcpServers: McpServerConfig[];
  onToggleBuiltIn: (key: keyof BuiltInToolSettings, enabled: boolean) => Promise<void>;
  onPickFolder: () => Promise<void>;
  onUpdateFolderTrust: (id: string, trustMode: FolderTrustMode) => Promise<void>;
  onRemoveFolder: (id: string) => Promise<void>;
  onSaveMcpServer: (input: SaveMcpServerInput) => Promise<void>;
  onToggleMcpServer: (id: string, enabled: boolean) => Promise<void>;
  onTestMcpServer: (id: string) => Promise<{ ok: boolean; message: string }>;
  onDeleteMcpServer: (id: string) => Promise<void>;
}

const PRESET_TEMPLATES: Array<{
  label: string;
  name: string;
  description: string;
  transport: McpTransportType;
  url?: string;
  command?: string;
  argsText?: string;
  envKeyHint?: string;
}> = [
  {
    label: 'Remote Web Connector',
    name: 'Team Knowledge Connector',
    description: 'Connects to any compatible web MCP address.',
    transport: 'streamable-http',
    url: 'https://example.com/mcp',
    envKeyHint: 'API_KEY',
  },
  {
    label: 'Notion Workspace',
    name: 'Notion Pages & Notes',
    description: 'Search and read pages from your Notion workspace.',
    transport: 'stdio',
    command: 'npx',
    argsText: '-y @notionhq/notion-mcp-server',
    envKeyHint: 'OPENAPI_MCP_HEADERS',
  },
  {
    label: 'GitHub Projects',
    name: 'GitHub Issues & Docs',
    description: 'Read project issues, releases, and notes.',
    transport: 'stdio',
    command: 'npx',
    argsText: '-y @modelcontextprotocol/server-github',
    envKeyHint: 'GITHUB_PERSONAL_ACCESS_TOKEN',
  },
];

export const SuperpowersStore: React.FC<SuperpowersStoreProps> = ({
  builtInTools,
  allowedFolders,
  mcpServers,
  onToggleBuiltIn,
  onPickFolder,
  onUpdateFolderTrust,
  onRemoveFolder,
  onSaveMcpServer,
  onToggleMcpServer,
  onTestMcpServer,
  onDeleteMcpServer,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [transport, setTransport] = useState<McpTransportType>('streamable-http');
  const [url, setUrl] = useState('');
  const [command, setCommand] = useState('');
  const [argsText, setArgsText] = useState('');
  const [envPairs, setEnvPairs] = useState<Array<{ key: string; value: string }>>([
    { key: '', value: '' },
  ]);
  const [savingMcp, setSavingMcp] = useState(false);
  const [testingId, setTestingId] = useState<string | null>(null);
  const [testFeedback, setTestFeedback] = useState<Record<string, { ok: boolean; msg: string }>>(
    {}
  );

  const applyTemplate = (tpl: (typeof PRESET_TEMPLATES)[number]) => {
    setName(tpl.name);
    setDescription(tpl.description);
    setTransport(tpl.transport);
    setUrl(tpl.url || '');
    setCommand(tpl.command || '');
    setArgsText(tpl.argsText || '');
    setEnvPairs(tpl.envKeyHint ? [{ key: tpl.envKeyHint, value: '' }] : [{ key: '', value: '' }]);
    setShowAddForm(true);
  };

  const handleSubmitMcp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSavingMcp(true);
    try {
      const envVars: Record<string, string> = {};
      for (const pair of envPairs) {
        if (pair.key.trim() && pair.value.trim()) {
          envVars[pair.key.trim()] = pair.value.trim();
        }
      }
      const parsedArgs = argsText
        .split(/\s+/)
        .map((s) => s.trim())
        .filter(Boolean);

      await onSaveMcpServer({
        name: name.trim(),
        description: description.trim() || 'Custom workspace connector',
        transport,
        url: transport !== 'stdio' ? url.trim() : undefined,
        command: transport === 'stdio' ? command.trim() : undefined,
        args: transport === 'stdio' ? parsedArgs : [],
        envVars,
        enabled: true,
      });

      setName('');
      setDescription('');
      setUrl('');
      setCommand('');
      setArgsText('');
      setEnvPairs([{ key: '', value: '' }]);
      setShowAddForm(false);
    } finally {
      setSavingMcp(false);
    }
  };

  const handleTest = async (id: string) => {
    setTestingId(id);
    try {
      const res = await onTestMcpServer(id);
      setTestFeedback((prev) => ({ ...prev, [id]: { ok: res.ok, msg: res.message } }));
    } finally {
      setTestingId(null);
    }
  };

  return (
    <div className="h-full flex-1 overflow-y-auto px-6 py-8 sm:px-10">
      <div className="mx-auto max-w-4xl space-y-10">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Superpowers &amp; App Connectors</h1>
          <p className="mt-1.5 max-w-[65ch] text-sm leading-relaxed text-ink-secondary">
            Switch capabilities on or off in one click. Everything below runs with zero config files—and AuraDesk always asks in plain English before changing any file.
          </p>
        </div>

        {/* Built-in Superpowers */}
        <section aria-labelledby="builtin-heading" className="space-y-4">
          <h2 id="builtin-heading" className="text-base font-semibold text-ink">
            Built-In Superpowers
          </h2>

          <div className="divide-y divide-hairline overflow-hidden rounded-2xl border border-hairline bg-surface shadow-card">
            {/* 1. Smart Folder Assistant */}
            <div className="p-6">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <FolderOpen className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-ink">Smart Folder Assistant</h3>
                    <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-ink-secondary">
                      Inspects, searches, and tidies only the specific folders you share below. Uses your system Recycle Bin so nothing is ever permanently deleted.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  role="switch"
                  aria-label="Toggle Smart Folder Assistant"
                  aria-checked={builtInTools.smartFolders}
                  onClick={() => onToggleBuiltIn('smartFolders', !builtInTools.smartFolders)}
                  className={`tactile-press relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${
                    builtInTools.smartFolders ? 'bg-accent' : 'bg-strongline'
                  }`}
                >
                  <span
                    className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-150 ${
                      builtInTools.smartFolders ? 'translate-x-6' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>

              {/* Shared Folders Management */}
              <div className="mt-5 rounded-xl border border-hairline bg-canvas p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="tabular-nums text-xs font-medium text-ink-secondary">
                    {allowedFolders.length === 0
                      ? 'No folders shared yet'
                      : `${allowedFolders.length} shared folder${allowedFolders.length === 1 ? '' : 's'}`}
                  </span>
                  <button
                    type="button"
                    onClick={onPickFolder}
                    className="tactile-press inline-flex items-center gap-1.5 rounded-lg border border-strongline bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:bg-subtle"
                  >
                    <FolderPlus className="h-3.5 w-3.5 text-accent" strokeWidth={1.8} />
                    Share a Folder
                  </button>
                </div>

                {allowedFolders.length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {allowedFolders.map((folder) => (
                      <li
                        key={folder.id}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-hairline bg-surface px-3.5 py-2.5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-ink">{folder.label}</span>
                            {folder.trustMode === 'trusted' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-trust-soft px-2 py-0.5 text-[11px] font-medium text-trust">
                                <FolderCheck className="h-3 w-3" strokeWidth={1.8} />
                                Trusted Folder
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-ink-secondary">
                                <ShieldCheck className="h-3 w-3" strokeWidth={1.8} />
                                Asks Before Changes
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-[11px] text-ink-muted">
                            {folder.folderPath}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <select
                            aria-label={`Trust setting for ${folder.label}`}
                            value={folder.trustMode}
                            onChange={(e) =>
                              onUpdateFolderTrust(folder.id, e.target.value as FolderTrustMode)
                            }
                            className="rounded-lg border border-hairline bg-canvas px-2.5 py-1 text-xs text-ink"
                          >
                            <option value="ask">Ask every time</option>
                            <option value="trusted">Trust safe edits</option>
                          </select>
                          <button
                            type="button"
                            onClick={() => onRemoveFolder(folder.id)}
                            aria-label={`Stop sharing ${folder.label}`}
                            className="tactile-press rounded-lg p-1.5 text-ink-muted hover:bg-danger-soft hover:text-danger"
                          >
                            <Trash2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* 2. Live Web Research & Page Reader */}
            <div className="flex items-start justify-between gap-4 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink">
                  <Globe className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">
                    Live Web Research &amp; Page Reader
                  </h3>
                  <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-ink-secondary">
                    Searches live public web pages and strips away ads and clutter so AuraDesk can read clean articles and cite sources accurately.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-label="Toggle Live Web Research"
                aria-checked={builtInTools.webResearch}
                onClick={() => onToggleBuiltIn('webResearch', !builtInTools.webResearch)}
                className={`tactile-press relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${
                  builtInTools.webResearch ? 'bg-accent' : 'bg-strongline'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-150 ${
                    builtInTools.webResearch ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>

            {/* 3. Document & PDF Analyst */}
            <div className="flex items-start justify-between gap-4 p-6">
              <div className="flex items-start gap-4">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink">
                  <FileSpreadsheet className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-ink">Document &amp; PDF Analyst</h3>
                  <p className="mt-1 max-w-[60ch] text-xs leading-relaxed text-ink-secondary">
                    Drop PDFs, Word documents (.docx), CSV spreadsheets, or notes right into chat to extract summaries, tables, and totals automatically.
                  </p>
                </div>
              </div>

              <button
                type="button"
                role="switch"
                aria-label="Toggle Document & PDF Analyst"
                aria-checked={builtInTools.documentAnalyst}
                onClick={() => onToggleBuiltIn('documentAnalyst', !builtInTools.documentAnalyst)}
                className={`tactile-press relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${
                  builtInTools.documentAnalyst ? 'bg-accent' : 'bg-strongline'
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-150 ${
                    builtInTools.documentAnalyst ? 'translate-x-6' : 'translate-x-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        {/* Visual MCP Connector Store */}
        <section aria-labelledby="mcp-heading" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="mcp-heading" className="text-base font-semibold text-ink">
                App Connectors (Visual MCP)
              </h2>
              <p className="mt-0.5 text-xs text-ink-secondary">
                Connect external services with a simple visual form — never touch a JSON file.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setShowAddForm((v) => !v)}
              className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover"
            >
              {showAddForm ? (
                <>
                  <X className="h-3.5 w-3.5" strokeWidth={2} />
                  Close Form
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} />
                  Add App Connector
                </>
              )}
            </button>
          </div>

          {/* 1-Click Starter Templates */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-ink-muted">Quick-fill template:</span>
            {PRESET_TEMPLATES.map((tpl) => (
              <button
                key={tpl.label}
                type="button"
                onClick={() => applyTemplate(tpl)}
                className="tactile-press rounded-full border border-hairline bg-surface px-3 py-1 text-xs font-medium text-ink-secondary hover:border-strongline hover:text-ink"
              >
                + {tpl.label}
              </button>
            ))}
          </div>

          {showAddForm && (
            <form
              onSubmit={handleSubmitMcp}
              className="space-y-4 rounded-2xl border border-strongline bg-surface p-6 shadow-float"
            >
              <h3 className="text-sm font-semibold text-ink">Connect an External App</h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="mcp-name" className="mb-1 block text-xs font-medium text-ink">
                    Friendly Name *
                  </label>
                  <input
                    id="mcp-name"
                    required
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., Notion Notes"
                    className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                  />
                </div>

                <div>
                  <label
                    htmlFor="mcp-transport"
                    className="mb-1 block text-xs font-medium text-ink"
                  >
                    Connection Method
                  </label>
                  <select
                    id="mcp-transport"
                    value={transport}
                    onChange={(e) => setTransport(e.target.value as McpTransportType)}
                    className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 text-sm text-ink"
                  >
                    <option value="streamable-http">Web Address (HTTP)</option>
                    <option value="sse">Live Stream URL (SSE)</option>
                    <option value="stdio">Local Program Command</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="mcp-desc" className="mb-1 block text-xs font-medium text-ink">
                  What does this connector help with?
                </label>
                <input
                  id="mcp-desc"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="e.g., Searches our shared project wiki"
                  className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                />
              </div>

              {transport !== 'stdio' ? (
                <div>
                  <label htmlFor="mcp-url" className="mb-1 block text-xs font-medium text-ink">
                    Connector Web URL *
                  </label>
                  <input
                    id="mcp-url"
                    required
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://your-service.com/mcp"
                    className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                  />
                </div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="mcp-command"
                      className="mb-1 block text-xs font-medium text-ink"
                    >
                      Program Name *
                    </label>
                    <input
                      id="mcp-command"
                      required
                      type="text"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      placeholder="e.g., npx"
                      className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="mcp-args" className="mb-1 block text-xs font-medium text-ink">
                      Options (space-separated)
                    </label>
                    <input
                      id="mcp-args"
                      type="text"
                      value={argsText}
                      onChange={(e) => setArgsText(e.target.value)}
                      placeholder="e.g., -y @modelcontextprotocol/server-memory"
                      className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {/* Secret Keys */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-ink">
                    Optional Secret Keys (encrypted in your keychain)
                  </span>
                  <button
                    type="button"
                    onClick={() => setEnvPairs((prev) => [...prev, { key: '', value: '' }])}
                    className="text-xs font-medium text-accent hover:underline"
                  >
                    + Add another key
                  </button>
                </div>
                {envPairs.map((pair, idx) => (
                  <div key={idx} className="grid grid-cols-2 gap-2">
                    <input
                      type="text"
                      aria-label="Environment key name"
                      value={pair.key}
                      onChange={(e) =>
                        setEnvPairs((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, key: e.target.value } : p))
                        )
                      }
                      placeholder="Key name (e.g., API_KEY)"
                      className="rounded-xl border border-hairline bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-muted"
                    />
                    <input
                      type="password"
                      aria-label="Environment secret value"
                      value={pair.value}
                      onChange={(e) =>
                        setEnvPairs((prev) =>
                          prev.map((p, i) => (i === idx ? { ...p, value: e.target.value } : p))
                        )
                      }
                      placeholder="Secret value"
                      className="rounded-xl border border-hairline bg-canvas px-3 py-2 text-xs text-ink placeholder:text-ink-muted"
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="rounded-xl px-4 py-2 text-xs font-medium text-ink-secondary hover:bg-subtle"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingMcp}
                  className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-50"
                >
                  {savingMcp ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                      Connecting...
                    </>
                  ) : (
                    'Save & Connect'
                  )}
                </button>
              </div>
            </form>
          )}

          {/* Connected Custom MCP Servers List */}
          {mcpServers.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-strongline bg-surface/50 p-7 text-center">
              <Plug className="mx-auto h-6 w-6 text-ink-muted" strokeWidth={1.7} />
              <p className="mt-2 text-sm font-medium text-ink">No custom connectors added yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs leading-relaxed text-ink-secondary">
                Your built-in Folder, Web Research, and Document Analyst superpowers already work out of the box. Click &ldquo;Add App Connector&rdquo; anytime to plug in Notion, GitHub, or company tools.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {mcpServers.map((server) => {
                const feedback = testFeedback[server.id];
                return (
                  <div
                    key={server.id}
                    className="rounded-2xl border border-hairline bg-surface p-5 shadow-card"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <h3 className="text-sm font-semibold text-ink">{server.name}</h3>
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                              server.lastStatus === 'connected'
                                ? 'bg-trust-soft text-trust'
                                : server.lastStatus === 'error'
                                  ? 'bg-warn-soft text-warn'
                                  : 'bg-subtle text-ink-secondary'
                            }`}
                          >
                            {server.lastStatus === 'connected'
                              ? `Connected · ${server.discoveredTools.length} actions`
                              : server.lastStatus === 'error'
                                ? 'Needs attention'
                                : 'Paused'}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-ink-secondary">{server.description}</p>
                        {server.lastError && (
                          <p className="mt-2 rounded-lg bg-warn-soft px-3 py-1.5 text-xs text-warn">
                            {server.lastError}
                          </p>
                        )}
                        {feedback && !server.lastError && (
                          <p className="mt-2 flex items-center gap-1 text-xs text-trust">
                            <CheckCircle2 className="h-3.5 w-3.5" strokeWidth={1.8} />
                            {feedback.msg}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleTest(server.id)}
                          disabled={testingId === server.id}
                          className="tactile-press inline-flex items-center gap-1 rounded-lg border border-hairline bg-canvas px-3 py-1.5 text-xs font-medium text-ink hover:bg-subtle"
                        >
                          <RefreshCw
                            className={`h-3.5 w-3.5 ${testingId === server.id ? 'animate-spin' : ''}`}
                            strokeWidth={1.8}
                          />
                          Test
                        </button>

                        <button
                          type="button"
                          role="switch"
                          aria-label={`Enable ${server.name}`}
                          aria-checked={server.enabled}
                          onClick={() => onToggleMcpServer(server.id, !server.enabled)}
                          className={`tactile-press relative inline-flex h-6 w-11 shrink-0 items-center rounded-full ${
                            server.enabled ? 'bg-accent' : 'bg-strongline'
                          }`}
                        >
                          <span
                            className={`inline-block h-4 w-4 rounded-full bg-white transition-transform duration-150 ${
                              server.enabled ? 'translate-x-6' : 'translate-x-1'
                            }`}
                          />
                        </button>

                        <button
                          type="button"
                          onClick={() => onDeleteMcpServer(server.id)}
                          aria-label={`Remove ${server.name}`}
                          className="tactile-press rounded-lg p-1.5 text-ink-muted hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={1.8} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
