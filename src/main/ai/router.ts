import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, type CoreMessage, type CoreTool, type LanguageModelV1 } from 'ai';
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

export function detectKeyProviderMismatch(
  targetProvider: ProviderId,
  rawKey: string
): { mismatch: boolean; likelyProvider?: ProviderId; hint?: string } {
  const key = rawKey.trim();
  if (!key) return { mismatch: false };

  if (key.startsWith('AIza') && targetProvider !== 'google') {
    return {
      mismatch: true,
      likelyProvider: 'google',
      hint: 'That key starts with "AIza...", which is a Google Gemini key. Switch to Google Gemini to connect it.',
    };
  }
  if (key.startsWith('sk-ant-') && targetProvider !== 'anthropic') {
    return {
      mismatch: true,
      likelyProvider: 'anthropic',
      hint: 'That key starts with "sk-ant-...", which is an Anthropic Claude key. Switch to Anthropic Claude to connect it.',
    };
  }
  if (key.startsWith('sk-or-') && targetProvider !== 'openrouter') {
    return {
      mismatch: true,
      likelyProvider: 'openrouter',
      hint: 'That key starts with "sk-or-...", which is an OpenRouter key. Switch to OpenRouter to connect it.',
    };
  }
  if (
    (key.startsWith('sk-proj-') || (key.startsWith('sk-') && !key.startsWith('sk-ant-') && !key.startsWith('sk-or-'))) &&
    targetProvider === 'google'
  ) {
    return {
      mismatch: true,
      likelyProvider: 'openai',
      hint: 'That key starts with "sk-...", which looks like an OpenAI key rather than a Google Gemini key.',
    };
  }

  return { mismatch: false };
}

function extractSuggestedReplacementModel(rawError: string): string | null {
  const match = rawError.match(/use\s+models\/([a-zA-Z0-9._-]+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  return null;
}

function humanizeProviderError(err: unknown, providerName: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/401|403|API_KEY_INVALID|invalid.*api.*key|incorrect api key|authentication|unauthenticated/i.test(raw)) {
    return `Your ${providerName} API key wasn't accepted. Double-check that you pasted the full key for ${providerName}.`;
  }
  if (/429|quota|rate limit|insufficient_quota/i.test(raw)) {
    return `${providerName} reached its usage or rate limit right now. Wait a moment or switch providers in the top bar.`;
  }
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|network/i.test(raw)) {
    if (providerName.toLowerCase().includes('ollama')) {
      return 'Could not reach Ollama at 127.0.0.1:11434. Open the Ollama app first or choose a cloud provider.';
    }
    return `Could not reach ${providerName}. Check your internet connection and try again.`;
  }
  return `${providerName} reported: ${raw.slice(0, 220)}`;
}

function rankGeminiModel(id: string): number {
  let score = 0;
  const verMatch = id.match(/gemini-(\d+(?:\.\d+)?)/);
  if (verMatch) {
    score += parseFloat(verMatch[1]) * 100;
  }
  if (id.includes('-flash') && !id.includes('lite') && !id.includes('8b')) score += 25;
  if (id.includes('-pro')) score += 20;
  if (id.includes('latest')) score += 5;
  if (id.includes('exp') || id.includes('lite')) score -= 12;
  return score;
}

function rankOpenAiModel(id: string): number {
  let score = 0;
  if (id.startsWith('gpt-5')) score += 500;
  else if (id.startsWith('gpt-4.5')) score += 450;
  else if (id.startsWith('gpt-4.1-mini')) score += 430;
  else if (id.startsWith('gpt-4.1')) score += 420;
  else if (id === 'gpt-4o-mini') score += 400;
  else if (id === 'gpt-4o') score += 395;
  else if (id.startsWith('o4-mini')) score += 390;
  else if (id.startsWith('o3')) score += 380;
  else if (id.startsWith('gpt-4')) score += 300;
  if (/\d{4}-\d{2}-\d{2}$/.test(id)) score -= 15; // prefer clean alias over dated snapshot
  return score;
}

