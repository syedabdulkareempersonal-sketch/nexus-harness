import React, { useState } from 'react';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Cpu,
  ExternalLink,
  Eye,
  EyeOff,
  FolderPlus,
  KeyRound,
  Loader2,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { BrandLogo } from './BrandLogo';
import { PROVIDER_META, ProviderBrandIcon } from './ProviderBrandIcon';
import { WindowTitleBar } from './WindowTitleBar';
import { desktopApi } from '../lib/bridge';
import type { AllowedFolder, ProviderConfig, ProviderId, ThemeMode } from '@shared/types';

interface OnboardingWizardProps {
  providers: ProviderConfig[];
  allowedFolders: AllowedFolder[];
  theme: ThemeMode;
  onToggleTheme: () => void;
  onComplete: (selectedProviderId: ProviderId) => Promise<void>;
  onFoldersChanged: (folders: AllowedFolder[]) => void;
  onProvidersChanged: () => Promise<void>;
}

const CLOUD_TABS: Array<'google' | 'openai' | 'anthropic' | 'openrouter'> = [
  'google',
  'openai',
  'anthropic',
  'openrouter',
];

export const OnboardingWizard: React.FC<OnboardingWizardProps> = ({
  providers,
  allowedFolders,
  theme,
  onToggleTheme,
  onComplete,
  onFoldersChanged,
  onProvidersChanged,
}) => {
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedTab, setSelectedTab] = useState<'google' | 'openai' | 'anthropic' | 'openrouter'>(
    'google'
  );
  // Isolated per-provider inputs so switching tabs never mixes up keys or messages
  const [draftKeys, setDraftKeys] = useState<Record<string, string>>({});
  const [showKey, setShowKey] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [detectingOllama, setDetectingOllama] = useState(false);
  const [statusByTab, setStatusByTab] = useState<
    Record<string, { ok: boolean; text: string } | undefined>
  >({});
  const [connectedProvider, setConnectedProvider] = useState<ProviderId | null>(null);

  const meta = PROVIDER_META[selectedTab];
  const currentKey = draftKeys[selectedTab] ?? '';
  const currentBanner = statusByTab[selectedTab];

  const handleVerifyCloudKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setVerifying(true);
    setStatusByTab((prev) => ({ ...prev, [selectedTab]: undefined }));
    try {
      const res = await desktopApi.verifyAndSaveProvider({
        providerId: selectedTab,
        apiKey: currentKey.trim(),
      });
      setStatusByTab((prev) => ({
        ...prev,
        [selectedTab]: { ok: res.ok, text: res.message },
      }));
      if (res.ok) {
        await onProvidersChanged();
        setConnectedProvider(selectedTab);
        setTimeout(() => setStep(2), 500);
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleAutoDetectOllama = async () => {
    setDetectingOllama(true);
    setStatusByTab((prev) => ({ ...prev, [selectedTab]: undefined }));
    try {
      const res = await desktopApi.verifyAndSaveProvider({
        providerId: 'ollama',
      });
      setStatusByTab((prev) => ({
        ...prev,
        [selectedTab]: { ok: res.ok, text: res.message },
      }));
      if (res.ok) {
        await onProvidersChanged();
        setConnectedProvider('ollama');
        setTimeout(() => setStep(2), 550);
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
    if (added && !allowedFolders.some((f) => f.id === added.id)) {
      onFoldersChanged([...allowedFolders, added]);
    }
  };

  return (
    <div className="win12-mica-bg flex h-screen w-screen flex-col overflow-hidden">
      <WindowTitleBar minimal theme={theme} onToggleTheme={onToggleTheme} />

      <div className="flex flex-1 items-center justify-center overflow-y-auto px-6 py-6">
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', bounce: 0, duration: 0.28 }}
          className="win12-island w-full max-w-xl rounded-3xl p-8 sm:p-9"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <BrandLogo size={42} />
              <div>
                <h1 className="text-2xl font-semibold text-ink">Welcome to AuraDesk</h1>
                <p className="text-xs text-ink-secondary">
                  Next-generation Windows 12 Pro AI Studio — zero terminal, 100% local vault.
                </p>
              </div>
            </div>
            <span className="tabular-nums rounded-full border border-hairline bg-subtle px-3 py-1 text-xs font-semibold text-ink-secondary">
              {step} / 2
            </span>
          </div>

          {step === 1 ? (
            <div className="mt-7 space-y-5">
              <div>
                <h2 className="text-base font-semibold text-ink">
                  Choose an AI Engine to get started
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                  Paste one API key—AuraDesk automatically discovers every live model on your account—or launch offline Local AI / Demo Studio in one click.
                </p>
              </div>

              {/* Distinct Provider Cards */}
              <div
                role="tablist"
                aria-label="Choose AI provider"
                className="grid grid-cols-2 gap-2 sm:grid-cols-4"
              >
                {CLOUD_TABS.map((id) => {
                  const pMeta = PROVIDER_META[id];
                  const active = selectedTab === id;
                  const savedProv = providers.find((p) => p.id === id);
                  return (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={active}
                      type="button"
                      onClick={() => setSelectedTab(id)}
                      className={`tactile-press flex flex-col items-start gap-2 rounded-2xl border p-3 text-left ${
                        active
                          ? 'border-accent bg-elevated shadow-card'
                          : 'border-hairline bg-subtle text-ink-secondary hover:bg-elevated hover:text-ink'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 items-center justify-center rounded-lg ${pMeta.badgeClass}`}
                      >
                        <ProviderBrandIcon providerId={id} className="h-4 w-4" />
                      </span>
                      <div>
                        <div className="text-xs font-semibold text-ink">{pMeta.shortName}</div>
                        <div className="text-[10px] text-ink-muted">
                          {savedProv?.isVerified ? 'Connected' : pMeta.keyPrefixHint}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <form onSubmit={handleVerifyCloudKey} className="space-y-3.5">
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="onboard-api-key" className="text-xs font-semibold text-ink">
                      {meta.shortName} API Key
                    </label>
                    <button
                      type="button"
                      onClick={() => desktopApi.openExternalUrl(meta.docsUrl)}
                      className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                    >
                      {meta.docsLabel}
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
                      type={showKey ? 'text' : 'password'}
                      autoComplete="off"
                      value={currentKey}
                      onChange={(e) =>
                        setDraftKeys((prev) => ({ ...prev, [selectedTab]: e.target.value }))
                      }
                      placeholder={`Paste your ${meta.shortName} key (${meta.keyPlaceholder})`}
                      className="w-full rounded-xl border border-hairline bg-elevated py-2.5 pl-10 pr-10 text-sm text-ink placeholder:text-ink-muted focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey((v) => !v)}
                      aria-label={showKey ? 'Hide API key' : 'Show API key'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-muted hover:text-ink"
                    >
                      {showKey ? (
                        <EyeOff className="h-4 w-4" strokeWidth={1.8} />
                      ) : (
                        <Eye className="h-4 w-4" strokeWidth={1.8} />
                      )}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={verifying || !currentKey.trim()}
                  className="tactile-press inline-flex w-full items-center justify-center gap-2 rounded-xl bg-accent px-5 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-45"
                >
                  {verifying ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2} />
                      Discovering Live {meta.shortName} Models...
                    </>
                  ) : (
                    <>
                      Verify &amp; Connect {meta.shortName}
                      <ArrowRight className="h-4 w-4" strokeWidth={1.9} />
                    </>
                  )}
                </button>
              </form>

              {currentBanner && (
                <div
                  role="status"
                  className={`flex items-start gap-2.5 rounded-xl border border-hairline px-4 py-3 text-xs leading-relaxed ${
                    currentBanner.ok ? 'bg-trust-soft text-trust' : 'bg-warn-soft text-warn'
                  }`}
                >
                  {currentBanner.ok ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
                  ) : (
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.9} />
                  )}
                  <span className="font-medium">{currentBanner.text}</span>
                </div>
              )}

              <div className="relative flex items-center py-0.5">
                <div className="flex-grow border-t border-hairline" />
                <span className="mx-3 text-[11px] text-ink-muted">or start without a cloud key</span>
                <div className="flex-grow border-t border-hairline" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={handleAutoDetectOllama}
                  disabled={detectingOllama}
                  className="tactile-press flex items-start gap-3 rounded-2xl border border-hairline bg-elevated p-3.5 text-left hover:border-strongline"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-subtle text-accent">
                    {detectingOllama ? (
                      <Loader2 className="h-4 w-4 animate-spin" strokeWidth={1.8} />
                    ) : (
                      <Cpu className="h-4 w-4" strokeWidth={1.8} />
                    )}
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-ink">
                      Auto-Detect Local AI (Ollama)
                    </div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-secondary">
                      100% offline on your own PC.
                    </p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleStartGuidedDemo}
                  className="tactile-press flex items-start gap-3 rounded-2xl border border-hairline bg-elevated p-3.5 text-left hover:border-strongline"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Sparkles className="h-4 w-4" strokeWidth={1.8} />
                  </div>
                  <div>
                    <div className="text-xs font-semibold text-ink">Explore Demo Studio</div>
                    <p className="mt-0.5 text-[11px] leading-relaxed text-ink-secondary">
                      Try Canvas, Memory &amp; Folders now.
                    </p>
                  </div>
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-7 space-y-6">
              <div>
                <h2 className="text-lg font-semibold text-ink">
                  Share a Safe Folder (Optional)
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-secondary">
                  AuraDesk cannot read your whole hard drive. It only sees folders you explicitly pick—and pauses with a plain-English card before creating or changing any file.
                </p>
              </div>

              <div className="rounded-2xl border border-hairline bg-subtle p-5">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-trust-soft text-trust">
                      <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-ink">Smart Folder Sandbox</div>
                      <p className="text-xs text-ink-secondary">
                        Great choices: Downloads, Documents, or a Project folder.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handlePickFolder}
                    className="tactile-press inline-flex shrink-0 items-center gap-2 rounded-xl border border-strongline bg-elevated px-3.5 py-2 text-xs font-semibold text-ink hover:bg-subtle"
                  >
                    <FolderPlus className="h-4 w-4 text-accent" strokeWidth={1.8} />
                    Pick Folder
                  </button>
                </div>

                {allowedFolders.length > 0 && (
                  <ul className="mt-4 space-y-2 border-t border-hairline pt-3">
                    {allowedFolders.map((folder) => (
                      <li
                        key={folder.id}
                        className="flex items-center justify-between rounded-xl bg-elevated px-3 py-2 text-xs"
                      >
                        <span className="font-semibold text-ink">{folder.label}</span>
                        <span className="truncate pl-4 text-ink-muted">{folder.folderPath}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex items-center justify-between pt-1">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="tactile-press rounded-xl px-4 py-2.5 text-xs font-semibold text-ink-secondary hover:bg-subtle hover:text-ink"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => onComplete(connectedProvider || 'demo')}
                  className="tactile-press inline-flex items-center gap-2 rounded-xl bg-accent px-6 py-2.5 text-sm font-semibold text-accent-ink hover:bg-accent-hover"
                >
                  Launch AuraDesk Studio
                  <ArrowRight className="h-4 w-4" strokeWidth={1.9} />
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
};
