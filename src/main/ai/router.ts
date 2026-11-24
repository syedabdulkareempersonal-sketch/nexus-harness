import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { generateText, streamText, type CoreMessage, type CoreTool, type LanguageModelV1 } from 'ai';
import type { AuraDatabase } from '../db/database';
import type { McpClientManager } from '../mcp/mcpManager';
import type { SafetyGate } from '../security/safetyGate';
import { buildCanvasTools } from '../tools/canvasTools';
import { buildDocumentTools } from '../tools/documentTools';
import { buildFolderTools } from '../tools/folderTools';
import { buildWebTools } from '../tools/webTools';
import { curateMemoriesFromTurn } from './memoryCurator';
import type {
  AllowedFolder,
  ArtifactItem,
  ChatMessage,
  FileAttachment,
  OllamaDetectionResult,
  ProviderId,
  StreamEvent,
  ToolActivity,
  VerifyProviderInput,
  VerifyProviderResult,
} from '@shared/types';

function humanizeProviderError(err: unknown, providerName: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/401|invalid.*api.*key|incorrect api key|authentication|unauthenticated/i.test(raw)) {
    return `Your ${providerName} API key wasn't accepted. Open Settings to double-check the pasted key, or switch to Local AI / Guided Demo Mode.`;
  }
  if (/429|quota|rate limit|insufficient_quota/i.test(raw)) {
    return `${providerName} reached its usage or rate limit for right now. Wait a moment or switch to another AI provider in one click from the top bar.`;
  }
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|network/i.test(raw)) {
    if (providerName.toLowerCase().includes('ollama')) {
      return `Could not reach Ollama on your computer. Make sure the Ollama app is open, or switch providers in the top bar.`;
    }
    return `Could not reach ${providerName}. Check your internet connection or switch to offline Local AI (Ollama).`;
  }
  return `${providerName} ran into a hiccup: ${raw.slice(0, 200)}`;
}