export async function discoverLiveProviderModels(params: {
  providerId: ProviderId;
  apiKey: string;
  baseUrl?: string | null;
}): Promise<{ models: string[]; preferredModel: string }> {
  const { providerId, apiKey, baseUrl } = params;

  if (providerId === 'google') {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}&pageSize=100`,
      { signal: AbortSignal.timeout(10000) }
    );
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(errBody || `Google Gemini returned HTTP ${res.status} (401/403 invalid key)`);
    }

    const data = (await res.json()) as {
      models?: Array<{
        name?: string;
        supportedGenerationMethods?: string[];
      }>;
    };

    const models = (data.models ?? [])
      .filter((m) => (m.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((m) => String(m.name || '').replace(/^models\//, ''))
      .filter(
        (id) =>
          id.startsWith('gemini-') &&
          !/embedding|imagen|veo|tts|aqa|bisheng|learnlm|robotics|computer-use|audio|live/i.test(id)
      )
      .sort((a, b) => rankGeminiModel(b) - rankGeminiModel(a));

    const unique = Array.from(new Set(models));
    const list = unique.length > 0 ? unique.slice(0, 18) : ['gemini-3.8-flash', 'gemini-2.5-pro'];
    return { models: list, preferredModel: list[0] };
  }

  if (providerId === 'openai') {
    const cleanBase = (baseUrl || 'https://api.openai.com/v1').replace(/\/+$/, '');
    const res = await fetch(`${cleanBase}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(errBody || `OpenAI returned HTTP ${res.status}`);
    }

    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? [])
      .map((m) => String(m.id || ''))
      .filter(
        (id) =>
          /^(gpt-|o1|o3|o4)/i.test(id) &&
          !/instruct|realtime|audio|tts|whisper|dall-e|image|embedding|moderation|transcribe|search/i.test(
            id
          )
      )
      .sort((a, b) => rankOpenAiModel(b) - rankOpenAiModel(a));

    const unique = Array.from(new Set(models));
    const list =
      unique.length > 0 ? unique.slice(0, 18) : ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'];
    return { models: list, preferredModel: list[0] };
  }

  if (providerId === 'anthropic') {
    const res = await fetch('https://api.anthropic.com/v1/models?limit=25', {
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => '');
      throw new Error(errBody || `Anthropic returned HTTP ${res.status}`);
    }

    const data = (await res.json()) as { data?: Array<{ id?: string }> };
    const models = (data.data ?? [])
      .map((m) => String(m.id || ''))
      .filter((id) => id.startsWith('claude-'));

    const unique = Array.from(new Set(models));
    const sonnetFirst = unique.find((m) => m.includes('sonnet')) || unique[0];
    const list =
      unique.length > 0
        ? unique.slice(0, 16)
        : ['claude-sonnet-4-0', 'claude-3-7-sonnet-latest', 'claude-3-5-haiku-latest'];
    return { models: list, preferredModel: sonnetFirst || list[0] };
  }

  if (providerId === 'openrouter') {
    const keyRes = await fetch('https://openrouter.ai/api/v1/key', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!keyRes.ok) {
      const errBody = await keyRes.text().catch(() => '');
      throw new Error(errBody || `OpenRouter returned HTTP ${keyRes.status}`);
    }

    const modelsRes = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    }).catch(() => null);

    let list = [
      'openai/gpt-4.1-mini',
      'anthropic/claude-sonnet-4',
      'google/gemini-2.5-pro',
      'deepseek/deepseek-chat',
    ];
    if (modelsRes && modelsRes.ok) {
      const data = (await modelsRes.json()) as { data?: Array<{ id?: string }> };
      const allIds = (data.data ?? []).map((m) => String(m.id || '')).filter(Boolean);
      const curated = allIds.filter((id) =>
        /^(anthropic\/claude-|google\/gemini-|openai\/gpt-4|openai\/gpt-5|deepseek\/deepseek-chat|meta-llama\/llama-3)/i.test(
          id
        )
      );
      if (curated.length > 0) {
        list = curated.slice(0, 24);
      }
    }
    return { models: list, preferredModel: list[0] };
  }

  return { models: [], preferredModel: '' };
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
          'Ollama is running locally, though no models are downloaded yet. Run "ollama pull llama3.2" to chat offline.',
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
        'Ollama is not currently running at 127.0.0.1:11434. Open the Ollama app for offline AI, or connect any cloud key.',
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

    const cleanModel = selectedModel.replace(/^models\//, '').trim();

    if (providerId === 'google') {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(cleanModel);
    }

    if (providerId === 'openai') {
      const openai = createOpenAI({
        apiKey,
        compatibility: 'strict',
      });
      return openai(cleanModel);
    }

    if (providerId === 'anthropic') {
      const anthropic = createAnthropic({ apiKey });
      return anthropic(cleanModel);
    }

    if (providerId === 'openrouter') {
      const openrouter = createOpenAI({
        apiKey,
        baseURL: baseUrl || 'https://openrouter.ai/api/v1',
        headers: {
          'HTTP-Referer': 'https://github.com/syedabdulkareempersonal-sketch/nexus-harness',
          'X-Title': 'AuraDesk',
        },
      });
      return openrouter(cleanModel);
    }

    if (providerId === 'ollama') {
      const ollama = createOpenAI({
        apiKey: 'ollama',
        baseURL: baseUrl || 'http://127.0.0.1:11434/v1',
      });
      return ollama(cleanModel);
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
        latencyMs: 8,
        message: 'Guided Demo Studio is active and ready.',
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
      const chosen =
        input.selectedModel && detection.models.includes(input.selectedModel)
          ? input.selectedModel
          : detection.models[0] || 'llama3.2';
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
        message: `Paste your ${existing.config.displayName} API key first to verify and connect.`,
      };
    }

    // Catch accidental cross-provider key paste immediately with a helpful hint!
    const mismatchCheck = detectKeyProviderMismatch(input.providerId, keyToTest);
    if (mismatchCheck.mismatch && mismatchCheck.hint) {
      return {
        ok: false,
        latencyMs: 0,
        message: mismatchCheck.hint,
      };
    }

    try {
      const liveCatalog = await discoverLiveProviderModels({
        providerId: input.providerId,
        apiKey: keyToTest,
        baseUrl: input.baseUrl ?? existing.config.baseUrl,
      });

      const requestedModel = input.selectedModel?.replace(/^models\//, '').trim();
      const resolvedModel =
        requestedModel && liveCatalog.models.includes(requestedModel)
          ? requestedModel
          : liveCatalog.preferredModel;

      const latencyMs = Date.now() - started;
      const saved = this.db.saveProviderCredentials({
        providerId: input.providerId,
        apiKey: keyToTest,
        baseUrl: input.baseUrl ?? existing.config.baseUrl,
        selectedModel: resolvedModel,
        availableModels: liveCatalog.models,
        isVerified: true,
      });
      this.db.updateSettings({ activeProviderId: input.providerId });

      return {
        ok: true,
        latencyMs,
        detectedModels: liveCatalog.models,
        message: `Connected to ${saved.displayName} (${resolvedModel} · ${liveCatalog.models.length} live models ready in ${latencyMs}ms).`,
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
        : 'No local folders have been shared yet. If the user asks to inspect or organize local files, warmly invite them to click "+ Share Folder" in Superpowers or below the composer.';

    const memorySection =
      memories.length > 0
        ? `What You Remember About the User:\n${memories.map((m) => `- ${m}`).join('\n')}`
        : 'No personal notes saved yet.';

    return [
      'You are AuraDesk, a flagship Windows 12 Pro personal AI desktop assistant built for clarity, speed, and trust.',
      'Guidelines:',
      '- Speak in crisp, calm, plain English. Avoid raw JSON dumps, exit codes, or stack traces unless the user explicitly asks for code.',
      '- Whenever you write a report, organized summary, table, guide, polished draft, code file, or standalone HTML webpage, call the `open_in_canvas` tool so it opens cleanly in the right-side Split-View Canvas for 1-click editing and PDF/Markdown/HTML export.',
      '- Before modifying, creating, moving, or trashing any file, explain your intent clearly—AuraDesk automatically presents a friendly approval card to the user.',
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
    let { config: providerConfig, apiKey } = this.db.getProviderSecret(settings.activeProviderId);

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
            `No API key is saved for ${providerConfig.displayName} yet. Open AI Engines to connect your ${providerConfig.displayName} key or switch to Guided Demo Studio.`
          );
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

        const runStreamWithModel = async (modelId: string) => {
          const model = this.buildLanguageModel(
            settings.activeProviderId,
            apiKey,
            modelId,
            providerConfig.baseUrl
          );
          if (!model) throw new Error('Selected AI model is unavailable.');

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
        };

        try {
          await runStreamWithModel(providerConfig.selectedModel);
        } catch (firstErr) {
          // Self-heal automatically if a saved model ID was deprecated or retired by the provider!
          const errText = firstErr instanceof Error ? firstErr.message : String(firstErr);
          const isModelDeprecated =
            /no longer available|not found|does not exist|model_not_found|use models\//i.test(
              errText
            );

          if (isModelDeprecated && fullAssistantText.length === 0 && settings.activeProviderId !== 'ollama') {
            const directSuggestion = extractSuggestedReplacementModel(errText);
            const live = await discoverLiveProviderModels({
              providerId: settings.activeProviderId,
              apiKey,
              baseUrl: providerConfig.baseUrl,
            }).catch(() => null);

            const healedModel =
              directSuggestion ||
              live?.models.find((m) => m !== providerConfig.selectedModel) ||
              live?.preferredModel;

            if (healedModel && healedModel !== providerConfig.selectedModel) {
              providerConfig = this.db.saveProviderCredentials({
                providerId: settings.activeProviderId,
                selectedModel: healedModel,
                availableModels: live?.models,
                isVerified: true,
              });
              params.emit({ type: 'provider-updated', provider: providerConfig });
              await runStreamWithModel(healedModel);
            } else {
              throw firstErr;
            }
          } else {
            throw firstErr;
          }
        }
      }

      if (!fullAssistantText.trim() && createdArtifactIds.length > 0) {
        fullAssistantText =
          'I have prepared that for you and opened it in the Live Canvas on the right so you can review, edit, or export it in one click.';
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
        await sleep(20);
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

    if (params.attachments.length > 0) {
      const att = params.attachments[0];
      const actId = `act-${Date.now()}-demo-doc`;
      params.upsertActivity({
        id: actId,
        toolName: 'analyze_document_file',
        friendlyLabel: `Reading "${att.name}" (${att.summaryPreview})...`,
        status: 'running',
      });
      await sleep(280);
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
        '3. **Switch AI Engines Anytime:** Connect Gemini, OpenAI, Claude, OpenRouter, or Local Ollama in AI Engines.',
      ].join('\n');

      const artifact = this.db.saveArtifact({
        conversationId: params.conversationId,
        title: `Summary — ${att.name}`,
        kind: 'markdown',
        content: reportMarkdown,
      });
      params.handleArtifactCreated(artifact);

      return streamWords(
        `I analyzed **${att.name}** (${att.summaryPreview}) and opened an **Executive Brief & Action Checklist** in the Canvas on the right.\n\nYou can edit any line directly inside the Canvas or export it to **PDF**, **Markdown**, or **HTML** in one click.`
      );
    }

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
        await sleep(260);

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
        `I would love to help organize a folder for you! Click **Superpowers** on the left (or **Share Folder** below the composer) to pick which folder AuraDesk is allowed to see.`
      );
    }

    if (lower.includes('html') || lower.includes('webpage') || lower.includes('landing')) {
      const htmlArtifact = this.db.saveArtifact({
        conversationId: params.conversationId,
        title: 'Interactive Studio Page Preview',
        kind: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>AuraDesk Fluent Preview</title>
  <style>
    body { font-family: "Segoe UI Variable Text", -apple-system, sans-serif; margin: 0; padding: 48px 32px; background: #ECF1F8; color: #0F172A; line-height: 1.6; }
    .sheet { max-width: 640px; margin: 0 auto; background: rgba(255,255,255,0.88); border: 1px solid rgba(15,23,42,0.09); border-radius: 20px; padding: 36px; box-shadow: 0 16px 36px -12px rgba(15,23,42,0.12); }
    h1 { letter-spacing: -0.025em; margin-top: 0; font-size: 28px; }
    .pill { display: inline-block; padding: 6px 12px; border-radius: 999px; background: #E0EDFF; color: #005FB8; font-weight: 600; font-size: 13px; margin-top: 12px; }
    button { margin-top: 20px; background: #005FB8; color: #fff; border: 0; border-radius: 10px; padding: 10px 18px; font-weight: 600; cursor: pointer; }
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

    const canvasActId = `act-${Date.now()}-demo-canvas`;
    params.upsertActivity({
      id: canvasActId,
      toolName: 'open_in_canvas',
      friendlyLabel: 'Preparing structured workspace brief in Canvas...',
      status: 'running',
    });
    await sleep(220);

    const cleanHeading =
      params.userText.length > 54
        ? `${params.userText.slice(0, 54).replace(/\s+\S*$/, '')}...`
        : params.userText || 'Your AuraDesk Workspace Brief';

    const welcomeArtifact = this.db.saveArtifact({
      conversationId: params.conversationId,
      title: `Workspace Brief — ${cleanHeading}`,
      kind: 'markdown',
      content: [
        `# ${cleanHeading}`,
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
        '| **Smart Folder Assistant** | Share a folder in **Superpowers**, then ask *"Clean and organize my folder"* to see the Safety Approval Card in action. |',
        '| **Document & PDF Analyst** | Drag and drop any `.pdf`, `.csv`, or `.docx` file right onto the chat box. |',
        '| **Connect Any AI Engine** | Click the engine pill in the top bar anytime to connect Gemini, OpenAI, Claude, OpenRouter, or Local **Ollama**. |',
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
      `Here is a structured brief opened right inside your **Split-View Canvas** (currently running in **Guided Demo Studio**).\n\nClick the **AI Engine** pill at the top anytime to connect Google Gemini, OpenAI, Anthropic Claude, OpenRouter, or local **Ollama**—AuraDesk automatically discovers every live model supported by your account!`
    );
  }
}
