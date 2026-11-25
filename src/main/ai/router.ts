import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { createOpenAI } from '@ai-sdk/openai';
import {
  generateText,
  stepCountIs,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
} from 'ai';
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

  if ((key.startsWith('AIza') || key.startsWith('AQ.')) && targetProvider !== 'google') {
    return {
      mismatch: true,
      likelyProvider: 'google',
      hint: 'That key looks like a Google Gemini key. Switch to Google Gemini to connect it.',
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
    (key.startsWith('sk-proj-') ||
      (key.startsWith('sk-') && !key.startsWith('sk-ant-') && !key.startsWith('sk-or-'))) &&
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

function extractRawErrorMessage(err: unknown, depth = 0): string {
  if (!err || depth > 3) return '';
  if (err instanceof Error) {
    const anyErr = err as Error & {
      responseBody?: string;
      cause?: unknown;
      lastError?: unknown;
      statusCode?: number;
    };
    const parts = [anyErr.message];
    if (typeof anyErr.statusCode === 'number') parts.push(`status=${anyErr.statusCode}`);
    if (typeof anyErr.responseBody === 'string') parts.push(anyErr.responseBody);
    if (anyErr.cause) parts.push(extractRawErrorMessage(anyErr.cause, depth + 1));
    if (anyErr.lastError) parts.push(extractRawErrorMessage(anyErr.lastError, depth + 1));
    return parts.filter(Boolean).join(' ').trim();
  }
  if (typeof err === 'object') {
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

function humanizeProviderError(err: unknown, providerName: string): string {
  const raw = extractRawErrorMessage(err);
  if (
    /401|403|API_KEY_INVALID|invalid.*api.*key|incorrect api key|authentication|unauthenticated|permission_denied/i.test(
      raw
    )
  ) {
    return `Your ${providerName} API key wasn't accepted, or this specific model isn't enabled on your key. Open AI Setup to check your key or pick another model.`;
  }
  if (/429|quota|rate limit|insufficient_quota|RESOURCE_EXHAUSTED/i.test(raw)) {
    return `${providerName} reached its free quota or rate limit for this model right now. Wait a few seconds or switch to another model in the top bar.`;
  }
  if (/ECONNREFUSED|fetch failed|ENOTFOUND|network/i.test(raw)) {
    if (providerName.toLowerCase().includes('ollama')) {
      return 'Could not reach Ollama on your computer. Make sure the Ollama app is open first.';
    }
    return `Could not reach ${providerName}. Check your internet connection and try again.`;
  }
  return `${providerName} message: ${raw.slice(0, 240)}`;
}

function buildProviderStreamOptions(
  providerId: ProviderId,
  modelId: string
): Record<string, Record<string, unknown>> | undefined {
  if (providerId !== 'google') return undefined;
  const clean = modelId.toLowerCase();
  if (clean.includes('1.5') || clean.includes('2.0')) return undefined;
  if (clean.includes('flash')) {
    return {
      google: {
        thinkingConfig: {
          thinkingBudget: 0,
        },
      },
    };
  }
  if (clean.includes('pro')) {
    return {
      google: {
        thinkingConfig: {
          thinkingBudget: 256,
        },
      },
    };
  }
  return undefined;
}

function rankGeminiModel(id: string): number {
  let score = 0;
  // Prefer general-availability Flash & Pro models that work reliably on both Free Tier and Paid keys.
  if (id === 'gemini-3.6-flash') score += 720;
  else if (id === 'gemini-3.5-flash') score += 700;
  else if (id === 'gemini-3.8-flash') score += 690;
  else if (id === 'gemini-3.7-flash') score += 680;
  else if (id === 'gemini-3-flash-preview' || id === 'gemini-3-flash') score += 660;
  else if (id === 'gemini-2.5-flash') score += 640;
  else if (id === 'gemini-2.5-pro') score += 610;
  else if (id === 'gemini-3.8-pro') score += 600;
  else if (id.startsWith('gemini-4-')) score += 420;
  else {
    const verMatch = id.match(/gemini-(\d+(?:\.\d+)?)/);
    if (verMatch) {
      score += parseFloat(verMatch[1]) * 100;
    }
  }
  if (id.includes('-flash') && !id.includes('lite') && !id.includes('8b')) score += 25;
  if (id.includes('-pro')) score += 15;
  if (id.includes('exp') || id.includes('lite')) score -= 18;
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
  if (/\d{4}-\d{2}-\d{2}$/.test(id)) score -= 15;
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
          !/embedding|imagen|veo|tts|transcribe|image|customtools|aqa|bisheng|learnlm|robotics|computer-use|audio|live/i.test(
            id
          )
      )
      .sort((a, b) => rankGeminiModel(b) - rankGeminiModel(a));

    const unique = Array.from(new Set(models));
    const list = unique.length > 0 ? unique.slice(0, 14) : ['gemini-3.8-flash', 'gemini-2.5-pro'];
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
      unique.length > 0 ? unique.slice(0, 14) : ['gpt-4.1-mini', 'gpt-4.1', 'gpt-4o-mini', 'gpt-4o'];
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
        ? unique.slice(0, 14)
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
        list = curated.slice(0, 20);
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
          'Ollama is running locally, though no models are downloaded yet. Download a model like "llama3.2" in Ollama to chat offline.',
      };
    }

    return {
      available: true,
      baseUrl: `${cleanRoot}/v1`,
      models,
      latencyMs,
      message: `Connected to Local AI (${models.length} model${models.length === 1 ? '' : 's'} ready).`,
    };
  } catch {
    return {
      available: false,
      baseUrl: `${cleanRoot}/v1`,
      models: [],
      latencyMs: Date.now() - started,
      message:
        'Ollama is not running on your computer yet. Open the Ollama app first, or connect any cloud AI key.',
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
  ): LanguageModel | null {
    if (providerId === 'demo') return null;

    const cleanModel = selectedModel.replace(/^models\//, '').trim();

    if (providerId === 'google') {
      const google = createGoogleGenerativeAI({ apiKey });
      return google(cleanModel);
    }

    if (providerId === 'openai') {
      const openai = createOpenAI({ apiKey });
      return openai.chat(cleanModel);
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
      return openrouter.chat(cleanModel);
    }

    if (providerId === 'ollama') {
      const ollama = createOpenAI({
        apiKey: 'ollama',
        baseURL: baseUrl || 'http://127.0.0.1:11434/v1',
      });
      return ollama.chat(cleanModel);
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
        message: 'Offline Practice Mode is active and ready.',
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
        message: `Paste your ${existing.config.displayName} API key first to connect.`,
      };
    }

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
      const baseUrlToUse = input.baseUrl ?? existing.config.baseUrl;

      const probeCandidates = Array.from(
        new Set([
          ...(requestedModel && liveCatalog.models.includes(requestedModel) ? [requestedModel] : []),
          ...liveCatalog.models,
        ])
      );

      let resolvedModel = probeCandidates[0] || liveCatalog.preferredModel;
      const blockedModels = new Set<string>();

      // Probe up to 4 candidate models with a tiny 1-token call (maxRetries: 0)
      // so Free Tier keys never land on a limit:0 or retired model.
      for (const candidate of probeCandidates.slice(0, 4)) {
        const testModel = this.buildLanguageModel(
          input.providerId,
          keyToTest,
          candidate,
          baseUrlToUse
        );
        if (!testModel) continue;

        try {
          await generateText({
            model: testModel,
            prompt: 'Hi',
            maxOutputTokens: 4,
            maxRetries: 0,
            providerOptions: buildProviderStreamOptions(input.providerId, candidate) as never,
            abortSignal: AbortSignal.timeout(6500),
          });
          resolvedModel = candidate;
          break;
        } catch (probeErr) {
          const rawProbeErr = extractRawErrorMessage(probeErr);
          if (/401|API_KEY_INVALID|incorrect api key|invalid.*api.*key|unauthenticated/i.test(rawProbeErr)) {
            throw probeErr;
          }
          if (/limit:\s*0|no longer available|not found|404/i.test(rawProbeErr)) {
            blockedModels.add(candidate);
          }
        }
      }

      const filteredModels = liveCatalog.models.filter((m) => !blockedModels.has(m));
      const finalModels = filteredModels.length > 0 ? filteredModels : liveCatalog.models;
      if (!finalModels.includes(resolvedModel) && finalModels.length > 0) {
        resolvedModel = finalModels[0];
      }

      const latencyMs = Date.now() - started;
      const saved = this.db.saveProviderCredentials({
        providerId: input.providerId,
        apiKey: keyToTest,
        baseUrl: baseUrlToUse,
        selectedModel: resolvedModel,
        availableModels: finalModels,
        isVerified: true,
      });
      this.db.updateSettings({ activeProviderId: input.providerId });

      return {
        ok: true,
        latencyMs,
        detectedModels: finalModels,
        message: `Connected to ${saved.displayName} (${resolvedModel}).`,
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

  private buildSystemPrompt(params: {
    providerDisplayName: string;
    selectedModel: string;
    memories: string[];
    allowedFolders: AllowedFolder[];
  }): string {
    const now = new Date();
    const dateString = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const timeString = now.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
    });

    const folderSection =
      params.allowedFolders.length > 0
        ? `Shared Folders on the User's Computer:\n${params.allowedFolders
            .map(
              (f) =>
                `- "${f.label}": ${f.folderPath} (${
                  f.trustMode === 'trusted' ? 'Trusted' : 'Asks permission before changes'
                })`
            )
            .join('\n')}`
        : 'No local folders have been shared yet. If the user asks to view or organize local files, warmly invite them to click "Choose Folder" below the chat box.';

    const memorySection =
      params.memories.length > 0
        ? `Saved Notes About the User:\n${params.memories.map((m) => `- ${m}`).join('\n')}`
        : 'No personal notes saved yet.';

    return [
      'You are AuraDesk, a warm, crystal-clear, helpful personal AI assistant on the user\'s desktop.',
      `Current Local Date & Time: ${dateString} at ${timeString}.`,
      `Active AI Engine: ${params.providerDisplayName} (model: ${params.selectedModel}). If the user asks which model or AI is running, tell them clearly.`,
      '',
      'Guidelines:',
      '- Speak in simple, natural, friendly plain English. Never use developer jargon or raw JSON unless the user asks for code.',
      '- For normal questions, greetings, or quick answers, reply directly in chat.',
      '- When writing a long report, research summary, comparison table, polished letter/article, code file, or standalone webpage, call `open_in_canvas` so it opens neatly on the right side for reading, editing, and 1-click PDF export.',
      '- Before modifying, creating, moving, or trashing any file, explain what you plan to do in plain English—AuraDesk will show a calm approval card to the user.',
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
        'New Chat';
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
            `No API key is saved for ${providerConfig.displayName} yet. Click the AI button at the top to paste your key or switch to Practice Mode.`
          );
        }

        const tools: ToolSet = {
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
        const coreMessages: ModelMessage[] = history.map((m) => {
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

        const memories = this.db
          .listMemories()
          .map((m) => `${m.pinned ? '[Pinned] ' : ''}${m.content}`);

        const runStreamWithModel = async (modelId: string) => {
          const model = this.buildLanguageModel(
            settings.activeProviderId,
            apiKey,
            modelId,
            providerConfig.baseUrl
          );
          if (!model) throw new Error('Selected AI model is unavailable.');

          const systemPrompt = this.buildSystemPrompt({
            providerDisplayName: providerConfig.displayName,
            selectedModel: modelId,
            memories,
            allowedFolders: this.db.listAllowedFolders(),
          });

          const result = streamText({
            model,
            system: systemPrompt,
            messages: coreMessages,
            tools,
            maxRetries: 0,
            providerOptions: buildProviderStreamOptions(settings.activeProviderId, modelId) as never,
            stopWhen: stepCountIs(8),
            abortSignal: controller.signal,
          });

          // Iterate fullStream so provider/API errors are NEVER silently swallowed!
          for await (const part of result.fullStream) {
            if (part.type === 'text-delta') {
              fullAssistantText += part.text;
              params.emit({
                type: 'text-delta',
                conversationId,
                messageId: assistantMessageId,
                delta: part.text,
              });
            } else if (part.type === 'error') {
              throw part.error;
            }
          }
        };

        try {
          await runStreamWithModel(providerConfig.selectedModel);
        } catch (firstErr) {
          const errText = extractRawErrorMessage(firstErr);
          const canRetryFallbackModel =
            fullAssistantText.length === 0 &&
            !controller.signal.aborted &&
            settings.activeProviderId !== 'ollama' &&
            !/API_KEY_INVALID|incorrect api key|invalid.*api.*key|401/i.test(errText);

          if (canRetryFallbackModel) {
            const directSuggestion = extractSuggestedReplacementModel(errText);
            const live = await discoverLiveProviderModels({
              providerId: settings.activeProviderId,
              apiKey,
              baseUrl: providerConfig.baseUrl,
            }).catch(() => null);

            const candidatePool = Array.from(
              new Set([
                ...(directSuggestion ? [directSuggestion] : []),
                ...(live?.models ?? []),
                ...providerConfig.availableModels,
              ])
            ).filter((m) => m && m !== providerConfig.selectedModel);

            let recovered = false;
            let lastFallbackErr: unknown = firstErr;
            const failedZeroQuotaModels = new Set<string>();
            if (/limit:\s*0|no longer available|not found|404/i.test(errText)) {
              failedZeroQuotaModels.add(providerConfig.selectedModel);
            }

            for (const candidate of candidatePool.slice(0, 4)) {
              if (controller.signal.aborted) break;
              try {
                await runStreamWithModel(candidate);
                const updatedList = (live?.models ?? providerConfig.availableModels).filter(
                  (m) => !failedZeroQuotaModels.has(m)
                );
                providerConfig = this.db.saveProviderCredentials({
                  providerId: settings.activeProviderId,
                  selectedModel: candidate,
                  availableModels: updatedList.length > 0 ? updatedList : [candidate],
                  isVerified: true,
                });
                params.emit({ type: 'provider-updated', provider: providerConfig });
                recovered = true;
                break;
              } catch (candidateErr) {
                lastFallbackErr = candidateErr;
                const candText = extractRawErrorMessage(candidateErr);
                if (/limit:\s*0|no longer available|not found|404/i.test(candText)) {
                  failedZeroQuotaModels.add(candidate);
                }
                if (fullAssistantText.length > 0) {
                  throw candidateErr;
                }
              }
            }

            if (!recovered) {
              throw lastFallbackErr;
            }
          } else {
            throw firstErr;
          }
        }
      }

      if (!fullAssistantText.trim() && createdArtifactIds.length > 0) {
        fullAssistantText =
          'I opened your finished document on the right so you can read, edit, or export it as a PDF in one click.';
        params.emit({
          type: 'text-delta',
          conversationId,
          messageId: assistantMessageId,
          delta: fullAssistantText,
        });
      }

      if (!fullAssistantText.trim()) {
        throw new Error(
          `${providerConfig.displayName} returned an empty reply for model "${providerConfig.selectedModel}". Try picking another model in the top bar.`
        );
      }

      const assistantMessage: ChatMessage = {
        id: assistantMessageId,
        conversationId,
        role: 'assistant',
        content: fullAssistantText.trim(),
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
          content: fullAssistantText.trim() || 'Stopped.',
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
        // Save the helpful explanation right inside the assistant message bubble too so the conversation never hangs blank!
        const errorMsg: ChatMessage = {
          id: assistantMessageId,
          conversationId,
          role: 'assistant',
          content: `**Connection note:** ${friendlyMessage}`,
          toolActivities: activities,
          attachments: [],
          artifactIds: createdArtifactIds,
          createdAt: new Date().toISOString(),
        };
        this.db.saveMessage(errorMsg);
        params.emit({
          type: 'done',
          conversationId,
          assistantMessage: errorMsg,
          conversation: this.db.getConversation(conversationId)!,
        });
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
        await sleep(16);
        params.emit({
          type: 'text-delta',
          conversationId: params.conversationId,
          messageId: params.assistantMessageId,
          delta: chunk,
        });
      }
      return text;
    };

    const lower = params.userText.toLowerCase().trim();
    const folders = this.db.listAllowedFolders();

    // 1. Friendly conversational greetings (no random Canvas popup!)
    if (/^(hi|hello|hey|good morning|good afternoon|good evening|how are you[?!.]*)$/i.test(lower)) {
      return streamWords(
        `Hello! I'm doing great and ready to help.\n\nRight now you're chatting in **Offline Practice Mode**—you can attach a PDF/CSV below, ask me to organize a folder, or click the **AI button at the top** anytime to connect Google Gemini, OpenAI, Claude, or Local Ollama.`
      );
    }

    // 2. Date / Time questions
    if (lower.includes('date') || lower.includes('time') || lower.includes('today')) {
      const now = new Date();
      const dateStr = now.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      const timeStr = now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
      return streamWords(`Today is **${dateStr}**, and the current local time is **${timeStr}**.`);
    }

    // 3. Which model / engine questions
    if (lower.includes('which model') || lower.includes('what model') || lower.includes('who are you')) {
      return streamWords(
        `You are currently using **Offline Practice Mode** (built-in demo assistant).\n\nTo switch to your live **Google Gemini**, **OpenAI**, **Claude**, **OpenRouter**, or **Ollama** model, click the **AI pill at the top center** of the window!`
      );
    }

    // 4. Attached Document Analysis
    if (params.attachments.length > 0) {
      const att = params.attachments[0];
      const actId = `act-${Date.now()}-demo-doc`;
      params.upsertActivity({
        id: actId,
        toolName: 'analyze_document_file',
        friendlyLabel: `Reading "${att.name}" (${att.summaryPreview})...`,
        status: 'running',
      });
      await sleep(250);
      params.upsertActivity({
        id: actId,
        toolName: 'analyze_document_file',
        friendlyLabel: `Read "${att.name}"`,
        status: 'completed',
      });

      const lines = att.extractedText
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean)
        .slice(0, 12);

      const reportMarkdown = [
        `# Summary: ${att.name}`,
        '',
        `**Overview:** ${att.summaryPreview}`,
        '',
        '## Key Highlights',
        ...lines.map((l) => `- ${l.slice(0, 160)}`),
        '',
        '## Next Steps',
        '1. **Review Key Numbers:** Check the figures highlighted above.',
        '2. **Export Anytime:** Click **PDF**, **Markdown**, or **HTML** above to save a copy.',
      ].join('\n');

      const artifact = this.db.saveArtifact({
        conversationId: params.conversationId,
        title: `Summary — ${att.name}`,
        kind: 'markdown',
        content: reportMarkdown,
      });
      params.handleArtifactCreated(artifact);

      return streamWords(
        `I read **${att.name}** (${att.summaryPreview}) and opened a clean **Summary** on the right. You can edit any line or export it as a **PDF** in one click.`
      );
    }

    // 5. Folder Organization + Safety Approval Card
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
          friendlyLabel: `Looking inside "${targetFolder.label}"...`,
          status: 'running',
        });
        await sleep(240);

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
                ? 'Photos & Images'
                : 'Other Files';
          return `| ${e.name} | ${ext} | ${bucket} |`;
        });

        const planContent = [
          `# Tidy-Up Plan for "${targetFolder.label}"`,
          '',
          `Checked **${entries.length} items** inside \`${targetFolder.folderPath}\`.`,
          '',
          '| File Name | Type | Suggested Folder |',
          '| --- | --- | --- |',
          ...(tableRows.length > 0
            ? tableRows
            : ['| *(Folder is currently empty)* | — | Ready for new files |']),
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
          friendlyLabel: `Waiting for your approval to save summary...`,
          status: 'running',
        });

        let allowed = targetFolder.trustMode === 'trusted';
        if (!allowed) {
          const decision = await this.safetyGate.requestApproval({
            conversationId: params.conversationId,
            headline: `Save "AuraDesk-Organization-Summary.md" in "${targetFolder.label}"?`,
            whatWillHappen: `AuraDesk will save a tidy-up checklist inside "${targetFolder.folderPath}" without moving or deleting any of your existing files.`,
            whyExplanation: 'Gives you a saved copy of the organization plan right inside your folder.',
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
            `I checked **${targetFolder.label}** (${entries.length} items), opened the **Organization Plan** on the right, and saved \`AuraDesk-Organization-Summary.md\` with your permission.`
          );
        } else {
          params.upsertActivity({
            id: saveActId,
            toolName: 'save_file_in_folder',
            friendlyLabel: `Kept folder untouched`,
            status: 'blocked',
          });
          return streamWords(
            `No problem—I left your **${targetFolder.label}** folder completely untouched! You can still view the **Organization Plan** on the right.`
          );
        }
      }

      return streamWords(
        `To organize a folder, click **Choose Folder** right below the chat box first so you can pick which folder AuraDesk is allowed to see.`
      );
    }

    // 6. HTML Webpage Preview
    if (lower.includes('html') || lower.includes('webpage') || lower.includes('landing')) {
      const htmlArtifact = this.db.saveArtifact({
        conversationId: params.conversationId,
        title: 'Live Webpage Preview',
        kind: 'html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>AuraDesk Live Page</title>
  <style>
    body { font-family: "Segoe UI Variable Text", -apple-system, sans-serif; margin: 0; padding: 48px 32px; background: #EBF0F7; color: #0F172A; line-height: 1.6; }
    .sheet { max-width: 640px; margin: 0 auto; background: #FFFFFF; border: 1px solid rgba(15,23,42,0.09); border-radius: 20px; padding: 36px; box-shadow: 0 16px 36px -12px rgba(15,23,42,0.12); }
    h1 { letter-spacing: -0.025em; margin-top: 0; font-size: 28px; }
    .pill { display: inline-block; padding: 6px 12px; border-radius: 999px; background: #E0EDFF; color: #005FB8; font-weight: 600; font-size: 13px; margin-top: 12px; }
    button { margin-top: 20px; background: #005FB8; color: #fff; border: 0; border-radius: 10px; padding: 10px 18px; font-weight: 600; cursor: pointer; }
  </style>
</head>
<body>
  <div class="sheet">
    <h1>Live Webpage Preview</h1>
    <p>Edit this page directly on the right or export it as HTML or PDF in one click.</p>
    <div class="pill" id="status">Interactive Preview Ready</div>
    <br/>
    <button onclick="document.getElementById('status').textContent = 'Clicked at ' + new Date().toLocaleTimeString()">Test Button</button>
  </div>
</body>
</html>`,
      });
      params.handleArtifactCreated(htmlArtifact);
      return streamWords(
        `I opened a **Live Interactive Webpage** on the right—try clicking the button inside the preview or exporting it as **HTML** or **PDF**!`
      );
    }

    // 7. Substantive request -> Structured Document in Canvas
    const cleanHeading =
      params.userText.length > 52
        ? `${params.userText.slice(0, 52).replace(/\s+\S*$/, '')}...`
        : params.userText || 'Project Brief';

    const welcomeArtifact = this.db.saveArtifact({
      conversationId: params.conversationId,
      title: cleanHeading,
      kind: 'markdown',
      content: [
        `# ${cleanHeading}`,
        '',
        '## Summary',
        '- **Currently in Offline Practice Mode:** Connect Google Gemini, OpenAI, Claude, OpenRouter, or Local Ollama at the top of the window for live AI answers on any topic.',
        '- **Editable Document View:** Click **Edit** above to customize this document, or **PDF** to save a formatted copy.',
        '- **Safe Local Tools:** Attach any PDF, Word doc, or CSV spreadsheet, or share a folder to organize files with plain-English approval prompts.',
      ].join('\n'),
    });
    params.handleArtifactCreated(welcomeArtifact);

    return streamWords(
      `I drafted an outline for **"${cleanHeading}"** in the Document View on the right.\n\n*(Tip: You're currently in Offline Practice Mode—click the AI button at the top to switch to your connected Google Gemini or OpenAI model for full live answers!)*`
    );
  }
}
