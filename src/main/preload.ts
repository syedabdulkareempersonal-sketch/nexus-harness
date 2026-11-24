import { contextBridge, ipcRenderer } from 'electron';
import type { AuraDeskBridge, StreamEvent } from '@shared/types';

const bridge: AuraDeskBridge = {
  bootstrap: () => ipcRenderer.invoke('auradesk:bootstrap'),
  updateSettings: (partial) => ipcRenderer.invoke('auradesk:update-settings', partial),

  verifyAndSaveProvider: (input) => ipcRenderer.invoke('auradesk:verify-provider', input),
  detectOllama: (customBaseUrl) => ipcRenderer.invoke('auradesk:detect-ollama', customBaseUrl),
  selectActiveProvider: (providerId, model) =>
    ipcRenderer.invoke('auradesk:select-active-provider', providerId, model),

  getMessages: (conversationId) => ipcRenderer.invoke('auradesk:get-messages', conversationId),
  createConversation: (title, workflowId) =>
    ipcRenderer.invoke('auradesk:create-conversation', title, workflowId),
  renameConversation: (id, title) =>
    ipcRenderer.invoke('auradesk:rename-conversation', id, title),
  deleteConversation: (id) => ipcRenderer.invoke('auradesk:delete-conversation', id),
  sendMessage: (input) => ipcRenderer.invoke('auradesk:send-message', input),
  stopGeneration: (conversationId) =>
    ipcRenderer.invoke('auradesk:stop-generation', conversationId),

  onStreamEvent: (callback: (event: StreamEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: StreamEvent) => {
      callback(payload);
    };
    ipcRenderer.on('auradesk:stream-event', listener);
    return () => {
      ipcRenderer.removeListener('auradesk:stream-event', listener);
    };
  },

  resolveSafetyRequest: (requestId, decision) =>
    ipcRenderer.invoke('auradesk:resolve-safety', requestId, decision),

  pickAndAddFolder: () => ipcRenderer.invoke('auradesk:pick-folder'),
  updateFolderTrust: (id, trustMode) =>
    ipcRenderer.invoke('auradesk:update-folder-trust', id, trustMode),
  removeFolder: (id) => ipcRenderer.invoke('auradesk:remove-folder', id),

  pickAndParseDocuments: () => ipcRenderer.invoke('auradesk:pick-documents'),
  parseDroppedDocument: (payload) =>
    ipcRenderer.invoke('auradesk:parse-dropped-document', payload),

  saveMcpServer: (input) => ipcRenderer.invoke('auradesk:save-mcp-server', input),
  toggleMcpServer: (id, enabled) =>
    ipcRenderer.invoke('auradesk:toggle-mcp-server', id, enabled),
  testMcpServer: (id) => ipcRenderer.invoke('auradesk:test-mcp-server', id),
  deleteMcpServer: (id) => ipcRenderer.invoke('auradesk:delete-mcp-server', id),

  saveMemory: (input) => ipcRenderer.invoke('auradesk:save-memory', input),
  togglePinMemory: (id, pinned) =>
    ipcRenderer.invoke('auradesk:toggle-pin-memory', id, pinned),
  deleteMemory: (id) => ipcRenderer.invoke('auradesk:delete-memory', id),

  saveWorkflow: (input) => ipcRenderer.invoke('auradesk:save-workflow', input),
  deleteWorkflow: (id) => ipcRenderer.invoke('auradesk:delete-workflow', id),

  saveArtifact: (input) => ipcRenderer.invoke('auradesk:save-artifact', input),
  deleteArtifact: (id) => ipcRenderer.invoke('auradesk:delete-artifact', id),
  exportArtifact: (artifactId, format) =>
    ipcRenderer.invoke('auradesk:export-artifact', artifactId, format),

  openExternalUrl: (url) => ipcRenderer.invoke('auradesk:open-external', url),
};

contextBridge.exposeInMainWorld('auradesk', bridge);
