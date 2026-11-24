import React, { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Cpu, KeyRound, Loader2, Lock, X } from 'lucide-react';
import { desktopApi } from '../lib/bridge';
import type { AppSettings, ProviderConfig, ProviderId } from '@shared/types';

interface SettingsModalProps {
  open: boolean;
  settings: AppSettings;
  providers: ProviderConfig[];
  onClose: () => void;
  onRefreshState: () => Promise<void>;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  settings,
  providers,
  onClose,
  onRefreshState,
}) => {
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>(settings.activeProviderId);
  const [apiKey, setApiKey] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [testing, setTesting] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const currentProvider =
    providers.find((p) => p.id === selectedProvider) ?? providers[0];

  const handleSaveAndVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setTesting(true);
    setFeedback(null);
    try {
      const res = await desktopApi.verifyAndSaveProvider({
        providerId: selectedProvider,
        apiKey: apiKey.trim() || undefined,
        selectedModel: customModel.trim() || currentProvider?.selectedModel,
      });
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setApiKey('');
        await onRefreshState();
      }
    } finally {
      setTesting(false);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Workspace Settings"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm"
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.18, ease: [0.23, 1, 0.32, 1] }}
            className="w-full max-w-lg rounded-3xl border border-hairline bg-surface p-7 shadow-modal"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-ink">AI Models &amp; Privacy</h2>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close Settings"
                className="tactile-press rounded-lg p-1.5 text-ink-muted hover:bg-subtle hover:text-ink"
              >
                <X className="h-4 w-4" strokeWidth={1.8} />
              </button>
            </div>

            {/* Provider Selector */}
            <div className="mt-5 grid grid-cols-3 gap-2">
              {providers.map((p) => {
                const active = p.id === selectedProvider;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      setSelectedProvider(p.id);
                      setCustomModel(p.selectedModel);
                      setFeedback(null);
                    }}
                    className={`tactile-press flex flex-col items-start rounded-xl border p-3 text-left ${
                      active
                        ? 'border-accent bg-accent-soft/60 text-ink'
                        : 'border-hairline bg-canvas text-ink-secondary hover:text-ink'
                    }`}
                  >
                    <span className="text-xs font-semibold">{p.displayName}</span>
                    <span className="mt-0.5 text-[11px] text-ink-muted">
                      {p.isVerified ? 'Ready' : p.hasKey ? 'Saved' : 'Not connected'}
                    </span>
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleSaveAndVerify} className="mt-5 space-y-4">
              {selectedProvider !== 'ollama' && selectedProvider !== 'demo' && (
                <div>
                  <label htmlFor="settings-api-key" className="mb-1 block text-xs font-medium text-ink">
                    {currentProvider?.displayName} API Key{' '}
                    {currentProvider?.keyHint && (
                      <span className="text-ink-muted">(Saved: {currentProvider.keyHint})</span>
                    )}
                  </label>
                  <div className="relative">
                    <KeyRound
                      className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                      strokeWidth={1.8}
                    />
                    <input
                      id="settings-api-key"
                      type="password"
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={
                        currentProvider?.hasKey
                          ? 'Paste new key to replace saved key'
                          : 'Paste API key...'
                      }
                      className="w-full rounded-xl border border-hairline bg-canvas py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {selectedProvider === 'ollama' && (
                <div className="flex items-start gap-3 rounded-2xl border border-hairline bg-canvas p-4">
                  <Cpu className="mt-0.5 h-5 w-5 shrink-0 text-accent" strokeWidth={1.8} />
                  <div className="text-xs leading-relaxed text-ink-secondary">
                    AuraDesk automatically detects models running in your local Ollama app at{' '}
                    <code className="rounded bg-subtle px-1.5 py-0.5 font-mono">
                      127.0.0.1:11434
                    </code>
                    —100% offline with zero cloud cost.
                  </div>
                </div>
              )}

              {selectedProvider !== 'demo' && (
                <div>
                  <label htmlFor="settings-model-input" className="mb-1 block text-xs font-medium text-ink">
                    Selected Model
                  </label>
                  <input
                    id="settings-model-input"
                    list="provider-models-list"
                    value={customModel || currentProvider?.selectedModel || ''}
                    onChange={(e) => setCustomModel(e.target.value)}
                    className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2 text-sm text-ink focus:border-accent focus:outline-none"
                  />
                  <datalist id="provider-models-list">
                    {(currentProvider?.availableModels ?? []).map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </div>
              )}

              {feedback && (
                <div
                  role="status"
                  className={`flex items-center gap-2 rounded-xl px-3.5 py-2.5 text-xs font-medium ${
                    feedback.ok ? 'bg-trust-soft text-trust' : 'bg-warn-soft text-warn'
                  }`}
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0" strokeWidth={1.8} />
                  <span>{feedback.text}</span>
                </div>
              )}

              <div className="flex items-center justify-between border-t border-hairline pt-4">
                <div className="flex items-center gap-1.5 text-xs text-ink-muted">
                  <Lock className="h-3.5 w-3.5" strokeWidth={1.8} />
                  Keys encrypted locally in OS keychain
                </div>

                <button
                  type="submit"
                  disabled={testing}
                  className="tactile-press inline-flex items-center gap-1.5 rounded-xl bg-accent px-5 py-2 text-xs font-semibold text-accent-ink hover:bg-accent-hover disabled:opacity-50"
                >
                  {testing ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />
                      Checking...
                    </>
                  ) : selectedProvider === 'ollama' ? (
                    'Scan & Activate Ollama'
                  ) : selectedProvider === 'demo' ? (
                    'Activate Guided Demo'
                  ) : (
                    'Verify & Use Provider'
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
