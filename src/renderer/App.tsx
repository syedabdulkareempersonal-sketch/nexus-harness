import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArtifactCanvas } from './components/ArtifactCanvas';
import { ChatWorkspace } from './components/ChatWorkspace';
import { CommandPalette } from './components/CommandPalette';
import { MemoryDrawer } from './components/MemoryDrawer';
import { OnboardingWizard } from './components/OnboardingWizard';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar, type NavTab } from './components/Sidebar';
import { SuperpowersStore } from './components/SuperpowersStore';
import { WindowTitleBar } from './components/WindowTitleBar';
import { WorkflowStudio } from './components/WorkflowStudio';
import { desktopApi } from './lib/bridge';
import type {
  AllowedFolder,
  AppSettings,
  ArtifactItem,
  BuiltInToolSettings,
  ChatMessage,
  ConversationSummary,
  ExportArtifactFormat,
  FileAttachment,
  FolderTrustMode,
  McpServerConfig,
  MemoryItem,
  PendingSafetyRequest,
  ProviderConfig,
  ProviderId,
  SaveArtifactInput,
  SaveMcpServerInput,
  SaveMemoryInput,
  SaveWorkflowInput,
  SafetyDecision,
  WorkflowItem,
} from '@shared/types';

export const App: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [providers, setProviders] = useState<ProviderConfig[]>([]);
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [allowedFolders, setAllowedFolders] = useState<AllowedFolder[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [workflows, setWorkflows] = useState<WorkflowItem[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [artifacts, setArtifacts] = useState<ArtifactItem[]>([]);

  const [activeTab, setActiveTab] = useState<NavTab>('chat');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draftInput, setDraftInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [pendingSafety, setPendingSafety] = useState<PendingSafetyRequest | null>(null);
  const [activeArtifactId, setActiveArtifactId] = useState<string | null>(null);
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [memoryOpen, setMemoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);

  const refreshBootstrap = useCallback(async () => {
    const data = await desktopApi.bootstrap();
    setSettings(data.settings);
    setProviders(data.providers);
    setConversations(data.conversations);
    setAllowedFolders(data.allowedFolders);
    setMcpServers(data.mcpServers);
    setWorkflows(data.workflows);
    setMemories(data.memories);
    setArtifacts(data.artifacts);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  // Apply Daylight / Midnight Mica theme cleanly
  useEffect(() => {
    if (!settings) return;
    const prefersDark =
      window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark =
      settings.theme === 'dark' || (settings.theme === 'system' && prefersDark);
    document.documentElement.classList.toggle('dark', isDark);
  }, [settings]);

  const loadConversationHistory = useCallback(async (id: string) => {
    setActiveConversationId(id);
    setErrorBanner(null);
    const loaded = await desktopApi.getMessages(id);
    setMessages(loaded);
  }, []);

  // Instant keyboard shortcuts: Ctrl+N (New Session) & Ctrl+K (Quick Command Launcher)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setActiveTab('chat');
        setActiveConversationId(null);
        setMessages([]);
        setCanvasOpen(false);
        setErrorBanner(null);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Subscribe to real-time main-process stream events
  useEffect(() => {
    const unsubscribe = desktopApi.onStreamEvent((event) => {
      if (event.type === 'conversation-ready') {
        setConversations((prev) => {
          const filtered = prev.filter((c) => c.id !== event.conversation.id);
          return [event.conversation, ...filtered];
        });
        setActiveConversationId(event.conversation.id);
        setIsStreaming(true);
        setErrorBanner(null);

        const placeholderAssistant: ChatMessage = {
          id: event.assistantMessageId,
          conversationId: event.conversation.id,
          role: 'assistant',
          content: '',
          toolActivities: [],
          attachments: [],
          artifactIds: [],
          createdAt: new Date().toISOString(),
        };
        setMessages((prev) => {
          const withoutDup = prev.filter(
            (m) => m.id !== event.userMessage.id && m.id !== event.assistantMessageId
          );
          return [...withoutDup, event.userMessage, placeholderAssistant];
        });
      } else if (event.type === 'text-delta') {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId ? { ...m, content: m.content + event.delta } : m
          )
        );
      } else if (event.type === 'activity-update') {
        setMessages((prev) =>
          prev.map((m) => {
            if (m.id !== event.messageId) return m;
            const idx = m.toolActivities.findIndex((a) => a.id === event.activity.id);
            const nextActivities =
              idx >= 0
                ? m.toolActivities.map((a, i) => (i === idx ? event.activity : a))
                : [...m.toolActivities, event.activity];
            return { ...m, toolActivities: nextActivities };
          })
        );
      } else if (event.type === 'artifact-upsert') {
        setArtifacts((prev) => {
          const without = prev.filter((a) => a.id !== event.artifact.id);
          return [event.artifact, ...without];
        });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId && !m.artifactIds.includes(event.artifact.id)
              ? { ...m, artifactIds: [...m.artifactIds, event.artifact.id] }
              : m
          )
        );
        setActiveArtifactId(event.artifact.id);
        setCanvasOpen(true);
      } else if (event.type === 'memory-created') {
        setMemories((prev) => [event.memory, ...prev.filter((m) => m.id !== event.memory.id)]);
      } else if (event.type === 'safety-request') {
        setPendingSafety(event.request);
      } else if (event.type === 'safety-resolved') {
        setPendingSafety((curr) =>
          curr && curr.requestId === event.requestId ? null : curr
        );
      } else if (event.type === 'folder-updated') {
        setAllowedFolders((prev) =>
          prev.map((f) => (f.id === event.folder.id ? event.folder : f))
        );
      } else if (event.type === 'provider-updated') {
        setProviders((prev) =>
          prev.map((p) => (p.id === event.provider.id ? event.provider : p))
        );
      } else if (event.type === 'done') {
        setIsStreaming(false);
        setPendingSafety(null);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.assistantMessage.id ? event.assistantMessage : m
          )
        );
        setConversations((prev) => {
          const rest = prev.filter((c) => c.id !== event.conversation.id);
          return [event.conversation, ...rest];
        });
      } else if (event.type === 'error') {
        setIsStreaming(false);
        setPendingSafety(null);
        setErrorBanner(event.friendlyMessage);
      }
    });

    return unsubscribe;
  }, []);

  const artifactsForConversation = useMemo(() => {
    if (!activeConversationId) return artifacts.slice(0, 6);
    const matching = artifacts.filter((a) => a.conversationId === activeConversationId);
    return matching.length > 0 ? matching : [];
  }, [artifacts, activeConversationId]);

  const activeArtifact = useMemo(() => {
    if (activeArtifactId) {
      const exact = artifacts.find((a) => a.id === activeArtifactId);
      if (exact) return exact;
    }
    return artifactsForConversation[0] || null;
  }, [artifacts, activeArtifactId, artifactsForConversation]);

  const activeSuperpowerCount = useMemo(() => {
    if (!settings) return 3;
    const builtInOn = Object.values(settings.builtInTools).filter(Boolean).length;
    const mcpOn = mcpServers.filter((s) => s.enabled).length;
    return builtInOn + mcpOn;
  }, [settings, mcpServers]);

  const activeProviderObj = useMemo(
    () => providers.find((p) => p.id === settings?.activeProviderId) ?? providers[0],
    [providers, settings?.activeProviderId]
  );

  if (loading || !settings) {
    return (
      <div className="win12-mica-bg flex h-screen w-screen items-center justify-center text-sm font-medium text-ink-secondary">
        Launching AuraDesk Studio...
      </div>
    );
  }

  const handleToggleTheme = async () => {
    const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
    const updated = await desktopApi.updateSettings({ theme: nextTheme });
    setSettings(updated);
  };

  if (!settings.onboardingCompleted) {
    return (
      <OnboardingWizard
        providers={providers}
        allowedFolders={allowedFolders}
        theme={settings.theme}
        onToggleTheme={handleToggleTheme}
        onFoldersChanged={setAllowedFolders}
        onProvidersChanged={refreshBootstrap}
        onComplete={async (selectedProviderId) => {
          const next = await desktopApi.updateSettings({
            onboardingCompleted: true,
            activeProviderId: selectedProviderId,
          });
          setSettings(next);
        }}
      />
    );
  }

  const handleNewChat = () => {
    setActiveTab('chat');
    setActiveConversationId(null);
    setMessages([]);
    setCanvasOpen(false);
    setErrorBanner(null);
  };

  const handleSendMessage = async (content: string, attachments: FileAttachment[]) => {
    setIsStreaming(true);
    setErrorBanner(null);
    await desktopApi.sendMessage({
      conversationId: activeConversationId || undefined,
      content,
      attachments,
    });
  };

  const handleStopGeneration = async () => {
    if (activeConversationId) {
      await desktopApi.stopGeneration(activeConversationId);
    }
    setIsStreaming(false);
  };

  const handleResolveSafety = async (requestId: string, decision: SafetyDecision) => {
    await desktopApi.resolveSafetyRequest(requestId, decision);
    setPendingSafety(null);
  };

  const handleSwitchProvider = async (providerId: ProviderId, model?: string) => {
    const updated = await desktopApi.selectActiveProvider(providerId, model);
    setSettings(updated);
    if (model) {
      await refreshBootstrap();
    }
  };

  const handleToggleBuiltIn = async (key: keyof BuiltInToolSettings, enabled: boolean) => {
    const updated = await desktopApi.updateSettings({
      builtInTools: {
        ...settings.builtInTools,
        [key]: enabled,
      },
    });
    setSettings(updated);
  };

  const handlePickFolder = async () => {
    const folder = await desktopApi.pickAndAddFolder();
    if (folder) {
      setAllowedFolders((prev) =>
        prev.some((f) => f.id === folder.id) ? prev : [...prev, folder]
      );
    }
  };

  const handleUpdateFolderTrust = async (id: string, trustMode: FolderTrustMode) => {
    const updated = await desktopApi.updateFolderTrust(id, trustMode);
    setAllowedFolders((prev) => prev.map((f) => (f.id === id ? updated : f)));
  };

  const handleRemoveFolder = async (id: string) => {
    await desktopApi.removeFolder(id);
    setAllowedFolders((prev) => prev.filter((f) => f.id !== id));
  };

  const handleSaveMcp = async (input: SaveMcpServerInput) => {
    const saved = await desktopApi.saveMcpServer(input);
    setMcpServers((prev) => {
      const rest = prev.filter((s) => s.id !== saved.id);
      return [...rest, saved];
    });
  };

  const handleToggleMcp = async (id: string, enabled: boolean) => {
    const updated = await desktopApi.toggleMcpServer(id, enabled);
    setMcpServers((prev) => prev.map((s) => (s.id === id ? updated : s)));
  };

  const handleTestMcp = async (id: string) => {
    const res = await desktopApi.testMcpServer(id);
    await refreshBootstrap();
    return { ok: res.ok, message: res.message };
  };

  const handleDeleteMcp = async (id: string) => {
    await desktopApi.deleteMcpServer(id);
    setMcpServers((prev) => prev.filter((s) => s.id !== id));
  };

  const handleSaveMemory = async (input: SaveMemoryInput) => {
    const saved = await desktopApi.saveMemory(input);
    setMemories((prev) => {
      const rest = prev.filter((m) => m.id !== saved.id);
      return [saved, ...rest].sort((a, b) => Number(b.pinned) - Number(a.pinned));
    });
  };

  const handleTogglePinMemory = async (id: string, pinned: boolean) => {
    const saved = await desktopApi.togglePinMemory(id, pinned);
    setMemories((prev) =>
      prev
        .map((m) => (m.id === id ? saved : m))
        .sort((a, b) => Number(b.pinned) - Number(a.pinned))
    );
  };

  const handleDeleteMemory = async (id: string) => {
    await desktopApi.deleteMemory(id);
    setMemories((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSaveWorkflow = async (input: SaveWorkflowInput) => {
    const saved = await desktopApi.saveWorkflow(input);
    setWorkflows((prev) => [...prev.filter((w) => w.id !== saved.id), saved]);
  };

  const handleDeleteWorkflow = async (id: string) => {
    await desktopApi.deleteWorkflow(id);
    setWorkflows((prev) => prev.filter((w) => w.id !== id));
  };

  const handleRunWorkflow = (wf: WorkflowItem) => {
    setActiveTab('chat');
    setActiveConversationId(null);
    setMessages([]);
    setCanvasOpen(false);
    setDraftInput(wf.promptTemplate);
  };

  const handleSaveArtifact = async (input: SaveArtifactInput) => {
    const saved = await desktopApi.saveArtifact(input);
    setArtifacts((prev) => [saved, ...prev.filter((a) => a.id !== saved.id)]);
    return saved;
  };

  const handleExportArtifact = async (
    artifactId: string,
    format: ExportArtifactFormat
  ): Promise<string | null> => {
    const res = await desktopApi.exportArtifact(artifactId, format);
    if (res.canceled) return null;
    return res.message;
  };

  return (
    <div className="win12-mica-bg flex h-screen w-screen flex-col overflow-hidden text-ink">
      {/* Windows 12 Pro Frameless Top Shell */}
      <WindowTitleBar
        activeProvider={activeProviderObj}
        theme={settings.theme}
        memoryCount={memories.length}
        memoryOpen={memoryOpen}
        artifactCount={artifactsForConversation.length}
        canvasOpen={canvasOpen && Boolean(activeArtifact)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleMemory={() => setMemoryOpen((v) => !v)}
        onToggleCanvas={() => setCanvasOpen((v) => !v)}
        onToggleTheme={handleToggleTheme}
      />

      {/* Detached Floating Glass Islands */}
      <div className="flex min-h-0 flex-1 gap-2.5 px-2.5 pb-2.5">
        <Sidebar
          activeTab={activeTab}
          conversations={conversations}
          activeConversationId={activeConversationId}
          activeSuperpowerCount={activeSuperpowerCount}
          workflowCount={workflows.length}
          onSelectTab={setActiveTab}
          onNewChat={handleNewChat}
          onSelectConversation={(id) => {
            setCanvasOpen(false);
            void loadConversationHistory(id);
          }}
          onDeleteConversation={async (id) => {
            await desktopApi.deleteConversation(id);
            setConversations((prev) => prev.filter((c) => c.id !== id));
            if (activeConversationId === id) {
              handleNewChat();
            }
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />

        {activeTab === 'chat' && (
          <>
            <ChatWorkspace
              messages={messages}
              isStreaming={isStreaming}
              errorBanner={errorBanner}
              providers={providers}
              activeProviderId={settings.activeProviderId}
              allowedFolders={allowedFolders}
              workflows={workflows}
              artifactsForConversation={artifactsForConversation}
              pendingSafety={pendingSafety}
              draftInput={draftInput}
              onDraftInputChange={setDraftInput}
              onSend={handleSendMessage}
              onStop={handleStopGeneration}
              onResolveSafety={handleResolveSafety}
              onSwitchProvider={handleSwitchProvider}
              onOpenSettings={() => setSettingsOpen(true)}
              onPickFolder={handlePickFolder}
              onOpenArtifact={(art) => {
                setActiveArtifactId(art.id);
                setCanvasOpen(true);
              }}
            />

            {canvasOpen && activeArtifact && (
              <ArtifactCanvas
                artifact={activeArtifact}
                allArtifacts={
                  artifactsForConversation.length > 0
                    ? artifactsForConversation
                    : [activeArtifact]
                }
                onSelectArtifact={(art) => setActiveArtifactId(art.id)}
                onSaveArtifact={handleSaveArtifact}
                onExportArtifact={handleExportArtifact}
                onClose={() => setCanvasOpen(false)}
              />
            )}

            <MemoryDrawer
              open={memoryOpen}
              memories={memories}
              autoMemoryEnabled={settings.autoMemoryEnabled}
              onClose={() => setMemoryOpen(false)}
              onSaveMemory={handleSaveMemory}
              onTogglePin={handleTogglePinMemory}
              onDeleteMemory={handleDeleteMemory}
              onToggleAutoMemory={async (enabled) => {
                const updated = await desktopApi.updateSettings({ autoMemoryEnabled: enabled });
                setSettings(updated);
              }}
            />
          </>
        )}

        {activeTab === 'workflows' && (
          <WorkflowStudio
            workflows={workflows}
            onRunWorkflow={handleRunWorkflow}
            onSaveWorkflow={handleSaveWorkflow}
            onDeleteWorkflow={handleDeleteWorkflow}
          />
        )}

        {activeTab === 'superpowers' && (
          <SuperpowersStore
            builtInTools={settings.builtInTools}
            allowedFolders={allowedFolders}
            mcpServers={mcpServers}
            onToggleBuiltIn={handleToggleBuiltIn}
            onPickFolder={handlePickFolder}
            onUpdateFolderTrust={handleUpdateFolderTrust}
            onRemoveFolder={handleRemoveFolder}
            onSaveMcpServer={handleSaveMcp}
            onToggleMcpServer={handleToggleMcp}
            onTestMcpServer={handleTestMcp}
            onDeleteMcpServer={handleDeleteMcp}
          />
        )}
      </div>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        providers={providers}
        onClose={() => setSettingsOpen(false)}
        onRefreshState={refreshBootstrap}
      />

      <CommandPalette
        open={commandPaletteOpen}
        providers={providers}
        workflows={workflows}
        theme={settings.theme}
        onClose={() => setCommandPaletteOpen(false)}
        onNewChat={handleNewChat}
        onOpenSuperpowers={() => setActiveTab('superpowers')}
        onOpenWorkflows={() => setActiveTab('workflows')}
        onOpenSettings={() => setSettingsOpen(true)}
        onToggleMemory={() => setMemoryOpen((v) => !v)}
        onToggleTheme={handleToggleTheme}
        onPickFolder={handlePickFolder}
        onSwitchProvider={(id) => handleSwitchProvider(id)}
        onRunWorkflow={handleRunWorkflow}
      />
    </div>
  );
};
