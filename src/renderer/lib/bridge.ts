import type { AppBootstrapPayload, AuraDeskBridge, StreamEvent } from '@shared/types';

/**
 * Provides access to `window.auradesk` in Electron, with a graceful local fallback
 * if opened directly in a standalone Vite browser tab during UI development.
 */
const listeners = new Set<(event: StreamEvent) => void>();

const fallbackState: AppBootstrapPayload = {
  settings: {
    onboardingCompleted: false,
    activeProviderId: 'demo',
    theme: 'light',
    builtInTools: {
      smartFolders: true,
      webResearch: true,
      documentAnalyst: true,
    },
    autoMemoryEnabled: true,
  },
  providers: [
    {
      id: 'google',
      displayName: 'Google Gemini',
      hasKey: false,
      keyHint: null,
      baseUrl: null,
      selectedModel: 'gemini-2.5-flash',
      availableModels: ['gemini-2.5-flash', 'gemini-2.5-pro'],
      isVerified: false,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'openai',
      displayName: 'OpenAI',
      hasKey: false,
      keyHint: null,
      baseUrl: null,
      selectedModel: 'gpt-4o-mini',
      availableModels: ['gpt-4o-mini', 'gpt-4o'],
      isVerified: false,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'anthropic',
      displayName: 'Anthropic Claude',
      hasKey: false,
      keyHint: null,
      baseUrl: null,
      selectedModel: 'claude-3-7-sonnet-latest',
      availableModels: ['claude-3-7-sonnet-latest'],
      isVerified: false,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'openrouter',
      displayName: 'OpenRouter',
      hasKey: false,
      keyHint: null,
      baseUrl: 'https://openrouter.ai/api/v1',
      selectedModel: 'anthropic/claude-3.7-sonnet',
      availableModels: ['anthropic/claude-3.7-sonnet'],
      isVerified: false,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'ollama',
      displayName: 'Local AI (Ollama)',
      hasKey: false,
      keyHint: null,
      baseUrl: 'http://127.0.0.1:11434/v1',
      selectedModel: 'llama3.2',
      availableModels: ['llama3.2'],
      isVerified: false,
      updatedAt: new Date().toISOString(),
    },
    {
      id: 'demo',
      displayName: 'Guided Demo Mode',
      hasKey: true,
      keyHint: null,
      baseUrl: null,
      selectedModel: 'auradesk-interactive-studio',
      availableModels: ['auradesk-interactive-studio'],
      isVerified: true,
      updatedAt: new Date().toISOString(),
    },
  ],
  conversations: [],
  allowedFolders: [],
  mcpServers: [],
  workflows: [],
  memories: [],
  artifacts: [],
};

const browserFallbackBridge: AuraDeskBridge = {
  bootstrap: async () => fallbackState,
  updateSettings: async (partial) => {
    fallbackState.settings = { ...fallbackState.settings, ...partial };
    return fallbackState.settings;
  },
  verifyAndSaveProvider: async (input) => ({
    ok: true,
    latencyMs: 25,
    message: `Connected to ${input.providerId}`,
  }),
  detectOllama: async () => ({
    available: false,
    baseUrl: 'http://127.0.0.1:11434/v1',
    models: [],
    latencyMs: 10,
    message: 'Run inside the AuraDesk desktop app for local Ollama discovery.',
  }),
  selectActiveProvider: async (providerId) => {
    fallbackState.settings.activeProviderId = providerId;
    return fallbackState.settings;
  },
  getMessages: async () => [],
  createConversation: async (title = 'New Conversation', workflowId = null) => {
    const conv = {
      id: crypto.randomUUID(),
      title,
      workflowId,
      pinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    fallbackState.conversations.unshift(conv);
    return conv;
  },
  renameConversation: async (id, title) => {
    const found = fallbackState.conversations.find((c) => c.id === id)!;
    found.title = title;
    return found;
  },
  deleteConversation: async (id) => {
    fallbackState.conversations = fallbackState.conversations.filter((c) => c.id !== id);
  },
  sendMessage: async ({ conversationId, content }) => {
    const id = conversationId || crypto.randomUUID();
    setTimeout(() => {
      listeners.forEach((cb) =>
        cb({
          type: 'error',
          conversationId: id,
          friendlyMessage: `Launch the AuraDesk desktop app window to run "${content.slice(0, 32)}".`,
        })
      );
    }, 50);
    return { conversationId: id };
  },
  stopGeneration: async () => {},
  onStreamEvent: (cb) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  resolveSafetyRequest: async () => {},
  pickAndAddFolder: async () => null,
  updateFolderTrust: async (id, trustMode) => ({
    id,
    folderPath: '/Documents',
    label: 'Documents',
    trustMode,
    createdAt: new Date().toISOString(),
  }),
  removeFolder: async () => {},
  pickAndParseDocuments: async () => [],
  parseDroppedDocument: async (p) => ({
    id: crypto.randomUUID(),
    name: p.name,
    mimeType: p.mimeType,
    sizeBytes: p.sizeBytes,
    summaryPreview: 'Document attached',
    extractedText: '',
  }),
  saveMcpServer: async (input) => ({
    id: input.id || crypto.randomUUID(),
    name: input.name,
    description: input.description,
    transport: input.transport,
    command: input.command || null,
    args: input.args || [],
    url: input.url || null,
    envKeys: Object.keys(input.envVars || {}),
    enabled: true,
    lastStatus: 'idle',
    lastError: null,
    discoveredTools: [],
    createdAt: new Date().toISOString(),
  }),
  toggleMcpServer: async (id, enabled) => ({
    ...fallbackState.mcpServers.find((s) => s.id === id)!,
    enabled,
  }),
  testMcpServer: async () => ({
    ok: true,
    status: 'connected',
    message: 'Connected',
    tools: [],
  }),
  deleteMcpServer: async () => {},
  saveMemory: async (input) => ({
    id: input.id || crypto.randomUUID(),
    content: input.content,
    category: input.category || 'About You',
    colorTag: input.colorTag || 'amber',
    pinned: Boolean(input.pinned),
    sourceConversationId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  togglePinMemory: async (id, pinned) => ({
    ...fallbackState.memories.find((m) => m.id === id)!,
    pinned,
  }),
  deleteMemory: async () => {},
  saveWorkflow: async (input) => ({
    id: input.id || crypto.randomUUID(),
    title: input.title,
    description: input.description,
    iconName: input.iconName,
    category: input.category,
    promptTemplate: input.promptTemplate,
    requiredTools: input.requiredTools,
    outputArtifactHint: input.outputArtifactHint || null,
    isBuiltin: false,
    createdAt: new Date().toISOString(),
  }),
  deleteWorkflow: async () => {},
  saveArtifact: async (input) => ({
    id: input.id || crypto.randomUUID(),
    conversationId: input.conversationId || null,
    title: input.title,
    kind: input.kind,
    language: input.language || null,
    content: input.content,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }),
  deleteArtifact: async () => {},
  exportArtifact: async () => ({ ok: true, message: 'Exported' }),
  openExternalUrl: async (url) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  },
};

export const desktopApi: AuraDeskBridge =
  typeof window !== 'undefined' && window.auradesk ? window.auradesk : browserFallbackBridge;
