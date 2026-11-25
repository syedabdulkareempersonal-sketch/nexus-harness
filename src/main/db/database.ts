import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { decryptSecret, encryptSecret, maskSecretHint } from '../security/vault';
import type {
  AllowedFolder,
  AppSettings,
  ArtifactItem,
  BuiltInToolSettings,
  ChatMessage,
  ConversationSummary,
  FolderTrustMode,
  McpServerConfig,
  MemoryCategory,
  MemoryColorTag,
  MemoryItem,
  ProviderConfig,
  ProviderId,
  SaveArtifactInput,
  SaveMcpServerInput,
  SaveMemoryInput,
  SaveWorkflowInput,
  ThemeMode,
  WorkflowItem,
} from '@shared/types';

const DEFAULT_PROVIDER_MODELS: Record<
  ProviderId,
  { displayName: string; defaultModel: string; models: string[]; baseUrl: string | null }
> = {
  google: {
    displayName: 'Google Gemini',
    defaultModel: 'gemini-3.8-flash',
    models: ['gemini-3.8-flash', 'gemini-3.8-pro', 'gemini-2.5-pro', 'gemini-2.5-flash'],
    baseUrl: null,
  },
  openai: {
    displayName: 'OpenAI',
    defaultModel: 'gpt-4.1-mini',
    models: ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o', 'gpt-4o-mini', 'o4-mini'],
    baseUrl: null,
  },
  anthropic: {
    displayName: 'Anthropic Claude',
    defaultModel: 'claude-sonnet-4-0',
    models: ['claude-sonnet-4-0', 'claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'],
    baseUrl: null,
  },
  openrouter: {
    displayName: 'OpenRouter',
    defaultModel: 'openai/gpt-4.1-mini',
    models: [
      'openai/gpt-4.1-mini',
      'anthropic/claude-sonnet-4',
      'google/gemini-2.5-pro',
      'deepseek/deepseek-chat',
    ],
    baseUrl: 'https://openrouter.ai/api/v1',
  },
  ollama: {
    displayName: 'Local AI (Ollama)',
    defaultModel: 'llama3.2',
    models: ['llama3.2', 'qwen2.5', 'gemma3', 'mistral'],
    baseUrl: 'http://127.0.0.1:11434/v1',
  },
  demo: {
    displayName: 'Guided Demo Studio',
    defaultModel: 'auradesk-interactive-studio',
    models: ['auradesk-interactive-studio'],
    baseUrl: null,
  },
};

const BUILTIN_WORKFLOWS: Array<Omit<WorkflowItem, 'createdAt'>> = [
  {
    id: 'wf-clean-organize-folder',
    title: 'Clean & Organize My Folder',
    description:
      'Scans a shared folder, groups loose files by topic or type, and proposes a tidy subfolder structure with your approval before moving anything.',
    iconName: 'FolderKanban',
    category: 'Files & Organization',
    promptTemplate:
      'Please inspect my shared folder, summarize what kinds of files are currently sitting loose inside it, and propose a clean, sensible folder organization plan. Open a clear before-and-after summary table in the Canvas first, then help me create subfolders or organize files with my approval.',
    requiredTools: ['smartFolders'],
    outputArtifactHint: 'Organization Plan Table',
    isBuiltin: true,
  },
  {
    id: 'wf-deep-internet-research',
    title: 'Deep Internet Research Report',
    description:
      'Searches multiple live web sources, reads clean articles without ads, cross-checks key facts, and delivers a cited executive report in the Canvas.',
    iconName: 'Globe',
    category: 'Research & Learning',
    promptTemplate:
      'Conduct a thorough live internet research investigation on the following topic, read the most credible sources, and open a well-structured, cited Research Report in the Canvas:\n\nTopic: ',
    requiredTools: ['webResearch'],
    outputArtifactHint: 'Cited Markdown Report',
    isBuiltin: true,
  },
  {
    id: 'wf-summarize-action-items',
    title: 'Summarize & Extract Action Items',
    description:
      'Drop any PDF, Word doc, spreadsheet, or meeting notes to extract a 1-page brief, key figures, decisions, and next steps.',
    iconName: 'FileCheck2',
    category: 'Documents & Meetings',
    promptTemplate:
      'Analyze the attached document (or notes below), distill the essential summary in plain English, and open a structured Action Items & Key Takeaways sheet in the Canvas.',
    requiredTools: ['documentAnalyst'],
    outputArtifactHint: 'Executive Summary & Action Checklist',
    isBuiltin: true,
  },
  {
    id: 'wf-draft-polish-content',
    title: 'Draft & Polish Content',
    description:
      'Turns rough bullet points or ideas into a crisp proposal, email, article, or standalone webpage inside the editable Canvas.',
    iconName: 'PenLine',
    category: 'Writing & Publishing',
    promptTemplate:
      'Help me draft and polish a clear, compelling piece of writing based on these notes, and open the finished draft in the right-side Canvas so I can edit or export it to PDF:\n\nNotes: ',
    requiredTools: [],
    outputArtifactHint: 'Polished Document in Canvas',
    isBuiltin: true,
  },
];

