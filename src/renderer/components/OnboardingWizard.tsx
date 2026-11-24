import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  CheckCircle2,
  Cpu,
  ExternalLink,
  FolderPlus,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { desktopApi } from '../lib/bridge';
import type { AllowedFolder, ProviderConfig, ProviderId } from '@shared/types';

interface OnboardingWizardProps {
  providers: ProviderConfig[];
  allowedFolders: AllowedFolder[];
  onComplete: (selectedProviderId: ProviderId) => Promise<void>;
  onFoldersChanged: (folders: AllowedFolder[]) => void;
  onProvidersChanged: () => Promise<void>;
}

const KEY_HELP_URLS: Record<string, { label: string; url: string; placeholder: string }> = {
  google: {
    label: 'Get a free Google AI Studio key',
    url: 'https://aistudio.google.com/app/apikey',
    placeholder: 'Paste your AIza... key',
  },
  openai: {
    label: 'Get an OpenAI API key',
    url: 'https://platform.openai.com/api-keys',
    placeholder: 'Paste your sk-... key',
  },
  anthropic: {
    label: 'Get an Anthropic Console key',
    url: 'https://console.anthropic.com/settings/keys',
    placeholder: 'Paste your sk-ant-... key',
  },
  openrouter: {
    label: 'Get an OpenRouter key (all models in one)',
    url: 'https://openrouter.ai/keys',
    placeholder: 'Paste your sk-or-... key',
  },
};

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  providers,
  allowedFolders,
  onComplete,
  onFoldersChanged,
  onProvidersChanged,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedTab, setSelectedTab] = useState<'google' | 'openai' | 'anthropic' | 'openrouter'>(
    'google'
  );
  const [apiKey, setApiKey] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [detectingOllama, setDetectingOllama] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    ok: boolean;
    text: string;
  } | null>(null);
  const [connectedProvider, setConnectedProvider] = useState<ProviderId | null>(null);

  const cloudProviders = providers.filter((p) =>
    ['google', 'openai', 'anthropic', 'openrouter'].includes(p.id)
  );
  const activeCloud = cloudProviders.find((p) => p.id === selectedTab) ?? cloudProviders[0];
  const [chosenModel, setChosenModel] = useState<string>(
    activeCloud?.selectedModel || 'gemini-2.5-flash'
  );

  const handleTabSwitch = (id: 'google' | 'openai' | 'anthropic' | 'openrouter') => {
    setSelectedTab(id);
    setStatusBanner(null);
    const found = providers.find((p) => p.id === id);
    if (found) setChosenModel(found.selectedModel);
  };

  const handleVerifyCloudKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setStatusBanner(null);
    try {
      const res = await desktopApi.verifyAndSaveProvider({
        providerId: selectedTab,
        apiKey,
        selectedModel: chosenModel,
      });
      setStatusBanner({ ok: res.ok, text: res.message });
      if (res.ok) {
        await onProvidersChanged();
        setConnectedProvider(selectedTab);
        setTimeout(() => setStep(2), 550);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleAutoDetectOllama = async () => {
    setDetectingOllama(true);
    setStatusBanner(null);
    try {
      const res = await desktopApi.verifyAndSaveProvider({
        providerId: 'ollama',
      });
      setStatusBanner({ ok: res.ok, text: res.message });
      if (res.ok) {
        await onProvidersChanged();
        setConnectedProvider('ollama');
        setTimeout(() => setStep(2), 650);
      }
    } finally {
      setDetectingOllama(false);
    }
  };

  const handleStartGuidedDemo = async () => {
    await desktopApi.verifyAndSaveProvider({ providerId: 'demo' });
    await onProvidersChanged();
    setConnectedProvider('demo');
    setStep(2);
  };

  const handlePickFolder = async () => {
    const added = await desktopApi.pickAndAddFolder();
    if (added) {
      const exists = allowedFolders.some((f) => f.id === added.id);
      if (!exists) {
        onFoldersChanged([...allowedFolders, added]);
      }
    }
  };

  const keyHelp = KEY_HELP_URLS[selectedTab];

  return (
    <div className="flex h-screen w-screen items-center justify-center overflow-y-auto bg-canvas px-6 py-10">
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
        className="w-full max-w-xl rounded-3xl border border-hairline bg-surface p-8 shadow-modal sm:p-10"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3.5">
            <BrandLogo size={42} />
            <div>
              <h1 className="text-2xl font-semibold text-ink">Welcome to AuraDesk</h1>
              <p className="text-sm text-ink-secondary">
                Your private AI desktop studio — zero setup, zero terminal.
              </p>
            </div>
          </div>
          <span className="tabular-nums rounded-full bg-subtle px-3 py-1 text-xs font-medium text-ink-secondary">
            {step} of 2
          </span>
        </div>

        {step === 1 ? (
          <div className="mt-8 space-y-6">
            <div>
              <h2 className="text-base font-semibold text-ink">
                Connect your preferred intelligence
              </h2>
              <p className="mt-1 text-sm text-ink-secondary">
                Paste a single API key—encrypted safely in your computer&apos;s keychain—or detect free offline Local AI in one click.
              </p>
            </div>

            {/* Cloud Provider Selector */}
            <div
              role="tablist"
              aria-label="Choose AI provider"
              className="grid grid-cols-2 gap-2 rounded-2xl bg-subtle p-1.5 sm:grid-cols-4"
            >
              {(['google', 'openai', 'anthropic', 'openrouter'] as const).map((id) => {
                const labelMap: Record<typeof id, string> = {
                  google: 'Gemini',
                  openai: 'OpenAI',
                  anthropic: 'Claude',
                  openrouter: 'OpenRouter',
                };
                const active = selectedTab === id;
                return (
                  <button
                    key={id}
                    role="tab"
                    aria-selected={active}
                    type="button"
                    onClick={() => handleTabSwitch(id)}
                    className={`tactile-press rounded-xl px-3 py-2 text-sm font-medium ${
                      active
                        ? 'bg-surface text-ink shadow-card'
                        : 'text-ink-secondary hover:text-ink'
                    }`}
                  >
                    {labelMap[id]}
                  </button>
                );
              })}
            </div>

            <form onSubmit={handleVerifyCloudKey} className="space-y-4">
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="onboard-api-key" className="text-sm font-medium text-ink">
                    {activeCloud?.displayName} API Key
                  </label>
                  <button
                    type="button"
                    onClick={() => desktopApi.openExternalUrl(keyHelp.url)}
                    className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                  >
                    {keyHelp.label}
                    <ExternalLink className="h-3 w-3" strokeWidth={1.8} />
                  </button>
                </div>
                <div className="relative">
                  <KeyRound
                    className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                    strokeWidth={1.8}
                  />
                  <input
                    id="onboard-api-key"
                    type="password"
                    autoComplete="off"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder={keyHelp.placeholder}
                    className="w-full rounded-xl border border-hairline bg-canvas py-2.5 pl-10 pr-4 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <label htmlFor="onboard-model" className="sr-only">
                    Default Model
                  </label>
                  <select
                    id="onboard-model"
                    value={chosenModel}
                    onChange={(e) => setChosenModel(e.target.value)}
                    className="w-full rounded-xl border border-hairline bg-canvas px-3.5 py-2.5 text-sm text-ink"
                  >
                    {(activeCloud?.availableModels ?? []).map((m) => (
                      <option key={m} value={m}>
                        Model: {m}
                      </option>
                    ))}
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={verifying || !apiKey.trim()}
                  className="tactile-press inline-flex items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-medium text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                      Verifying...
                    </>
                  ) : (
                    <>
                      Verify &amp; Connect
                      <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                    </>
                  )}
                </button>
              </div>
            </form>

            {statusBanner && (
              <div
                role="status"
                className={`flex items-start gap-2.5 rounded-xl border border-hairline px-4 py-3 text-sm ${
                  statusBanner.ok ? 'bg-trust-soft text-trust' : 'bg-warn-soft text-warn'
                }`}
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
                <span>{statusBanner.text}</span>
              </div>
            )}

            <div className="relative flex items-center py-1">
              <div className="flex-grow border-t border-hairline" />
              <span className="mx-3 text-xs text-ink-muted">or run without an API key</span>
              <div className="flex-grow border-t border-hairline" />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={handleAutoDetectOllama}
                disabled={detectingOllama}
                className="tactile-press flex items-start gap-3 rounded-2xl border border-hairline bg-canvas p-4 text-left hover:border-strongline"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-subtle text-ink">
                  {detectingOllama ? (
                    <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />
                  ) : (
                    <Cpu className="h-4 w-4" strokeWidth={1.8} />
                  )}
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink">
                    Auto-Detect Local AI (Ollama)
                  </div>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">
                    100% private &amp; offline on your own computer.
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={handleStartGuidedDemo}
                className="tactile-press flex items-start gap-3 rounded-2xl border border-hairline bg-canvas p-4 text-left hover:border-strongline"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Sparkles className="h-4 w-4" strokeWidth={1.8} />
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink">Explore Guided Demo Mode</div>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-secondary">
                    Try Canvas, Memory, Workflows &amp; Folders right away.
                  </p>
                </div>
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-8 space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-ink">
                Choose which folders AuraDesk can see
              </h2>
              <p className="mt-1 text-sm leading-relaxed text-ink-secondary">
                AuraDesk never scans your whole drive. It can only read folders you explicitly pick—and it always asks in plain English before changing or moving any file.
              </p>
            </div>

            <div className="rounded-2xl border border-hairline bg-canvas p-5">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-trust-soft text-trust">
                    <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="text-sm font-semibold text-ink">Smart Folder Sandbox</div>
                    <p className="text-xs text-ink-secondary">
                      Great choices: Downloads, Desktop, or a Project folder.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handlePickFolder}
                  className="tactile-press inline-flex shrink-0 items-center gap-2 rounded-xl border border-strongline bg-surface px-3.5 py-2 text-xs font-semibold text-ink hover:bg-subtle"
                >
                  <FolderPlus className="h-4 w-4" strokeWidth={1.8} />
                  Pick Folder
                </button>
              </div>

              {allowedFolders.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-hairline pt-3">
                  {allowedFolders.map((folder) => (
                    <li
                      key={folder.id}
                      className="flex items-center justify-between rounded-xl bg-surface px-3 py-2 text-xs"
                    >
                      <span className="font-medium text-ink">{folder.label}</span>
                      <span className="truncate pl-4 text-ink-muted">{folder.folderPath}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="tactile-press rounded-xl px-4 py-2.5 text-sm font-medium text-ink-secondary hover:bg-subtle hover:text-ink"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => onComplete(connectedProvider || 'demo')}
                className="tactile-press inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
              >
                Open My Workspace
                <ArrowRight className="h-4 w-4" strokeWidth={1.9} />
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </div>
  );
};
