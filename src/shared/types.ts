export type ProviderId =
  | 'google'
  | 'openai'
  | 'anthropic'
  | 'openrouter'
  | 'ollama'
  | 'demo';

export type ThemeMode = 'light' | 'dark' | 'system';

export interface ProviderConfig {
  id: ProviderId;
  displayName: string;
  hasKey: boolean;
  keyHint: string | null;
  baseUrl: string | null;
  selectedModel: string;
  availableModels: string[];
  isVerified: boolean;
  updatedAt: string;
}

export interface VerifyProviderInput {
  providerId: ProviderId;
  apiKey?: string;
  baseUrl?: string;
  selectedModel?: string;
}

export interface VerifyProviderResult {
  ok: boolean;
  latencyMs: number;
  message: string;
  detectedModels?: string[];
  provider?: ProviderConfig;
}

export interface OllamaDetectionResult {
  available: boolean;
  baseUrl: string;
  models: string[];
  latencyMs: number;
  message: string;
}

export interface BuiltInToolSettings {
  smartFolders: boolean;
  webResearch: boolean;
  documentAnalyst: boolean;
}

export type FolderTrustMode = 'ask' | 'trusted';

export interface AllowedFolder {
  id: string;
  folderPath: string;
  label: string;
  trustMode: FolderTrustMode;
  createdAt: string;
}

export type McpTransportType = 'stdio' | 'sse' | 'streamable-http';

export interface McpServerConfig {
  id: string;
  name: string;
  description: string;
  transport: McpTransportType;
  command: string | null;
  args: string[];
  url: string | null;
  envKeys: string[];
  enabled: boolean;
  lastStatus: 'connected' | 'error' | 'idle';
  lastError: string | null;
  discoveredTools: string[];
  createdAt: string;
}

export interface SaveMcpServerInput {
  id?: string;
  name: string;
  description: string;
  transport: McpTransportType;
  command?: string;
  args?: string[];
  url?: string;
  envVars?: Record<string, string>;
  enabled?: boolean;
}

export interface McpTestResult {
  ok: boolean;
  status: 'connected' | 'error';
  message: string;
  tools: string[];
}

export type SafetyDecision = 'allow_once' | 'trust_folder' | 'block';

export interface PendingSafetyRequest {
  requestId: string;
  conversationId: string;
  headline: string;
  whatWillHappen: string;
  whyExplanation: string;
  targetPath?: string;
  folderId?: string;
  folderLabel?: string;
  canTrustFolder: boolean;
  previewText?: string;
  riskLevel: 'gentle' | 'caution';
  createdAt: string;
}

export type MemoryCategory = 'About You' | 'Preferences' | 'Projects' | 'Important';
export type MemoryColorTag = 'amber' | 'sage' | 'sky' | 'rose';