export class AuraDatabase {
  private db: DatabaseSync;

  constructor(dbFilePath: string) {
    fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
    this.db = new DatabaseSync(dbFilePath);
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.migrateAndSeed();
  }

  public close(): void {
    try {
      this.db.close();
    } catch {
      // already closed
    }
  }

  private migrateAndSeed(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        encrypted_api_key TEXT,
        key_hint TEXT,
        base_url TEXT,
        selected_model TEXT NOT NULL,
        available_models_json TEXT NOT NULL,
        is_verified INTEGER DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        workflow_id TEXT,
        pinned INTEGER DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        tool_activities_json TEXT NOT NULL DEFAULT '[]',
        attachments_json TEXT NOT NULL DEFAULT '[]',
        artifact_ids_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        category TEXT NOT NULL,
        color_tag TEXT NOT NULL,
        pinned INTEGER DEFAULT 0,
        source_conversation_id TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS allowed_folders (
        id TEXT PRIMARY KEY,
        folder_path TEXT UNIQUE NOT NULL,
        label TEXT NOT NULL,
        trust_mode TEXT NOT NULL DEFAULT 'ask',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS mcp_servers (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL,
        transport TEXT NOT NULL,
        command TEXT,
        args_json TEXT NOT NULL DEFAULT '[]',
        url TEXT,
        encrypted_env_json TEXT,
        env_keys_json TEXT NOT NULL DEFAULT '[]',
        enabled INTEGER DEFAULT 1,
        last_status TEXT DEFAULT 'idle',
        last_error TEXT,
        discovered_tools_json TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS workflows (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        icon_name TEXT NOT NULL,
        category TEXT NOT NULL,
        prompt_template TEXT NOT NULL,
        required_tools_json TEXT NOT NULL DEFAULT '[]',
        output_artifact_hint TEXT,
        is_builtin INTEGER DEFAULT 0,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        conversation_id TEXT REFERENCES conversations(id) ON DELETE SET NULL,
        title TEXT NOT NULL,
        kind TEXT NOT NULL,
        language TEXT,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);

    const now = new Date().toISOString();

    // Seed default settings
    const defaultSettings: Record<string, unknown> = {
      onboardingCompleted: false,
      activeProviderId: 'google',
      theme: 'light',
      builtInTools: {
        smartFolders: true,
        webResearch: true,
        documentAnalyst: true,
      },
      autoMemoryEnabled: true,
    };

    const insertSetting = this.db.prepare(
      'INSERT OR IGNORE INTO settings (key, value, updated_at) VALUES (?, ?, ?)'
    );
    for (const [key, val] of Object.entries(defaultSettings)) {
      insertSetting.run(key, JSON.stringify(val), now);
    }

    // Seed providers
    const insertProvider = this.db.prepare(`
      INSERT OR IGNORE INTO providers (
        id, display_name, encrypted_api_key, key_hint, base_url,
        selected_model, available_models_json, is_verified, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const [id, meta] of Object.entries(DEFAULT_PROVIDER_MODELS) as Array<
      [ProviderId, (typeof DEFAULT_PROVIDER_MODELS)[ProviderId]]
    >) {
      insertProvider.run(
        id,
        meta.displayName,
        null,
        null,
        meta.baseUrl,
        meta.defaultModel,
        JSON.stringify(meta.models),
        id === 'demo' ? 1 : 0,
        now
      );
    }

    // Upgrade legacy v1.0.0 default model names on existing unverified rows
    this.db
      .prepare(
        `UPDATE providers
         SET selected_model = 'gemini-3.8-flash',
             available_models_json = ?
         WHERE id = 'google' AND is_verified = 0 AND selected_model = 'gemini-2.5-flash'`
      )
      .run(JSON.stringify(DEFAULT_PROVIDER_MODELS.google.models));

    this.db
      .prepare(`UPDATE providers SET display_name = 'Offline Practice Mode' WHERE id = 'demo'`)
      .run();

    // Clean out any non-chat slugs and migrate restricted gemini-4-* defaults on saved Google rows
    const googleRow = this.db
      .prepare(`SELECT selected_model, available_models_json FROM providers WHERE id = 'google'`)
      .get() as { selected_model?: string; available_models_json?: string } | undefined;
    if (googleRow?.available_models_json) {
      try {
        const parsed = JSON.parse(googleRow.available_models_json) as string[];
        const cleaned = parsed.filter(
          (m) => !/image|transcribe|tts|embedding|veo|imagen|customtools|robotics|audio|live/i.test(m)
        );
        const preferredFlash =
          cleaned.find((m) => m === 'gemini-3.6-flash') ||
          cleaned.find((m) => m === 'gemini-3.8-flash') ||
          cleaned.find((m) => m.includes('-flash') && !m.startsWith('gemini-4-')) ||
          cleaned[0];
        const needsModelHeal =
          !googleRow.selected_model ||
          !cleaned.includes(googleRow.selected_model) ||
          googleRow.selected_model.startsWith('gemini-4-') ||
          googleRow.selected_model === 'gemini-2.5-flash';

        if (cleaned.length > 0 && (cleaned.length !== parsed.length || needsModelHeal)) {
          const safeSelected = needsModelHeal
            ? preferredFlash || 'gemini-3.8-flash'
            : googleRow.selected_model!;
          // Put safeSelected at the front of available_models_json for clarity
          const reordered = [safeSelected, ...cleaned.filter((m) => m !== safeSelected)];
          this.db
            .prepare(`UPDATE providers SET selected_model = ?, available_models_json = ? WHERE id = 'google'`)
            .run(safeSelected, JSON.stringify(reordered));
        }
      } catch {
        // ignore
      }
    }

    // Seed 1-Click Workflow Studio cards
    const insertWorkflow = this.db.prepare(`
      INSERT OR IGNORE INTO workflows (
        id, title, description, icon_name, category,
        prompt_template, required_tools_json, output_artifact_hint, is_builtin, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const wf of BUILTIN_WORKFLOWS) {
      insertWorkflow.run(
        wf.id,
        wf.title,
        wf.description,
        wf.iconName,
        wf.category,
        wf.promptTemplate,
        JSON.stringify(wf.requiredTools),
        wf.outputArtifactHint,
        wf.isBuiltin ? 1 : 0,
        now
      );
    }
  }

  // ---- Settings ----
  public getSettings(): AppSettings {
    const rows = this.db.prepare('SELECT key, value FROM settings').all() as Array<{
      key: string;
      value: string;
    }>;
    const map = new Map(rows.map((r) => [r.key, JSON.parse(r.value)]));
    return {
      onboardingCompleted: Boolean(map.get('onboardingCompleted') ?? false),
      activeProviderId: (map.get('activeProviderId') as ProviderId) ?? 'google',
      theme: (map.get('theme') as ThemeMode) ?? 'light',
      builtInTools: (map.get('builtInTools') as BuiltInToolSettings) ?? {
        smartFolders: true,
        webResearch: true,
        documentAnalyst: true,
      },
      autoMemoryEnabled: Boolean(map.get('autoMemoryEnabled') ?? true),
    };
  }

  public updateSettings(partial: Partial<AppSettings>): AppSettings {
    const current = this.getSettings();
    const merged: AppSettings = {
      ...current,
      ...partial,
      builtInTools: partial.builtInTools
        ? { ...current.builtInTools, ...partial.builtInTools }
        : current.builtInTools,
    };
    const now = new Date().toISOString();
    const upsert = this.db.prepare(
      'INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at'
    );
    for (const [key, val] of Object.entries(merged)) {
      upsert.run(key, JSON.stringify(val), now);
    }
    return merged;
  }

  // ---- Providers ----
  public listProviders(): ProviderConfig[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM providers ORDER BY CASE id
          WHEN 'google' THEN 1
          WHEN 'openai' THEN 2
          WHEN 'anthropic' THEN 3
          WHEN 'openrouter' THEN 4
          WHEN 'ollama' THEN 5
          ELSE 6
        END`
      )
      .all() as Array<Record<string, unknown>>;

    return rows.map((row) => ({
      id: row.id as ProviderId,
      displayName: String(row.display_name),
      hasKey: Boolean(row.encrypted_api_key),
      keyHint: row.key_hint ? String(row.key_hint) : null,
      baseUrl: row.base_url ? String(row.base_url) : null,
      selectedModel: String(row.selected_model),
      availableModels: JSON.parse(String(row.available_models_json || '[]')),
      isVerified: Boolean(row.is_verified),
      updatedAt: String(row.updated_at),
    }));
  }

  public getProviderSecret(providerId: ProviderId): {
    config: ProviderConfig;
    apiKey: string;
  } {
    const row = this.db.prepare('SELECT * FROM providers WHERE id = ?').get(providerId) as
      | Record<string, unknown>
      | undefined;
    if (!row) {
      throw new Error(`Unknown provider: ${providerId}`);
    }
    const apiKey = decryptSecret(row.encrypted_api_key ? String(row.encrypted_api_key) : null);
    return {
      config: {
        id: row.id as ProviderId,
        displayName: String(row.display_name),
        hasKey: Boolean(row.encrypted_api_key),
        keyHint: row.key_hint ? String(row.key_hint) : null,
        baseUrl: row.base_url ? String(row.base_url) : null,
        selectedModel: String(row.selected_model),
        availableModels: JSON.parse(String(row.available_models_json || '[]')),
        isVerified: Boolean(row.is_verified),
        updatedAt: String(row.updated_at),
      },
      apiKey,
    };
  }

  public saveProviderCredentials(params: {
    providerId: ProviderId;
    apiKey?: string;
    baseUrl?: string | null;
    selectedModel?: string;
    availableModels?: string[];
    isVerified: boolean;
  }): ProviderConfig {
    const existing = this.db
      .prepare('SELECT * FROM providers WHERE id = ?')
      .get(params.providerId) as Record<string, unknown>;
    const now = new Date().toISOString();

    let encryptedKey = existing?.encrypted_api_key ? String(existing.encrypted_api_key) : null;
    let keyHint = existing?.key_hint ? String(existing.key_hint) : null;

    if (params.apiKey !== undefined && params.apiKey.trim() !== '') {
      encryptedKey = encryptSecret(params.apiKey.trim());
      keyHint = maskSecretHint(params.apiKey.trim());
    }

    const baseUrl =
      params.baseUrl !== undefined
        ? params.baseUrl
        : existing?.base_url
          ? String(existing.base_url)
          : null;
    const availableModels: string[] =
      params.availableModels && params.availableModels.length > 0
        ? params.availableModels
        : JSON.parse(String(existing.available_models_json || '[]'));

    const selectedModel =
      params.selectedModel ||
      (availableModels.includes(String(existing.selected_model))
        ? String(existing.selected_model)
        : availableModels[0] || String(existing.selected_model));

    this.db
      .prepare(
        `UPDATE providers
         SET encrypted_api_key = ?, key_hint = ?, base_url = ?, selected_model = ?,
             available_models_json = ?, is_verified = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        encryptedKey,
        keyHint,
        baseUrl,
        selectedModel,
        JSON.stringify(availableModels),
        params.isVerified ? 1 : 0,
        now,
        params.providerId
      );

    return this.getProviderSecret(params.providerId).config;
  }

  public clearProviderCredentials(providerId: ProviderId): ProviderConfig {
    const defaults = DEFAULT_PROVIDER_MODELS[providerId];
    const now = new Date().toISOString();
    this.db
      .prepare(
        `UPDATE providers
         SET encrypted_api_key = NULL, key_hint = NULL, selected_model = ?,
             available_models_json = ?, is_verified = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        defaults.defaultModel,
        JSON.stringify(defaults.models),
        providerId === 'demo' ? 1 : 0,
        now,
        providerId
      );
    return this.getProviderSecret(providerId).config;
  }

  // ---- Conversations & Messages ----
  public listConversations(): ConversationSummary[] {
    const rows = this.db
      .prepare('SELECT * FROM conversations ORDER BY pinned DESC, updated_at DESC')
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      workflowId: r.workflow_id ? String(r.workflow_id) : null,
      pinned: Boolean(r.pinned),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  public createConversation(title = 'New Conversation', workflowId: string | null = null): ConversationSummary {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        'INSERT INTO conversations (id, title, workflow_id, pinned, created_at, updated_at) VALUES (?, ?, ?, 0, ?, ?)'
      )
      .run(id, title, workflowId, now, now);

    return {
      id,
      title,
      workflowId,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    };
  }

  public getConversation(id: string): ConversationSummary | null {
    const r = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      title: String(r.title),
      workflowId: r.workflow_id ? String(r.workflow_id) : null,
      pinned: Boolean(r.pinned),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  public updateConversation(id: string, patch: { title?: string; pinned?: boolean }): ConversationSummary {
    const existing = this.getConversation(id);
    if (!existing) throw new Error('Conversation not found');
    const now = new Date().toISOString();
    const title = patch.title !== undefined ? patch.title : existing.title;
    const pinned = patch.pinned !== undefined ? patch.pinned : existing.pinned;
    this.db
      .prepare('UPDATE conversations SET title = ?, pinned = ?, updated_at = ? WHERE id = ?')
      .run(title, pinned ? 1 : 0, now, id);
    return { ...existing, title, pinned, updatedAt: now };
  }

  public touchConversation(id: string): ConversationSummary {
    return this.updateConversation(id, {});
  }

  public deleteConversation(id: string): void {
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  public getMessages(conversationId: string): ChatMessage[] {
    const rows = this.db
      .prepare('SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conversationId) as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      conversationId: String(r.conversation_id),
      role: r.role as 'user' | 'assistant',
      content: String(r.content),
      toolActivities: JSON.parse(String(r.tool_activities_json || '[]')),
      attachments: JSON.parse(String(r.attachments_json || '[]')),
      artifactIds: JSON.parse(String(r.artifact_ids_json || '[]')),
      createdAt: String(r.created_at),
    }));
  }

  public saveMessage(msg: ChatMessage): ChatMessage {
    this.db
      .prepare(
        `INSERT INTO messages (
           id, conversation_id, role, content, tool_activities_json,
           attachments_json, artifact_ids_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           tool_activities_json = excluded.tool_activities_json,
           artifact_ids_json = excluded.artifact_ids_json`
      )
      .run(
        msg.id,
        msg.conversationId,
        msg.role,
        msg.content,
        JSON.stringify(msg.toolActivities),
        JSON.stringify(msg.attachments),
        JSON.stringify(msg.artifactIds),
        msg.createdAt
      );
    this.touchConversation(msg.conversationId);
    return msg;
  }

  // ---- Allowed Folders ----
  public listAllowedFolders(): AllowedFolder[] {
    const rows = this.db
      .prepare('SELECT * FROM allowed_folders ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => ({
      id: String(r.id),
      folderPath: String(r.folder_path),
      label: String(r.label),
      trustMode: r.trust_mode as FolderTrustMode,
      createdAt: String(r.created_at),
    }));
  }

  public addAllowedFolder(folderPath: string, trustMode: FolderTrustMode = 'ask'): AllowedFolder {
    const resolved = path.resolve(folderPath);
    const label = path.basename(resolved) || resolved;
    const now = new Date().toISOString();

    const existing = this.db
      .prepare('SELECT * FROM allowed_folders WHERE folder_path = ?')
      .get(resolved) as Record<string, unknown> | undefined;

    if (existing) {
      return {
        id: String(existing.id),
        folderPath: String(existing.folder_path),
        label: String(existing.label),
        trustMode: existing.trust_mode as FolderTrustMode,
        createdAt: String(existing.created_at),
      };
    }

    const id = crypto.randomUUID();
    this.db
      .prepare(
        'INSERT INTO allowed_folders (id, folder_path, label, trust_mode, created_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, resolved, label, trustMode, now);

    return { id, folderPath: resolved, label, trustMode, createdAt: now };
  }

  public updateFolderTrust(id: string, trustMode: FolderTrustMode): AllowedFolder {
    this.db.prepare('UPDATE allowed_folders SET trust_mode = ? WHERE id = ?').run(trustMode, id);
    const r = this.db.prepare('SELECT * FROM allowed_folders WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!r) throw new Error('Folder not found');
    return {
      id: String(r.id),
      folderPath: String(r.folder_path),
      label: String(r.label),
      trustMode: r.trust_mode as FolderTrustMode,
      createdAt: String(r.created_at),
    };
  }

  public removeAllowedFolder(id: string): void {
    this.db.prepare('DELETE FROM allowed_folders WHERE id = ?').run(id);
  }

  // ---- Visual MCP Servers ----
  public listMcpServers(): McpServerConfig[] {
    const rows = this.db
      .prepare('SELECT * FROM mcp_servers ORDER BY created_at ASC')
      .all() as Array<Record<string, unknown>>;
    return rows.map((r) => this.mapMcpRow(r));
  }

  private mapMcpRow(r: Record<string, unknown>): McpServerConfig {
    return {
      id: String(r.id),
      name: String(r.name),
      description: String(r.description),
      transport: r.transport as McpServerConfig['transport'],
      command: r.command ? String(r.command) : null,
      args: JSON.parse(String(r.args_json || '[]')),
      url: r.url ? String(r.url) : null,
      envKeys: JSON.parse(String(r.env_keys_json || '[]')),
      enabled: Boolean(r.enabled),
      lastStatus: (r.last_status as McpServerConfig['lastStatus']) || 'idle',
      lastError: r.last_error ? String(r.last_error) : null,
      discoveredTools: JSON.parse(String(r.discovered_tools_json || '[]')),
      createdAt: String(r.created_at),
    };
  }

  public getMcpServerWithSecrets(id: string): {
    config: McpServerConfig;
    envVars: Record<string, string>;
  } {
    const r = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!r) throw new Error('MCP Connector not found');
    const decryptedJson = decryptSecret(r.encrypted_env_json ? String(r.encrypted_env_json) : null);
    let envVars: Record<string, string> = {};
    if (decryptedJson) {
      try {
        envVars = JSON.parse(decryptedJson);
      } catch {
        envVars = {};
      }
    }
    return { config: this.mapMcpRow(r), envVars };
  }

  public saveMcpServer(input: SaveMcpServerInput): McpServerConfig {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT * FROM mcp_servers WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;

    let encryptedEnv = existing?.encrypted_env_json ? String(existing.encrypted_env_json) : null;
    let envKeys: string[] = existing
      ? JSON.parse(String(existing.env_keys_json || '[]'))
      : [];

    if (input.envVars !== undefined) {
      const cleaned: Record<string, string> = {};
      for (const [k, v] of Object.entries(input.envVars)) {
        if (k.trim() && v.trim()) {
          cleaned[k.trim()] = v.trim();
        }
      }
      envKeys = Object.keys(cleaned);
      encryptedEnv = envKeys.length > 0 ? encryptSecret(JSON.stringify(cleaned)) : null;
    }

    const enabled = input.enabled !== undefined ? input.enabled : existing ? Boolean(existing.enabled) : true;

    this.db
      .prepare(
        `INSERT INTO mcp_servers (
           id, name, description, transport, command, args_json, url,
           encrypted_env_json, env_keys_json, enabled, last_status, last_error, discovered_tools_json, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'idle', NULL, '[]', ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           description = excluded.description,
           transport = excluded.transport,
           command = excluded.command,
           args_json = excluded.args_json,
           url = excluded.url,
           encrypted_env_json = excluded.encrypted_env_json,
           env_keys_json = excluded.env_keys_json,
           enabled = excluded.enabled`
      )
      .run(
        id,
        input.name.trim(),
        input.description.trim(),
        input.transport,
        input.command?.trim() || null,
        JSON.stringify(input.args ?? []),
        input.url?.trim() || null,
        encryptedEnv,
        JSON.stringify(envKeys),
        enabled ? 1 : 0,
        existing ? String(existing.created_at) : now
      );

    return this.getMcpServerWithSecrets(id).config;
  }

  public updateMcpServerStatus(
    id: string,
    patch: {
      enabled?: boolean;
      lastStatus?: 'connected' | 'error' | 'idle';
      lastError?: string | null;
      discoveredTools?: string[];
    }
  ): McpServerConfig {
    const current = this.getMcpServerWithSecrets(id).config;
    const enabled = patch.enabled !== undefined ? patch.enabled : current.enabled;
    const status = patch.lastStatus !== undefined ? patch.lastStatus : current.lastStatus;
    const lastError = patch.lastError !== undefined ? patch.lastError : current.lastError;
    const tools =
      patch.discoveredTools !== undefined ? patch.discoveredTools : current.discoveredTools;

    this.db
      .prepare(
        `UPDATE mcp_servers
         SET enabled = ?, last_status = ?, last_error = ?, discovered_tools_json = ?
         WHERE id = ?`
      )
      .run(enabled ? 1 : 0, status, lastError, JSON.stringify(tools), id);

    return this.getMcpServerWithSecrets(id).config;
  }

  public deleteMcpServer(id: string): void {
    this.db.prepare('DELETE FROM mcp_servers WHERE id = ?').run(id);
  }

  // ---- Memories ----
  public listMemories(): MemoryItem[] {
    const rows = this.db
      .prepare('SELECT * FROM memories ORDER BY pinned DESC, updated_at DESC')
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      content: String(r.content),
      category: r.category as MemoryCategory,
      colorTag: r.color_tag as MemoryColorTag,
      pinned: Boolean(r.pinned),
      sourceConversationId: r.source_conversation_id ? String(r.source_conversation_id) : null,
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  public saveMemory(input: SaveMemoryInput): MemoryItem {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT * FROM memories WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;

    const category: MemoryCategory =
      input.category ?? (existing?.category as MemoryCategory) ?? 'About You';
    const colorMap: Record<MemoryCategory, MemoryColorTag> = {
      'About You': 'amber',
      Preferences: 'sage',
      Projects: 'sky',
      Important: 'rose',
    };
    const colorTag: MemoryColorTag =
      input.colorTag ?? (existing?.color_tag as MemoryColorTag) ?? colorMap[category];
    const pinned = input.pinned !== undefined ? input.pinned : existing ? Boolean(existing.pinned) : false;
    const sourceId =
      input.sourceConversationId !== undefined
        ? input.sourceConversationId
        : existing?.source_conversation_id
          ? String(existing.source_conversation_id)
          : null;

    this.db
      .prepare(
        `INSERT INTO memories (id, content, category, color_tag, pinned, source_conversation_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           category = excluded.category,
           color_tag = excluded.color_tag,
           pinned = excluded.pinned,
           updated_at = excluded.updated_at`
      )
      .run(
        id,
        input.content.trim(),
        category,
        colorTag,
        pinned ? 1 : 0,
        sourceId,
        existing ? String(existing.created_at) : now,
        now
      );

    return {
      id,
      content: input.content.trim(),
      category,
      colorTag,
      pinned,
      sourceConversationId: sourceId,
      createdAt: existing ? String(existing.created_at) : now,
      updatedAt: now,
    };
  }

  public deleteMemory(id: string): void {
    this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  }

  // ---- Workflows ----
  public listWorkflows(): WorkflowItem[] {
    const rows = this.db
      .prepare('SELECT * FROM workflows ORDER BY is_builtin DESC, created_at ASC')
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      description: String(r.description),
      iconName: String(r.icon_name),
      category: String(r.category),
      promptTemplate: String(r.prompt_template),
      requiredTools: JSON.parse(String(r.required_tools_json || '[]')),
      outputArtifactHint: r.output_artifact_hint ? String(r.output_artifact_hint) : null,
      isBuiltin: Boolean(r.is_builtin),
      createdAt: String(r.created_at),
    }));
  }

  public saveWorkflow(input: SaveWorkflowInput): WorkflowItem {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const existing = this.db.prepare('SELECT * FROM workflows WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;

    const isBuiltin = existing ? Boolean(existing.is_builtin) : false;

    this.db
      .prepare(
        `INSERT INTO workflows (
           id, title, description, icon_name, category,
           prompt_template, required_tools_json, output_artifact_hint, is_builtin, created_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           description = excluded.description,
           icon_name = excluded.icon_name,
           category = excluded.category,
           prompt_template = excluded.prompt_template,
           required_tools_json = excluded.required_tools_json,
           output_artifact_hint = excluded.output_artifact_hint`
      )
      .run(
        id,
        input.title.trim(),
        input.description.trim(),
        input.iconName || 'Sparkles',
        input.category.trim() || 'Custom',
        input.promptTemplate.trim(),
        JSON.stringify(input.requiredTools ?? []),
        input.outputArtifactHint ?? null,
        isBuiltin ? 1 : 0,
        existing ? String(existing.created_at) : now
      );

    return {
      id,
      title: input.title.trim(),
      description: input.description.trim(),
      iconName: input.iconName || 'Sparkles',
      category: input.category.trim() || 'Custom',
      promptTemplate: input.promptTemplate.trim(),
      requiredTools: input.requiredTools ?? [],
      outputArtifactHint: input.outputArtifactHint ?? null,
      isBuiltin,
      createdAt: existing ? String(existing.created_at) : now,
    };
  }

  public deleteWorkflow(id: string): void {
    this.db.prepare('DELETE FROM workflows WHERE id = ? AND is_builtin = 0').run(id);
  }

  // ---- Artifacts ----
  public listArtifacts(): ArtifactItem[] {
    const rows = this.db
      .prepare('SELECT * FROM artifacts ORDER BY updated_at DESC')
      .all() as Array<Record<string, unknown>>;

    return rows.map((r) => ({
      id: String(r.id),
      conversationId: r.conversation_id ? String(r.conversation_id) : null,
      title: String(r.title),
      kind: r.kind as ArtifactItem['kind'],
      language: r.language ? String(r.language) : null,
      content: String(r.content),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    }));
  }

  public getArtifact(id: string): ArtifactItem | null {
    const r = this.db.prepare('SELECT * FROM artifacts WHERE id = ?').get(id) as
      | Record<string, unknown>
      | undefined;
    if (!r) return null;
    return {
      id: String(r.id),
      conversationId: r.conversation_id ? String(r.conversation_id) : null,
      title: String(r.title),
      kind: r.kind as ArtifactItem['kind'],
      language: r.language ? String(r.language) : null,
      content: String(r.content),
      createdAt: String(r.created_at),
      updatedAt: String(r.updated_at),
    };
  }

  public saveArtifact(input: SaveArtifactInput): ArtifactItem {
    const id = input.id || crypto.randomUUID();
    const now = new Date().toISOString();
    const existing = this.getArtifact(id);

    this.db
      .prepare(
        `INSERT INTO artifacts (id, conversation_id, title, kind, language, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           title = excluded.title,
           kind = excluded.kind,
           language = excluded.language,
           content = excluded.content,
           updated_at = excluded.updated_at`
      )
      .run(
        id,
        input.conversationId !== undefined ? input.conversationId : existing?.conversationId ?? null,
        input.title.trim(),
        input.kind,
        input.language ?? existing?.language ?? null,
        input.content,
        existing?.createdAt ?? now,
        now
      );

    return this.getArtifact(id)!;
  }

  public deleteArtifact(id: string): void {
    this.db.prepare('DELETE FROM artifacts WHERE id = ?').run(id);
  }
}