export async function detectLocalOllama(customBaseUrl?: string): Promise<OllamaDetectionResult> {
  const started = Date.now();
  const cleanRoot = (customBaseUrl || 'http://127.0.0.1:11434')
    .replace(/\/v1\/?$/, '')
    .replace(/\/+$/, '');

  try {
    const res = await fetch(`${cleanRoot}/api/tags`, {
      signal: AbortSignal.timeout(3500),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return {
        available: false,
        baseUrl: `${cleanRoot}/v1`,
        models: [],
        latencyMs,
        message: 'Ollama responded with an unexpected status.',
      };
    }

    const data = (await res.json()) as { models?: Array<{ name?: string }> };
    const models = (data.models ?? [])
      .map((m) => m.name || '')
      .filter(Boolean);

    if (models.length === 0) {
      return {
        available: true,
        baseUrl: `${cleanRoot}/v1`,
        models: ['llama3.2'],
        latencyMs,
        message:
          'Ollama is running on your computer, though no local models are downloaded yet. Pull a model like "llama3.2" in Ollama to chat offline.',
      };
    }

    return {
      available: true,
      baseUrl: `${cleanRoot}/v1`,
      models,
      latencyMs,
      message: `Connected to Local AI (${models.length} model${models.length === 1 ? '' : 's'} ready in ${latencyMs}ms).`,
    };
  } catch {
    return {
      available: false,
      baseUrl: `${cleanRoot}/v1`,
      models: [],
      latencyMs: Date.now() - started,
      message:
        'No running Ollama service was detected at 127.0.0.1:11434. Start Ollama anytime for free offline AI, paste a cloud key, or try Guided Demo Mode right now.',
    };
  }
}

export class AiRouter {
  private activeControllers = new Map<string, AbortController>();

  constructor(
    private db: AuraDatabase,
    private mcpManager: McpClientManager,
    private safetyGate: SafetyGate,
    private trashFile: (fullPath: string) => Promise<void>
  ) {}

  public buildLanguageModel(
    providerId: ProviderId,
    apiKey: string,
    selectedModel: string,
    baseUrl?: string | null
  ): LanguageModelV1 | null {
    if (providerId === 'demo') return null;

    if (providerId === 'google') {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(selectedModel);
    }

    if (providerId === 'openai') {
      const openai = createOpenAI({
        apiKey,
        compatibility: 'strict',
      });
      return openai(selectedModel);
    }

    if (providerId === 'anthropic') {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(selectedModel);
    }

    if (providerId === 'openrouter') {
      const openrouter = createOpenAI({
        apiKey,
        baseURL: baseUrl || 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': 'https://github.com/auradesk/auradesk',
          'X-Title': 'AuraDesk',
        },
      });
      return openrouter(selectedModel);
    }

    if (providerId === 'ollama') {
      const ollama = createOpenAI({
        apiKey: 'ollama',
        baseURL: baseUrl || 'http://127.0.0.1:11434/v1',
      });
      return ollama(selectedModel);
    }

    return null;
  }

  public async verifyAndSaveProvider(input: VerifyProviderInput): Promise<VerifyProviderResult> {
    const started = Date.now();

    if (input.providerId === 'demo') {
      const saved = this.db.saveProviderCredentials({
        providerId: 'demo',
        isVerified: true,
      });
      this.db.updateSettings({ activeProviderId: 'demo' });
      return {
        ok: true,
        latencyMs: 12,
        message: 'Guided Demo Mode is active — explore every feature right away.',
        provider: saved,
      };
    }

    if (input.providerId === 'ollama') {
      const detection = await detectLocalOllama(input.baseUrl);
      if (!detection.available) {
        return {
          ok: false,
          latencyMs: detection.latencyMs,
          message: detection.message,
        };
      }
      const chosen = input.selectedModel || detection.models[0] || 'llama3.2';
      const saved = this.db.saveProviderCredentials({
        providerId: 'ollama',
        baseUrl: detection.baseUrl,
        selectedModel: chosen,
        availableModels: detection.models,
        isVerified: true,
      });
      this.db.updateSettings({ activeProviderId: 'ollama' });
      return {
        ok: true,
        latencyMs: detection.latencyMs,
        message: detection.message,
        detectedModels: detection.models,
        provider: saved,
      };
    }

    const existing = this.db.getProviderSecret(input.providerId);
    const keyToTest = (input.apiKey?.trim() || existing.apiKey).trim();
    if (!keyToTest) {
      return {
        ok: false,
        latencyMs: 0,
        message: 'Please paste your API key first so AuraDesk can verify the connection.',
      };
    }

    const modelId = input.selectedModel || existing.config.selectedModel;
    try {
      const model = this.buildLanguageModel(
        input.providerId,
        keyToTest,
        modelId,
        input.baseUrl ?? existing.config.baseUrl
      );
      if (!model) {
        throw new Error('Unsupported provider.');
      }

      await generateText({
        model,
        maxTokens: 12,
        prompt: 'Reply with OK.',
        abortSignal: AbortSignal.timeout(12000),
      });

      const latencyMs = Date.now() - started;
      const saved = this.db.saveProviderCredentials({
        providerId: input.providerId,
        apiKey: keyToTest,
        baseUrl: input.baseUrl ?? existing.config.baseUrl,
        selectedModel: modelId,
        isVerified: true,
      });
      this.db.updateSettings({ activeProviderId: input.providerId });

      return {
        ok: true,
        latencyMs,
        message: `Connected to ${saved.displayName} in ${latencyMs}ms.`,
        provider: saved,
      };
    } catch (err) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        message: humanizeProviderError(err, existing.config.displayName),
      };
    }
  }

  public stopConversation(conversationId: string): void {
    const controller = this.activeControllers.get(conversationId);
    if (controller) {
      controller.abort();
      this.activeControllers.delete(conversationId);
    }
    this.safetyGate.cancelAllForConversation(conversationId);
  }

  private buildSystemPrompt(memories: string[], allowedFolders: AllowedFolder[]): string {
    const folderSection =
      allowedFolders.length > 0
        ? `Shared Folders on the User's Computer:\n${allowedFolders
            .map((f) => `- "${f.label}": ${f.folderPath} (${f.trustMode === 'trusted' ? 'Trusted' : 'Asks permission before changes'})`)
            .join('\n')}`
        : 'No local folders have been shared yet. If the user asks to inspect or organize local files, warmly invite them to click "+ Add Folder" in Superpowers or below the chat box.';

    const memorySection =
      memories.length > 0
        ? `What You Remember About the User:\n${memories.map((m) => `- ${m}`).join('\n')}`
        : 'No personal notes saved yet.';

    return [
      'You are AuraDesk, a warm, remarkably clear, Apple-grade personal AI workspace assistant built for everyday people.',
      'Guidelines:',
      '- Always speak in calm, clear, plain English. Never use intimidating developer jargon, raw JSON dumps, exit codes, or stack traces unless the user explicitly asks for code.',
      '- Whenever you write a substantial report, organized summary, table, guide, polished draft, code file, or standalone HTML webpage, call the `open_in_canvas` tool so it opens cleanly in the right-side Split-View Canvas for 1-click editing and PDF/Markdown/HTML export.',
      '- Before modifying, creating, moving, or trashing any file, explain your intent clearly—AuraDesk will automatically show a friendly approval card to the user.',
      '',
      folderSection,
      '',
      memorySection,
    ].join('\n');
  }

  public async streamChatTurn(params: {
    conversationId?: string;
    content: string;
    attachments?: FileAttachment[];
    workflowId?: string | null;
    emit: (event: StreamEvent) => void;
  }): Promise<{ conversationId: string }> {
    const cleanContent = params.content.trim();
    const attachments = params.attachments ?? [];

    let conversation = params.conversationId
      ? this.db.getConversation(params.conversationId)
      : null;

    if (!conversation) {
      const autoTitle =
        cleanContent.slice(0, 52).replace(/\s+/g, ' ').trim() ||
        attachments[0]?.name ||
        'New Workspace Session';
      conversation = this.db.createConversation(autoTitle, params.workflowId ?? null);
    }

    const conversationId = conversation.id;
    const now = new Date().toISOString();

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      conversationId,
      role: 'user',
      content: cleanContent,
      toolActivities: [],
      attachments,
      artifactIds: [],
      createdAt: now,
    };
    this.db.saveMessage(userMessage);

    const assistantMessageId = crypto.randomUUID();
    params.emit({
      type: 'conversation-ready',
      conversation,
      userMessage,
      assistantMessageId,
    });

    const controller = new AbortController();
    this.activeControllers.set(conversationId, controller);

    const activities: ToolActivity[] = [];
    const createdArtifactIds: string[] = [];
    let fullAssistantText = '';

    const upsertActivity = (activity: ToolActivity) => {
      const idx = activities.findIndex((a) => a.id === activity.id);
      if (idx >= 0) {
        activities[idx] = activity;
      } else {
        activities.push(activity);
      }
      params.emit({
        type: 'activity-update',
        conversationId,
        messageId: assistantMessageId,
        activity,
      });
    };

    const handleArtifactCreated = (artifact: ArtifactItem) => {
      if (!createdArtifactIds.includes(artifact.id)) {
        createdArtifactIds.push(artifact.id);
      }
      params.emit({
        type: 'artifact-upsert',
        conversationId,
        messageId: assistantMessageId,
        artifact,
      });
    };

    const settings = this.db.getSettings();
    const { config: providerConfig, apiKey } = this.db.getProviderSecret(settings.activeProviderId);

    try {
      if (settings.activeProviderId === 'demo') {
        fullAssistantText = await this.runGuidedDemoTurn({
          conversationId,
          assistantMessageId,
          userText: cleanContent,
          attachments,
          emit: params.emit,
          upsertActivity,
          handleArtifactCreated,
          signal: controller.signal,
        });
      } else {
        if (settings.activeProviderId !== 'ollama' && !apiKey) {
          throw new Error(
            `No API key is saved for ${providerConfig.displayName} yet. Click Settings or switch to Guided Demo Mode / Local AI.`
          );
        }

        const model = this.buildLanguageModel(
          settings.activeProviderId,
          apiKey,
          providerConfig.selectedModel,
          providerConfig.baseUrl
        );
        if (!model) {
          throw new Error('Selected AI model is unavailable.');
        }

        // Assemble enabled tools
        const tools: Record<string, CoreTool> = {
          ...buildCanvasTools({
            conversationId,
            saveArtifact: (input) => this.db.saveArtifact(input),
            onArtifactCreated: handleArtifactCreated,
            emitActivity: upsertActivity,
          }),
        };

        if (settings.builtInTools.smartFolders) {
          Object.assign(
            tools,
            buildFolderTools({
              conversationId,
              getAllowedFolders: () => this.db.listAllowedFolders(),
              trustFolder: (folderId) => {
                const updated = this.db.updateFolderTrust(folderId, 'trusted');
                params.emit({ type: 'folder-updated', folder: updated });
                return updated;
              },
              safetyGate: this.safetyGate,
              emitActivity: upsertActivity,
              trashFile: this.trashFile,
            })
          );
        }

        if (settings.builtInTools.webResearch) {
          Object.assign(tools, buildWebTools({ emitActivity: upsertActivity }));
        }

        if (settings.builtInTools.documentAnalyst) {
          Object.assign(
            tools,
            buildDocumentTools({
              getAllowedFolders: () => this.db.listAllowedFolders(),
              emitActivity: upsertActivity,
            })
          );
        }

        const mcpTools = await this.mcpManager.getAiToolsForEnabledServers({
          conversationId,
          safetyGate: this.safetyGate,
          emitActivity: upsertActivity,
        });
        Object.assign(tools, mcpTools);

        // Build conversation history
        const history = this.db.getMessages(conversationId);
        const coreMessages: CoreMessage[] = history.map((m) => {
          if (m.role === 'user' && m.attachments.length > 0) {
            const attachmentContext = m.attachments
              .map(
                (att) =>
                  `\n\n--- Attached Document: "${att.name}" (${att.summaryPreview}) ---\n${att.extractedText}`
              )
              .join('\n');
            return {
              role: 'user',
              content: `${m.content}${attachmentContext}`,
            };
          }
          return {
            role: m.role,
            content: m.content,
          };
        });

        const memories = this.db.listMemories().map((m) => `${m.pinned ? '[Pinned] ' : ''}${m.content}`);
        const systemPrompt = this.buildSystemPrompt(memories, this.db.listAllowedFolders());

        const result = streamText({
          model,
          system: systemPrompt,
          messages: coreMessages,
          tools,
          maxSteps: 8,
          abortSignal: controller.signal,
        });

        for await (const delta of result.textStream) {
          fullAssistantText += delta;
          params.emit({
            type: 'text-delta',
            conversationId,
            messageId: assistantMessageId,
            delta,
          });
        }
      }

      if (!fullAssistantText.trim() && createdArtifactIds.length > 0) {
        fullAssistantText =
          'I have prepared that for you and opened it in the Canvas on the right so you can review, edit, or export it in one click.';
        params.emit({
          type: 'text-delta',
          conversationId,
          messageId: assistantMessageId,
          delta: fullAssistantText,
        });
      }

      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        conversationId,
        role: 'assistant',
        content: fullAssistantText.trim() || 'Done.',
        toolActivities: activities,
        attachments: [],
        artifactIds: createdArtifactIds,
        createdAt: new Date().toISOString(),
      };
      this.db.saveMessage(assistantMessage);

      // Update conversation title on first exchange if generic
      const currentConv = this.db.getConversation(conversationId)!;
      const updatedConv =
        currentConv.title === 'New Conversation' && cleanContent
          ? this.db.updateConversation(conversationId, {
              title: cleanContent.slice(0, 52),
            })
          : currentConv;

      params.emit({
        type: 'done',
        conversationId,
        assistantMessage,
        conversation: updatedConv,
      });

      // Background memory curation
      if (settings.autoMemoryEnabled) {
        const modelForMemory =
          settings.activeProviderId !== 'demo'
            ? this.buildLanguageModel(
                settings.activeProviderId,
                apiKey,
                providerConfig.selectedModel,
                providerConfig.baseUrl
              )
            : null;

        void curateMemoriesFromTurn({
          conversationId,
          userText: cleanContent,
          assistantText: fullAssistantText,
          existingMemories: this.db.listMemories(),
          saveMemory: (mem) => this.db.saveMemory(mem),
          model: modelForMemory,
        }).then((newMemories) => {
          for (const memory of newMemories) {
            params.emit({ type: 'memory-created', memory });
          }
        });
      }
    } catch (err) {
      if (controller.signal.aborted) {
        const partialMsg: ChatMessage = {
          id: assistantMessageId,
          conversationId,
          role: 'assistant',
          content: fullAssistantText.trim() || 'Stopped generation.',
          toolActivities: activities,
          attachments: [],
          artifactIds: createdArtifactIds,
          createdAt: new Date().toISOString(),
        };
        this.db.saveMessage(partialMsg);
        params.emit({
          type: 'done',
          conversationId,
          assistantMessage: partialMsg,
          conversation: this.db.getConversation(conversationId)!,
        });
      } else {
        const friendlyMessage = humanizeProviderError(err, providerConfig.displayName);
        params.emit({
          type: 'error',
          conversationId,
          messageId: assistantMessageId,
          friendlyMessage,
        });
      }
    } finally {
      this.activeControllers.delete(conversationId);
    }

    return { conversationId };
  }

  /**
   * Interactive zero-key Guided Demo Mode that runs real local folder inspection,
   * real Plain-English Safety Guardrails when organizing/saving files, real document analysis,
   * and opens live editable artifacts in the Split-View Canvas!
   */
  private async runGuidedDemoTurn(params: {
    conversationId: string;
    assistantMessageId: string;
    userText: string;
    attachments: FileAttachment[];
    emit: (event: StreamEvent) => void;
    upsertActivity: (activity: ToolActivity) => void;
    handleArtifactCreated: (artifact: ArtifactItem) => void;
    signal: AbortSignal;
  }): Promise<string> {
    const sleep = (ms: number) =>
      new Promise<void>((resolve, reject) => {
        if (params.signal.aborted) return reject(new Error('Aborted'));
        const t = setTimeout(resolve, ms);
        params.signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new Error('Aborted'));
        });
      });

    const streamWords = async (text: string) => {
      const chunks = text.match(/.{1,18}(\s|$)/gs) || [text];
      for (const chunk of chunks) {
        await sleep(22);
        params.emit({
          type: 'text-delta',
          conversationId: params.conversationId,
          messageId: params.assistantMessageId,
          delta: chunk,
        });
      }
      return text;
    };

    const lower = params.userText.toLowerCase();
    const folders = this.db.listAllowedFolders();

    // Case 1: Attached Documents Analysis
    if (params.attachments.length > 0) {
      const att = params.attachments[0];
      const actId = `act-${Date.now()}-demo-doc`;
      params.upsertActivity({
        id: actId,
        toolName: 'analyze_document_file',
        friendlyLabel: `Reading "${att.name}" (${att.summaryPreview})...`,
        status: 'running',
      });
      await sleep(320);
      params.upsertActivity({
        id: actId,
        toolName: 'analyze_document_file',
        friendlyLabel: `Analyzed "${att.name}"`,
        status: 'completed',
      });

      const lines = att.extractedText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 12);

      const reportMarkdown = [
        `# Executive Brief: ${att.name}`,
        '',
        `**Document Overview:** ${att.summaryPreview}`,
        '',
        '## Key Highlights Extracted',
        ...lines.map((l) => `- ${l.slice(0, 160)}`),
        '',
        '## Suggested Action Items',
        '1. **Verify Primary Figures:** Confirm totals and dates highlighted in the source file.',
        '2. **Share Summary:** Export this brief as a clean PDF or Markdown note in one click above.',
        '3. **Connect a Live Model Anytime:** Add a Gemini, OpenAI, Claude, OpenRouter, or Local Ollama model in Settings for deep custom Q&A.',
      ].join('\n');

      const artifact = this.db.saveArtifact({
        conversationId: params.conversationId,
        title: `Summary — ${att.name}`,
        kind: 'markdown',
        content: reportMarkdown,
      });
      params.handleArtifactCreated(artifact);

      return streamWords(
        `I read **${att.name}** (${att.summaryPreview}) and opened a clean **Executive Brief & Action Checklist** in the Canvas on the right.\n\nYou can edit any line directly inside the Canvas or export it to **PDF**, **Markdown**, or **HTML** in one click.`
      );
    }

    // Case 2: Folder Inspection / Organization + Real Safety Guardrail Demo
    if (
      lower.includes('folder') ||
      lower.includes('organize') ||
      lower.includes('clean') ||
      lower.includes('save') ||
      lower.includes('file')
    ) {
      if (folders.length > 0) {
        const targetFolder = folders[0];
        const listActId = `act-${Date.now()}-demo-folder`;
        params.upsertActivity({
          id: listActId,
          toolName: 'list_folder_contents',
          friendlyLabel: `Looking inside your "${targetFolder.label}" folder...`,
          status: 'running',
        });
        await sleep(300);

        let entries: fs.Dirent[] = [];
        try {
          entries = fs.readdirSync(targetFolder.folderPath, { withFileTypes: true });
        } catch {
          entries = [];
        }

        params.upsertActivity({
          id: listActId,
          toolName: 'list_folder_contents',
          friendlyLabel: `Found ${entries.length} items in "${targetFolder.label}"`,
          status: 'completed',
        });

        const tableRows = entries.slice(0, 15).map((e) => {
          const ext = e.isDirectory() ? 'Subfolder' : path.extname(e.name) || 'File';
          const bucket = e.isDirectory()
            ? 'Existing Folders'
            : ['.pdf', '.docx', '.txt', '.md'].includes(ext.toLowerCase())
              ? 'Documents & Notes'
              : ['.png', '.jpg', '.jpeg', '.svg', '.webp'].includes(ext.toLowerCase())
                ? 'Media & Visuals'
                : 'General Workspace';
          return `| ${e.name} | ${ext} | ${bucket} |`;
        });

        const planContent = [
          `# Tidy-Up Plan for "${targetFolder.label}"`,
          '',
          `Scanned **${entries.length} items** inside \`${targetFolder.folderPath}\`.`,
          '',
          '| Item Name | Type | Suggested Group |',
          '| --- | --- | --- |',
          ...(tableRows.length > 0 ? tableRows : ['| *(Folder is currently empty)* | — | Ready for new files |']),
        ].join('\n');

        const artifact = this.db.saveArtifact({
          conversationId: params.conversationId,
          title: `${targetFolder.label} — Organization Plan`,
          kind: 'markdown',
          content: planContent,
        });
        params.handleArtifactCreated(artifact);

        // Demonstrate the real Plain-English Safety & Trust Guardrail if user asked to save/organize!
        const notePath = path.join(targetFolder.folderPath, 'AuraDesk-Organization-Summary.md');
        const saveActId = `act-${Date.now()}-demo-save`;
        params.upsertActivity({
          id: saveActId,
          toolName: 'save_file_in_folder',
          friendlyLabel: `Waiting for approval to save "AuraDesk-Organization-Summary.md"...`,
          status: 'running',
        });

        let allowed = targetFolder.trustMode === 'trusted';
        if (!allowed) {
          const decision = await this.safetyGate.requestApproval({
            conversationId: params.conversationId,
            headline: `Save "AuraDesk-Organization-Summary.md" in "${targetFolder.label}"?`,
            whatWillHappen: `AuraDesk will create a neat summary note inside "${targetFolder.folderPath}" without touching or moving any existing files.`,
            whyExplanation:
              'Gives you a saved checklist of how your folder is organized right inside the folder itself.',
            targetPath: notePath,
            folderId: targetFolder.id,
            folderLabel: targetFolder.label,
            canTrustFolder: true,
            previewText: planContent,
            riskLevel: 'gentle',
          });

          if (decision === 'trust_folder') {
            const updated = this.db.updateFolderTrust(targetFolder.id, 'trusted');
            params.emit({ type: 'folder-updated', folder: updated });
            allowed = true;
          } else if (decision === 'allow_once') {
            allowed = true;
          }
        }

        if (allowed) {
          fs.writeFileSync(notePath, planContent, 'utf8');
          params.upsertActivity({
            id: saveActId,
            toolName: 'save_file_in_folder',
            friendlyLabel: `Saved "AuraDesk-Organization-Summary.md"`,
            status: 'completed',
          });
          return streamWords(
            `I inspected your **${targetFolder.label}** folder (${entries.length} items), opened the **Organization Plan** in the Canvas, and—with your permission—saved \`AuraDesk-Organization-Summary.md\` inside the folder.`
          );
        } else {
          params.upsertActivity({
            id: saveActId,
            toolName: 'save_file_in_folder',
            friendlyLabel: `Blocked saving file (kept folder untouched)`,
            status: 'blocked',
          });
          return streamWords(
            `Got it—I kept your **${targetFolder.label}** folder completely untouched! You can still review and edit the **Organization Plan** in the Canvas on the right.`
          );
        }
      }

      return streamWords(
        `I would love to help organize a folder for you! Click **Superpowers** on the left (or the **Shared Folders** button below) to pick which folder AuraDesk is allowed to see—you stay in 100% control.`
      );
    }

    // Case 3: Webpage / HTML Preview request
    if (lower.includes('html') || lower.includes('webpage') || lower.includes('landing')) {
      const htmlArtifact = this.db.saveArtifact({
        conversationId: params.conversationId,
        title: 'Interactive Studio Page Preview',
        kind: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Personal Studio Brief</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; margin: 0; padding: 48px 32px; background: #FAF8F5; color: #18181B; line-height: 1.6; }
    .sheet { max-width: 640px; margin: 0 auto; background: #FFFFFF; border: 1px solid rgba(24,24,27,0.09); border-radius: 18px; padding: 36px; box-shadow: 0 12px 30px -10px rgba(0,0,0,0.08); }
    h1 { letter-spacing: -0.025em; margin-top: 0; font-size: 28px; }
    .pill { display: inline-block; padding: 6px 12px; border-radius: 999px; background: #FCEEE6; color: #B8501E; font-weight: 600; font-size: 13px; margin-top: 12px; }
    button { margin-top: 20px; background: #B8501E; color: #fff; border: 0; border-radius: 10px; padding: 10px 18px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>Prepared in AuraDesk Live Canvas</h1>
    <p>This live webpage was generated locally and can be edited right inside the Canvas or exported as HTML or PDF in a single click.</p>
    <div class="pill" id="status">Interactive Preview Active</div>
    <br/>
    <button onclick="document.getElementById('status').textContent = 'Confirmed at ' + new Date().toLocaleTimeString()">Test Live Button</button>
  </div>
</body>
</html>`,
      });
      params.handleArtifactCreated(htmlArtifact);
      return streamWords(
        `I created a **Live Interactive Webpage** and opened it in your right-hand Canvas. Try clicking the button inside the live preview, switching to **Edit** mode, or exporting it to **HTML** or **PDF**!`
      );
    }

    // Default Guided Demo response: opens a clean report in Canvas + explains capabilities
    const canvasActId = `act-${Date.now()}-demo-canvas`;
    params.upsertActivity({
      id: canvasActId,
      toolName: 'open_in_canvas',
      friendlyLabel: 'Preparing structured workspace brief in Canvas...',
      status: 'running',
    });
    await sleep(260);

    const welcomeArtifact = this.db.saveArtifact({
      conversationId: params.conversationId,
      title: `Workspace Brief — ${params.userText.slice(0, 36) || 'Getting Started'}`,
      kind: 'markdown',
      content: [
        `# ${params.userText.slice(0, 60) || 'Your AuraDesk Workspace Brief'}`,
        '',
        '## Key Takeaways',
        '- **100% Local Ownership:** Your chats, sticky-note memories, workflows, and documents live safely in SQLite on your computer.',
        '- **Plain-English Safety Guardrails:** Before AuraDesk creates, edits, moves, or trashes any file, a calm approval card explains *what* will happen and *why*.',
        '- **Editable Split-View Canvas:** Click **Edit** in the top-right of this panel to tweak any sentence, or click **Export** to save a crisp PDF, Markdown, or HTML file.',
        '',
        '## Quick Things to Try Next',
        '| Superpower | How to Try It Right Now |',
        '| --- | --- |',
        '| **Live Memory Board** | Tell me *"My name is Alex and I prefer concise bullet points"*—watch a sticky note appear in **Memory**! |',
        '| **Smart Folder Assistant** | Connect a folder in **Superpowers**, then ask *"Clean and organize my folder"* to see the Safety Approval Card in action. |',
        '| **Document & PDF Analyst** | Drag and drop any `.pdf`, `.csv`, or `.docx` file right onto the chat box. |',
        '| **Connect Any AI Model** | Open **Settings** anytime to paste a Gemini, OpenAI, Claude, or OpenRouter key, or auto-detect local **Ollama**. |',
      ].join('\n'),
    });
    params.handleArtifactCreated(welcomeArtifact);

    params.upsertActivity({
      id: canvasActId,
      toolName: 'open_in_canvas',
      friendlyLabel: 'Opened workspace brief in Canvas',
      status: 'completed',
    });

    return streamWords(
      `Here is a structured brief opened right inside your **Split-View Canvas** (currently running in **Guided Demo Mode**).\n\nTry telling me a personal preference (for example, *"Remember that I prefer executive summaries under 5 bullets"*) to watch your **Live Visual Memory Board** update automatically, drop a PDF/CSV file into this chat, or connect a live cloud/local AI model anytime in **Settings**.`
    );
  }
}