export interface MemoryItem {
  id: string;
  content: string;
  category: MemoryCategory;
  colorTag: MemoryColorTag;
  pinned: boolean;
  sourceConversationId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveMemoryInput {
  id?: string;
  content: string;
  category?: MemoryCategory;
  colorTag?: MemoryColorTag;
  pinned?: boolean;
  sourceConversationId?: string | null;
}

export interface WorkflowItem {
  id: string;
  title: string;
  description: string;
  iconName: string;
  category: string;
  promptTemplate: string;
  requiredTools: string[];
  outputArtifactHint: string | null;
  isBuiltin: boolean;
  createdAt: string;
}

export interface SaveWorkflowInput {
  id?: string;
  title: string;
  description: string;
  iconName: string;
  category: string;
  promptTemplate: string;
  requiredTools: string[];
  outputArtifactHint?: string | null;
}

export type ArtifactKind = 'markdown' | 'html' | 'table' | 'code';

export interface ArtifactItem {
  id: string;
  conversationId: string | null;
  title: string;
  kind: ArtifactKind;
  language: string | null;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface SaveArtifactInput {
  id?: string;
  conversationId?: string | null;
  title: string;
  kind: ArtifactKind;
  language?: string | null;
  content: string;
}

export type ExportArtifactFormat = 'pdf' | 'markdown' | 'html';

export interface ExportArtifactResult {
  ok: boolean;
  savedPath?: string;
  canceled?: boolean;
  message: string;
}

export interface ToolActivity {
  id: string;
  toolName: string;
  friendlyLabel: string;
  status: 'running' | 'completed' | 'blocked' | 'error';
  detail?: string;
}

export interface FileAttachment {
  id: string;
  name: string;
  filePath?: string;
  mimeType: string;
  sizeBytes: number;
  summaryPreview: string;
  extractedText: string;
}

export interface ConversationSummary {
  id: string;
  title: string;
  workflowId: string | null;
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  toolActivities: ToolActivity[];
  attachments: FileAttachment[];
  artifactIds: string[];
  createdAt: string;
}

export interface AppSettings {
  onboardingCompleted: boolean;
  activeProviderId: ProviderId;
  theme: ThemeMode;
  builtInTools: BuiltInToolSettings;
  autoMemoryEnabled: boolean;
}

export interface AppBootstrapPayload {
  settings: AppSettings;
  providers: ProviderConfig[];
  conversations: ConversationSummary[];
  allowedFolders: AllowedFolder[];
  mcpServers: McpServerConfig[];
  workflows: WorkflowItem[];
  memories: MemoryItem[];
  artifacts: ArtifactItem[];
}

export interface SendMessageInput {
  conversationId?: string;
  content: string;
  attachments?: FileAttachment[];
  workflowId?: string | null;
}

export type StreamEvent =
  | {
      type: 'conversation-ready';
      conversation: ConversationSummary;
      userMessage: ChatMessage;
      assistantMessageId: string;
    }
  | {
      type: 'text-delta';
      conversationId: string;
      messageId: string;
      delta: string;
    }
  | {
      type: 'activity-update';
      conversationId: string;
      messageId: string;
      activity: ToolActivity;
    }
  | {
      type: 'artifact-upsert';
      conversationId: string;
      messageId: string;
      artifact: ArtifactItem;
    }
  | {
      type: 'memory-created';
      memory: MemoryItem;
    }
  | {
      type: 'safety-request';
      request: PendingSafetyRequest;
    }
  | {
      type: 'safety-resolved';
      requestId: string;
      decision: SafetyDecision;
    }
  | {
      type: 'folder-updated';
      folder: AllowedFolder;
    }
  | {
      type: 'done';
      conversationId: string;
      assistantMessage: ChatMessage;
      conversation: ConversationSummary;
    }
  | {
      type: 'error';
      conversationId: string;
      messageId?: string;
      friendlyMessage: string;
    };

export interface AuraDeskBridge {
  bootstrap(): Promise<AppBootstrapPayload>;
  updateSettings(partial: Partial<AppSettings>): Promise<AppSettings>;

  // Providers & Onboarding
  verifyAndSaveProvider(input: VerifyProviderInput): Promise<VerifyProviderResult>;
  detectOllama(customBaseUrl?: string): Promise<OllamaDetectionResult>;
  selectActiveProvider(providerId: ProviderId, model?: string): Promise<AppSettings>;

  // Conversations & Streaming Chat
  getMessages(conversationId: string): Promise<ChatMessage[]>;
  createConversation(title?: string, workflowId?: string | null): Promise<ConversationSummary>;
  renameConversation(id: string, title: string): Promise<ConversationSummary>;
  deleteConversation(id: string): Promise<void>;
  sendMessage(input: SendMessageInput): Promise<{ conversationId: string }>;
  stopGeneration(conversationId: string): Promise<void>;
  onStreamEvent(callback: (event: StreamEvent) => void): () => void;

  // Safety Guardrail
  resolveSafetyRequest(requestId: string, decision: SafetyDecision): Promise<void>;

  // Smart Folder Assistant
  pickAndAddFolder(): Promise<AllowedFolder | null>;
  updateFolderTrust(id: string, trustMode: FolderTrustMode): Promise<AllowedFolder>;
  removeFolder(id: string): Promise<void>;

  // Document & PDF Analyst
  pickAndParseDocuments(): Promise<FileAttachment[]>;
  parseDroppedDocument(payload: {
    name: string;
    mimeType: string;
    sizeBytes: number;
    base64Data: string;
    filePath?: string;
  }): Promise<FileAttachment>;

  // Visual MCP Store
  saveMcpServer(input: SaveMcpServerInput): Promise<McpServerConfig>;
  toggleMcpServer(id: string, enabled: boolean): Promise<McpServerConfig>;
  testMcpServer(id: string): Promise<McpTestResult>;
  deleteMcpServer(id: string): Promise<void>;

  // Memory Board
  saveMemory(input: SaveMemoryInput): Promise<MemoryItem>;
  togglePinMemory(id: string, pinned: boolean): Promise<MemoryItem>;
  deleteMemory(id: string): Promise<void>;

  // Workflow Studio
  saveWorkflow(input: SaveWorkflowInput): Promise<WorkflowItem>;
  deleteWorkflow(id: string): Promise<void>;

  // Split-View Artifact Canvas
  saveArtifact(input: SaveArtifactInput): Promise<ArtifactItem>;
  deleteArtifact(id: string): Promise<void>;
  exportArtifact(artifactId: string, format: ExportArtifactFormat): Promise<ExportArtifactResult>;

  // External Links
  openExternalUrl(url: string): Promise<void>;
}

declare global {
  interface Window {
    auradesk: AuraDeskBridge;
  }
}
