import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  RefreshCw,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  formatFriendlyModelName,
  PROVIDER_META,
  ProviderBrandIcon,
} from './ProviderBrandIcon';
import { desktopApi } from '../lib/bridge';
import type { AppSettings, ProviderConfig, ProviderId } from '@shared/types';

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  providers: ProviderConfig[];
  onClose: () => void;
  onRefreshState: () => Promise<void>;
}

function detectCrossProviderPaste(
  currentId: ProviderId,
  rawKey: string
): { targetId: ProviderId; targetName: string } | null {
  const k = rawKey.trim();
  if (!k) return null;
  if ((k.startsWith('AIza') || k.startsWith('AQ.')) && currentId !== 'google') {
    return { targetId: 'google', targetName: 'Google Gemini' };
  }
  if (k.startsWith('sk-ant-') && currentId !== 'anthropic') {
    return { targetId: 'anthropic', targetName: 'Anthropic Claude' };
  }
  if (k.startsWith('sk-or-') && currentId !== 'openrouter') {
    return { targetId: 'openrouter', targetName: 'OpenRouter' };
  }
  if (
    k.startsWith('sk-') &&
    !k.startsWith('sk-ant-') &&
    !k.startsWith('sk-or-') &&
    currentId === 'google'
  ) {
    return { targetId: 'openai', targetName: 'OpenAI' };
  }
  return null;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  providers,
  onClose,
  onRefreshState,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(settings.activeProviderId);
  // Strictly isolated per-provider draft state so keys and messages never bleed across tabs!
  const [draftKeys, setDraftKeys] = useState<Partial<Record<ProviderId, string>>>({});
  const [draftModels, setDraftModels] = useState<Partial<Record<ProviderId, string>>>({});
  const [revealKey, setRevealKey] = useState<Partial<Record<ProviderId, boolean>>>({});
  const [feedbackByProvider, setFeedbackByProvider] = useState<
    Partial<Record<ProviderId, { ok: boolean; text: string }>>
  >({});
  const [testingProvider, setTestingProvider] = useState<ProviderId | null>(null);

  useEffect(() => {
    if (open) {
      // If currently in Demo mode, land directly on Google Gemini so connecting a real key takes 0 extra clicks
      setSelectedProvider(
        settings.activeProviderId === 'demo' ? 'google' : settings.activeProviderId
      );
    }
  }, [open, settings.activeProviderId]);

  const currentProvider =
    providers.find((p) => p.id === selectedProvider) ?? providers[0];
  const meta = PROVIDER_META[selectedProvider];
  const currentKeyInput = draftKeys[selectedProvider] ?? '';
  const currentSelectedModel =
    draftModels[selectedProvider] ?? currentProvider?.selectedModel ?? '';
  const currentFeedback = feedbackByProvider[selectedProvider] ?? null;
  const isRevealed = Boolean(revealKey[selectedProvider]);
  const isTesting = testingProvider === selectedProvider;

  const crossPaste = detectCrossProviderPaste(selectedProvider, currentKeyInput);

  const runVerification = async (
    targetProviderId: ProviderId,
    explicitKey?: string,
    explicitModel?: string
  ) => {
    setTestingProvider(targetProviderId);
    setFeedbackByProvider((prev) => ({ ...prev, [targetProviderId]: undefined }));
    try {
      const res = await desktopApi.verifyAndSaveProvider({
        providerId: targetProviderId,
        apiKey: explicitKey !== undefined ? explicitKey : draftKeys[targetProviderId]?.trim() || undefined,
        selectedModel:
          explicitModel !== undefined
            ? explicitModel
            : draftModels[targetProviderId] ||
              providers.find((p) => p.id === targetProviderId)?.selectedModel,
      });

      setFeedbackByProvider((prev) => ({
        ...prev,
        [targetProviderId]: { ok: res.ok, text: res.message },
      }));

      if (res.ok) {
        setDraftKeys((prev) => ({ ...prev, [targetProviderId]: '' }));
        if (res.provider?.selectedModel) {
          setDraftModels((prev) => ({
            ...prev,
            [targetProviderId]: res.provider!.selectedModel,
          }));
        }
        await onRefreshState();
      }
    } finally {
      setTestingProvider(null);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    await runVerification(selectedProvider);
  };

  const handleSwitchModelOnly = async (newModel: string) => {
    setDraftModels((prev) => ({ ...prev, [selectedProvider]: newModel }));
    if (currentProvider?.isVerified) {
      await desktopApi.selectActiveProvider(selectedProvider, newModel);
      await onRefreshState();
      setFeedbackByProvider((prev) => ({
        ...prev,
        [selectedProvider]: {
          ok: true,
          text: `Switched active model to ${newModel}.`,
        },
      }));
    }
  };

  const handleDisconnect = async () => {
    await desktopApi.disconnectProvider(selectedProvider);
    setDraftKeys((prev) => ({ ...prev, [selectedProvider]: '' }));
    setFeedbackByProvider((prev) => ({
      ...prev,
      [selectedProvider]: {
        ok: true,
        text: `Removed saved ${currentProvider.displayName} key from this PC.`,
      },
    }));
    await onRefreshState();
  };

  const handleMoveCrossPastedKey = async () => {
    if (!crossPaste) return;
    const keyToMove = currentKeyInput.trim();
    const dest = crossPaste.targetId;
    setDraftKeys((prev) => ({ ...prev, [selectedProvider]: '', [dest]: keyToMove }));
    setSelectedProvider(dest);
    await runVerification(dest, keyToMove);
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="AI Engines & Local Vault"
          onClick={onClose}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
        >
          <motion.div
            onClick={(e) => e.stopPropagation()}
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-strongline bg-elevated shadow-modal md:h-[540px] md:flex-row"
          >
            {/* Left Windows 12 Pro Settings Navigation Rail */}
            <div className="flex w-full shrink-0 flex-col border-b border-hairline bg-subtle p-4 md:w-64 md:border-b-0 md:border-r">
              <div className="mb-3 px-2">
                <h2 className="text-base font-semibold text-ink">AI Engines</h2>
                <p className="text-[11px] text-ink-muted">
                  Each engine stores its own key &amp; live model list
                </p>
              </div>

              <div className="grid grid-cols-2 gap-1.5 md:flex md:flex-1 md:flex-col">
                {providers.map((p) => {
                  const selected = p.id === selectedProvider;
                  const isCurrentActive = settings.activeProviderId === p.id;
                  const pMeta = PROVIDER_META[p.id];

                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedProvider(p.id)}
                      className={`tactile-press relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-left ${
                        selected
                          ? 'bg-elevated text-ink shadow-card'
                          : 'text-ink-secondary hover:bg-surface hover:text-ink'
                      }`}
                    >
                      {selected && (
                        <span className="hidden h-4 w-1 shrink-0 rounded-full bg-accent md:inline-block" />
                      )}
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${pMeta.badgeClass}`}
                      >
                        <ProviderBrandIcon providerId={p.id} className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-semibold text-ink">
                          {pMeta.shortName}
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${
                              isCurrentActive
                                ? 'bg-accent'
                                : p.isVerified
                                  ? 'bg-trust'
                                  : 'bg-ink-muted/45'
                            }`}
                          />
                          <span className="truncate">
                            {isCurrentActive
                              ? 'In Use'
                              : p.isVerified
                                ? 'Connected'
                                : 'Not set up'}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-3 hidden items-center gap-1.5 px-2 text-[11px] text-ink-muted md:flex">
                <Lock className="h-3.5 w-3.5 shrink-0 text-trust" strokeWidth={1.8} />
                <span>Encrypted via Windows Vault</span>
              </div>
            </div>

            {/* Right Provider-Specific Configuration Studio */}
            <div className="flex flex-1 flex-col justify-between overflow-y-auto p-6 sm:p-7">
              <div>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <div
                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${meta.badgeClass}`}
                    >
                      <ProviderBrandIcon providerId={selectedProvider} className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="text-lg font-semibold text-ink">
                          {currentProvider?.displayName}
                        </h3>
                        {settings.activeProviderId === selectedProvider && (
                          <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
                            Active Engine
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-ink-secondary">{meta.tagline}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close AI Engines dialog"
                    className="tactile-press rounded-xl p-1.5 text-ink-muted hover:bg-subtle hover:text-ink"
                  >
                    <X className="h-4 w-4" strokeWidth={1.8} />
                  </button>
                </div>

                {/* Cloud API Provider Form */}
                {selectedProvider !== 'ollama' && selectedProvider !== 'demo' && (
                  <form onSubmit={handleSubmit} className="mt-6 space-y-4">
                    {/* Saved Key Status Pill */}
                    {currentProvider?.hasKey && currentProvider.keyHint && (
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-hairline bg-subtle px-4 py-3">
                        <div className="flex items-center gap-2 text-xs">
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-trust" strokeWidth={1.9} />
                          <span className="font-medium text-ink">
                            Saved key: <code className="font-mono">{currentProvider.keyHint}</code>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => runVerification(selectedProvider, '')}
                            disabled={isTesting}
                            className="tactile-press inline-flex items-center gap-1 rounded-lg border border-hairline bg-elevated px-2.5 py-1 text-[11px] font-semibold text-ink hover:bg-subtle"
                          >
                            <RefreshCw
                              className={`h-3 w-3 ${isTesting ? 'animate-spin' : ''}`}
                              strokeWidth={1.8}
                            />
                            Refresh Live Models
                          </button>
                          <button
                            type="button"
                            onClick={handleDisconnect}
                            className="tactile-press inline-flex items-center gap-1 rounded-lg bg-danger-soft px-2.5 py-1 text-[11px] font-semibold text-danger"
                          >
                            <Trash2 className="h-3 w-3" strokeWidth={1.8} />
                            Disconnect
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Dedicated Key Input */}
                    <div>
                      <div className="mb-1.5 flex items-center justify-between">
                        <label
                          htmlFor={`key-input-${selectedProvider}`}
                          className="text-xs font-semibold text-ink"
                        >
                          {currentProvider?.hasKey
                            ? `Replace ${meta.shortName} API Key`
                            : `${currentProvider?.displayName} API Key`}
                        </label>
                        {meta.docsUrl && (
                          <button
                            type="button"
                            onClick={() => desktopApi.openExternalUrl(meta.docsUrl)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                          >
                            {meta.docsLabel}
                            <ExternalLink className="h-3 w-3" strokeWidth={1.8} />
                          </button>
                        )}
                      </div>

                      <div className="relative">
                        <KeyRound
                          className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                          strokeWidth={1.8}
                        />
                        <input
                          id={`key-input-${selectedProvider}`}
                          type={isRevealed ? 'text' : 'password'}
                          autoComplete="off"
                          value={currentKeyInput}
                          onChange={(e) =>
                            setDraftKeys((prev) => ({
                              ...prev,
                              [selectedProvider]: e.target.value,
                            }))
                          }
                          placeholder={
                            currentProvider?.hasKey
                              ? `Leave blank to keep ${currentProvider.keyHint} or paste new ${meta.keyPlaceholder}`
                              : `Paste your ${meta.shortName} key (${meta.keyPlaceholder})`
                          }
                          className="w-full rounded-xl border border-hairline bg-elevated py-2.5 pl-10 pr-10 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() =>
                            setRevealKey((prev) => ({
                              ...prev,
                              [selectedProvider]: !isRevealed,
                            }))
                          }
                          aria-label={isRevealed ? 'Hide API key' : 'Show API key'}
                          className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-muted hover:text-ink"
                        >
                          {isRevealed ? (
                            <EyeOff className="h-4 w-4" strokeWidth={1.8} />
                          ) : (
                            <Eye className="h-4 w-4" strokeWidth={1.8} />
                          )}
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] text-ink-muted">
                        Format hint: {meta.keyPrefixHint}. AuraDesk automatically fetches live models supported by your account.
                      </p>
                    </div>

                    {/* Smart Cross-Provider Key Helper */}
                    {crossPaste && (
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-hairline bg-accent-soft px-3.5 py-2.5 text-xs">
                        <span className="font-medium text-ink">
                          This looks like a <strong>{crossPaste.targetName}</strong> key.
                        </span>
                        <button
                          type="button"
                          onClick={handleMoveCrossPastedKey}
                          className="tactile-press inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-ink"
                        >
                          Switch to {crossPaste.targetName}
                          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.9} />
                        </button>
                      </div>
                    )}

                    {/* Live Model Picker */}
                    <div>
                      <label
                        htmlFor={`model-select-${selectedProvider}`}
                        className="mb-1.5 block text-xs font-semibold text-ink"
                      >
                        Active {meta.shortName} Model ({currentProvider?.availableModels.length || 0} available)
                      </label>
                      <select
                        id={`model-select-${selectedProvider}`}
                        value={currentSelectedModel}
                        onChange={(e) => handleSwitchModelOnly(e.target.value)}
                        className="w-full rounded-xl border border-hairline bg-elevated px-3.5 py-2.5 text-sm font-medium text-ink focus:border-accent focus:outline-none"
                      >
                        {(currentProvider?.availableModels ?? []).map((m) => (
                          <option key={m} value={m}>
                            {formatFriendlyModelName(m)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="pt-1">
                      <button
                        type="submit"
                        disabled={isTesting || (!currentKeyInput.trim() && !currentProvider?.hasKey)}
                        className="tactile-press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
                      >
                        {isTesting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                            Connecting to {meta.shortName}...
                          </>
                        ) : currentProvider?.isVerified && !currentKeyInput.trim() ? (
                          `Use ${currentProvider.displayName} · ${formatFriendlyModelName(currentSelectedModel)}`
                        ) : (
                          `Verify & Connect ${meta.shortName}`
                        )}
                      </button>
                    </div>
                  </form>
                )}

                {/* Local AI (Ollama) Pane */}
                {selectedProvider === 'ollama' && (
                  <div className="mt-6 space-y-4">
                    <div className="rounded-2xl border border-hairline bg-subtle p-4">
                      <div className="flex items-start gap-3">
                        <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={1.8} />
                        <div className="space-y-1 text-xs leading-relaxed text-ink-secondary">
                          <p className="font-semibold text-ink">100% Private On-Device AI</p>
                          <p>
                            Scans <code className="rounded bg-elevated px-1.5 py-0.5 font-mono">http://127.0.0.1:11434</code> for models installed in Ollama (such as <code className="font-mono">llama3.2</code>, <code className="font-mono">qwen2.5</code>, or <code className="font-mono">gemma3</code>). Zero API keys or cloud bills.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label htmlFor="ollama-model-select" className="mb-1.5 block text-xs font-semibold text-ink">
                        Detected Local Model
                      </label>
                      <select
                        id="ollama-model-select"
                        value={currentSelectedModel}
                        onChange={(e) => handleSwitchModelOnly(e.target.value)}
                        className="w-full rounded-xl border border-hairline bg-elevated px-3.5 py-2.5 text-sm font-medium text-ink"
                      >
                        {(currentProvider?.availableModels ?? ['llama3.2']).map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={isTesting}
                        onClick={() => runVerification('ollama')}
                        className="tactile-press inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
                      >
                        {isTesting ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                            Scanning Local Ollama...
                          </>
                        ) : (
                          'Auto-Detect & Connect Local AI'
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => desktopApi.openExternalUrl('https://ollama.com/download')}
                        className="tactile-press inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-elevated px-4 py-2.5 text-xs font-semibold text-ink hover:bg-subtle"
                      >
                        Get Ollama
                        <ExternalLink className="h-3.5 w-3.5" strokeWidth={1.8} />
                      </button>
                    </div>
                  </div>
                )}

                {/* Guided Demo Studio Pane */}
                {selectedProvider === 'demo' && (
                  <div className="mt-6 space-y-4">
                    <div className="rounded-2xl border border-hairline bg-subtle p-5">
                      <div className="flex items-start gap-3">
                        <Sparkles className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={1.8} />
                        <div className="space-y-1.5 text-xs leading-relaxed text-ink-secondary">
                          <p className="text-sm font-semibold text-ink">
                            Instant Zero-Key Interactive Studio
                          </p>
                          <p>
                            Test AuraDesk&apos;s Split-View Live Canvas, PDF/CSV/DOCX Document Analyst, Smart Folder Sandbox with Plain-English Safety Approvals, and Sticky-Note Memory Board offline with zero API keys.
                          </p>
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => runVerification('demo')}
                      className="tactile-press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
                    >
                      Use Guided Demo Studio
                    </button>
                  </div>
                )}
              </div>

              {/* Isolated Provider Feedback Banner */}
              {currentFeedback && (
                <div
                  role="status"
                  className={`mt-4 flex items-start gap-2.5 rounded-2xl border border-hairline px-4 py-3 text-xs leading-relaxed ${
                    currentFeedback.ok ? 'bg-trust-soft text-trust' : 'bg-warn-soft text-warn'
                  }`}
                >
                  {currentFeedback.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
                  )}
                  <span className="font-medium">{currentFeedback.text}</span>
                </div>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
