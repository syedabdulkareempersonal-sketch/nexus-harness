import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import { ArtifactCanvas } from './components/ArtifactCanvas';
import { ChatWorkspace } from './components/ChatWorkspace';
import { MemoryDrawer } from './components/MemoryDrawer';
import { OnboardingWizard } from './components/OnboardingWizard';
import { SettingsModal } from './components/SettingsModal';
import { Sidebar, type ActiveNavTab } from './components/Sidebar';
import { SuperpowersStore } from './components/SuperpowersStore';
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
  McpServerConfig,
  MemoryItem,
  PendingSafetyRequest,
  ProviderConfig,
  ProviderId,
  SafetyDecision,
  StreamEvent,
  WorkflowItem,
} from '@shared/types';

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      const commaIdx = result.indexOf(',');
      resolve(commaIdx >= 0 ? result.slice(commaIdx + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

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

  const [activeTab, setActiveTab] = useState<ActiveNavTab>('chat');
  const [activeConversationId, setActiveConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streamingConvId, setStreamingConvId] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  const [memoryOpen, setMemoryOpen] = useState(false);
  const [activeArtifact, setActiveArtifact] = useState<ArtifactItem | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [prefillPrompt, setPrefillPrompt] = useState('');
  const [pendingSafetyRequests, setPendingSafetyRequests] = useState<PendingSafetyRequest[]>([]);

  const refreshBootstrap = useCallback(async () => {
    const payload = await desktopApi.bootstrap();
    setSettings(payload.settings);
    setProviders(payload.providers);
    setConversations(payload.conversations);
    setAllowedFolders(payload.allowedFolders);
    setMcpServers(payload.mcpServers);
    setWorkflows(payload.workflows);
    setMemories(payload.memories);
    setArtifacts(payload.artifacts);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refreshBootstrap();
  }, [refreshBootstrap]);

  // Apply light/dark theme class to <html>
  useEffect(() => {
    if (!settings) return;
    const prefersDark =
      settings.theme === 'dark' ||
      (settings.theme === 'system' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.classList.toggle('dark', prefersDark);
  }, [settings]);

  // Instant keyboard shortcuts (no animation delay)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'n') {
        e.preventDefault();
        setActiveTab('chat');
        setActiveConversationId(null);
        setMessages([]);
        setActiveArtifact(null);
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setMemoryOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Load messages when conversation selection changes
  useEffect(() => {
    if (!activeConversationId) {
      setMessages([]);
      return;
    }
    void desktopApi.getMessages(activeConversationId).then((loaded) => {
      setMessages(loaded);
    });
  }, [activeConversationId]);

  // Subscribe to Main-process real-time AI stream events
  useEffect(() => {
    const unsubscribe = desktopApi.onStreamEvent((event: StreamEvent) => {
      if (event.type === 'conversation-ready') {
        setConversations((prev) => {
          const filtered = prev.filter((c) => c.id !== event.conversation.id);
          return [event.conversation, ...filtered];
        });
        setActiveConversationId(event.conversation.id);
        setStreamingConvId(event.conversation.id);

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
            const exists = m.toolActivities.some((a) => a.id === event.activity.id);
            const updatedActivities = exists
              ? m.toolActivities.map((a) =>
                  a.id === event.activity.id ? event.activity : a
                )
              : [...m.toolActivities, event.activity];
            return { ...m, toolActivities: updatedActivities };
          })
        );
      } else if (event.type === 'artifact-upsert') {
        setArtifacts((prev) => {
          const without = prev.filter((a) => a.id !== event.artifact.id);
          return [event.artifact, ...without];
        });
        setActiveArtifact(event.artifact);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.messageId && !m.artifactIds.includes(event.artifact.id)
              ? { ...m, artifactIds: [...m.artifactIds, event.artifact.id] }
              : m
          )
        );
      } else if (event.type === 'memory-created') {
        setMemories((prev) => [event.memory, ...prev.filter((m) => m.id !== event.memory.id)]);
      } else if (event.type === 'safety-request') {
        setPendingSafetyRequests((prev) => [...prev, event.request]);
      } else if (event.type === 'safety-resolved') {
        setPendingSafetyRequests((prev) =>
          prev.filter((r) => r.requestId !== event.requestId)
        );
      } else if (event.type === 'folder-updated') {
        setAllowedFolders((prev) =>
          prev.map((f) => (f.id === event.folder.id ? event.folder : f))
        );
      } else if (event.type === 'done') {
        setStreamingConvId(null);
        setMessages((prev) =>
          prev.map((m) =>
            m.id === event.assistantMessage.id ? event.assistantMessage : m
          )
        );
        setConversations((prev) => [
          event.conversation,
          ...prev.filter((c) => c.id !== event.conversation.id),
        ]);
      } else if (event.type === 'error') {
        setStreamingConvId(null);
        setErrorBanner(event.friendlyMessage);
        if (event.messageId) {
          setMessages((prev) =>
            prev.filter((m) => !(m.id === event.messageId && !m.content))
          );
        }
      }
    });

    return unsubscribe;
  }, []);

  const enabledToolsCount = useMemo(() => {
    if (!settings) return 0;
    const builtIns = Object.values(settings.builtInTools).filter(Boolean).length;
    const activeMcp = mcpServers.filter((s) => s.enabled).length;
    return builtIns + activeMcp;
  }, [settings, mcpServers]);

  const conversationArtifacts = useMemo(() => {
    if (!activeConversationId) return artifacts.slice(0, 6);
    const matching = artifacts.filter((a) => a.conversationId === activeConversationId);
    return matching.length > 0 ? matching : [];
  }, [artifacts, activeConversationId]);

  if (loading || !settings) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-canvas text-sm text-ink-secondary">
        Opening AuraDesk...
      </div>
    );
  }

  if (!settings.onboardingCompleted) {
    return (
      <OnboardingWizard
        providers={providers}
        allowedFolders={allowedFolders}
        onFoldersChanged={setAllowedFolders}
        onProvidersChanged={refreshBootstrap}
        onComplete={async (providerId) => {
          const updated = await desktopApi.updateSettings({
            onboardingCompleted: true,
            activeProviderId: providerId,
          });
          setSettings(updated);
        }}
      />
    );
  }

  const handleSendMessage = async (content: string, attached: FileAttachment[]) => {
    setErrorBanner(null);
    const { conversationId } = await desktopApi.sendMessage({
      conversationId: activeConversationId || undefined,
      content,
      attachments: attached,
    });
    setActiveConversationId(conversationId);
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
    const added = await desktopApi.pickAndAddFolder();
    if (added) {
      setAllowedFolders((prev) => [
        ...prev.filter((f) => f.id !== added.id),
        added,
      ]);
    }
  };

  const handleDropFile = async (file: File): Promise<FileAttachment> => {
    const base64Data = await fileToBase64(file);
    return desktopApi.parseDroppedDocument({
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      base64Data,
    });
  };

  const handleResolveSafety = async (requestId: string, decision: SafetyDecision) => {
    await desktopApi.resolveSafetyRequest(requestId, decision);
    setPendingSafetyRequests((prev) => prev.filter((r) => r.requestId !== requestId));
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
    <div className="flex h-screen w-screen overflow-hidden bg-canvas text-ink">
      <Sidebar
        activeTab={activeTab}
        conversations={conversations}
        activeConversationId={activeConversationId}
        enabledToolsCount={enabledToolsCount}
        theme={settings.theme}
        onSelectTab={setActiveTab}
        onNewChat={() => {
          setActiveTab('chat');
          setActiveConversationId(null);
          setMessages([]);
          setActiveArtifact(null);
        }}
        onSelectConversation={(id) => {
          setActiveConversationId(id);
          const matchingArt = artifacts.find((a) => a.conversationId === id) || null;
          setActiveArtifact(matchingArt);
        }}
        onDeleteConversation={async (id) => {
          await desktopApi.deleteConversation(id);
          setConversations((prev) => prev.filter((c) => c.id !== id));
          if (activeConversationId === id) {
            setActiveConversationId(null);
            setMessages([]);
            setActiveArtifact(null);
          }
        }}
        onToggleTheme={async () => {
          const nextTheme = settings.theme === 'dark' ? 'light' : 'dark';
          const updated = await desktopApi.updateSettings({ theme: nextTheme });
          setSettings(updated);
        }}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Primary Center Surface */}
      <div className="flex min-w-0 flex-1 overflow-hidden">
        {activeTab === 'chat' && (
          <>
            <ChatWorkspace
              messages={messages}
              isStreaming={Boolean(streamingConvId)}
              errorBanner={errorBanner}
              providers={providers}
              activeProviderId={settings.activeProviderId}
              allowedFolders={allowedFolders}
              workflows={workflows}
              memoriesCount={memories.length}
              memoryOpen={memoryOpen}
              canvasOpen={Boolean(activeArtifact)}
              conversationArtifacts={conversationArtifacts}
              pendingSafetyRequests={pendingSafetyRequests}
              prefillPrompt={prefillPrompt}
              onClearPrefill={() => setPrefillPrompt('')}
              onSendMessage={handleSendMessage}
              onStopGeneration={async () => {
                if (streamingConvId) {
                  await desktopApi.stopGeneration(streamingConvId);
                  setStreamingConvId(null);
                }
              }}
              onSelectProvider={async (providerId: ProviderId, model?: string) => {
                const updated = await desktopApi.selectActiveProvider(providerId, model);
                setSettings(updated);
                const refreshed = await desktopApi.bootstrap();
                setProviders(refreshed.providers);
              }}
              onPickDocuments={() => desktopApi.pickAndParseDocuments()}
              onDropFile={handleDropFile}
              onPickFolder={handlePickFolder}
              onToggleMemory={() => setMemoryOpen((v) => !v)}
              onOpenArtifact={(art) => setActiveArtifact(art)}
              onResolveSafety={handleResolveSafety}
              onDismissError={() => setErrorBanner(null)}
            />

            <AnimatePresence>
              {activeArtifact && (
                <ArtifactCanvas
                  key={activeArtifact.id}
                  artifact={activeArtifact}
                  allArtifacts={
                    conversationArtifacts.length > 0 ? conversationArtifacts : [activeArtifact]
                  }
                  onSelectArtifact={setActiveArtifact}
                  onSaveArtifact={async (input) => {
                    const saved = await desktopApi.saveArtifact(input);
                    setArtifacts((prev) => [
                      saved,
                      ...prev.filter((a) => a.id !== saved.id),
                    ]);
                    setActiveArtifact(saved);
                    return saved;
                  }}
                  onExportArtifact={handleExportArtifact}
                  onClose={() => setActiveArtifact(null)}
                />
              )}
            </AnimatePresence>
          </>
        )}

        {activeTab === 'workflows' && (
          <WorkflowStudio
            workflows={workflows}
            onRunWorkflow={(wf) => {
              setActiveTab('chat');
              setActiveConversationId(null);
              setMessages([]);
              setPrefillPrompt(wf.promptTemplate);
            }}
            onSaveWorkflow={async (input) => {
              const saved = await desktopApi.saveWorkflow(input);
              setWorkflows((prev) => [...prev.filter((w) => w.id !== saved.id), saved]);
            }}
            onDeleteWorkflow={async (id) => {
              await desktopApi.deleteWorkflow(id);
              setWorkflows((prev) => prev.filter((w) => w.id !== id));
            }}
          />
        )}

        {activeTab === 'superpowers' && (
          <SuperpowersStore
            builtInTools={settings.builtInTools}
            allowedFolders={allowedFolders}
            mcpServers={mcpServers}
            onToggleBuiltIn={handleToggleBuiltIn}
            onPickFolder={handlePickFolder}
            onUpdateFolderTrust={async (id, trustMode) => {
              const updated = await desktopApi.updateFolderTrust(id, trustMode);
              setAllowedFolders((prev) => prev.map((f) => (f.id === id ? updated : f)));
            }}
            onRemoveFolder={async (id) => {
              await desktopApi.removeFolder(id);
              setAllowedFolders((prev) => prev.filter((f) => f.id !== id));
            }}
            onSaveMcpServer={async (input) => {
              const saved = await desktopApi.saveMcpServer(input);
              setMcpServers((prev) => [...prev.filter((s) => s.id !== saved.id), saved]);
            }}
            onToggleMcpServer={async (id, enabled) => {
              const updated = await desktopApi.toggleMcpServer(id, enabled);
              setMcpServers((prev) => prev.map((s) => (s.id === id ? updated : s)));
            }}
            onTestMcpServer={async (id) => {
              const res = await desktopApi.testMcpServer(id);
              const refreshed = await desktopApi.bootstrap();
              setMcpServers(refreshed.mcpServers);
              return { ok: res.ok, message: res.message };
            }}
            onDeleteMcpServer={async (id) => {
              await desktopApi.deleteMcpServer(id);
              setMcpServers((prev) => prev.filter((s) => s.id !== id));
            }}
          />
        )}

        {/* Collapsible Right-Hand Live Visual Memory Drawer */}
        <MemoryDrawer
          open={memoryOpen}
          memories={memories}
          autoMemoryEnabled={settings.autoMemoryEnabled}
          onClose={() => setMemoryOpen(false)}
          onSaveMemory={async (input) => {
            const saved = await desktopApi.saveMemory(input);
            setMemories((prev) => [saved, ...prev.filter((m) => m.id !== saved.id)]);
          }}
          onTogglePin={async (id, pinned) => {
            const updated = await desktopApi.togglePinMemory(id, pinned);
            setMemories((prev) =>
              prev
                .map((m) => (m.id === id ? updated : m))
                .sort((a, b) => Number(b.pinned) - Number(a.pinned))
            );
          }}
          onDeleteMemory={async (id) => {
            await desktopApi.deleteMemory(id);
            setMemories((prev) => prev.filter((m) => m.id !== id));
          }}
          onToggleAutoMemory={async (enabled) => {
            const updated = await desktopApi.updateSettings({ autoMemoryEnabled: enabled });
            setSettings(updated);
          }}
        />
      </div>

      <SettingsModal
        open={settingsOpen}
        settings={settings}
        providers={providers}
        onClose={() => setSettingsOpen(false)}
        onRefreshState={refreshBootstrap}
      />
    </div>
  );
};
