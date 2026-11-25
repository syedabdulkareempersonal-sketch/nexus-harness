import React from 'react';
import type { ProviderId } from '@shared/types';

export interface ProviderVisualMeta {
  id: ProviderId;
  shortName: string;
  tagline: string;
  keyPlaceholder: string;
  keyPrefixHint: string;
  docsLabel: string;
  docsUrl: string;
  badgeClass: string;
}

export function formatFriendlyModelName(modelId: string): string {
  if (!modelId) return 'Default Model';
  if (modelId === 'auradesk-interactive-studio') return 'Practice Mode';

  const clean = modelId.replace(/^models\//, '').replace(/^[a-z0-9-]+\//i, '');
  return clean
    .split(/[-_]+/)
    .map((part) => {
      if (/^gpt$/i.test(part)) return 'GPT';
      if (/^o\d/i.test(part)) return part.toLowerCase();
      if (/^\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(' ');
}

export const PROVIDER_META: Record<ProviderId, ProviderVisualMeta> = {
  google: {
    id: 'google',
    shortName: 'Google Gemini',
    tagline: 'Fast, smart everyday assistant from Google',
    keyPlaceholder: 'AIzaSy... or AQ...',
    keyPrefixHint: 'Starts with AIza... or AQ...',
    docsLabel: 'Get a free Google Gemini key',
    docsUrl: 'https://aistudio.google.com/app/apikey',
    badgeClass: 'bg-[#E8F1FF] text-[#0B57D0] dark:bg-[#152847] dark:text-[#7CACF8]',
  },
  openai: {
    id: 'openai',
    shortName: 'OpenAI (ChatGPT)',
    tagline: 'GPT-4.1, GPT-4o & reasoning models',
    keyPlaceholder: 'sk-proj-...',
    keyPrefixHint: 'Starts with sk-...',
    docsLabel: 'Get an OpenAI key',
    docsUrl: 'https://platform.openai.com/api-keys',
    badgeClass: 'bg-[#E6F6F1] text-[#0F766E] dark:bg-[#112C28] dark:text-[#5EEAD4]',
  },
  anthropic: {
    id: 'anthropic',
    shortName: 'Anthropic Claude',
    tagline: 'Great for clear writing, summaries & documents',
    keyPlaceholder: 'sk-ant-api03-...',
    keyPrefixHint: 'Starts with sk-ant-...',
    docsLabel: 'Get an Anthropic key',
    docsUrl: 'https://console.anthropic.com/settings/keys',
    badgeClass: 'bg-[#FDF0E7] text-[#B54708] dark:bg-[#2F1E14] dark:text-[#FDBA74]',
  },
  openrouter: {
    id: 'openrouter',
    shortName: 'OpenRouter',
    tagline: 'Use one key to access 200+ AI models',
    keyPlaceholder: 'sk-or-v1-...',
    keyPrefixHint: 'Starts with sk-or-...',
    docsLabel: 'Get an OpenRouter key',
    docsUrl: 'https://openrouter.ai/keys',
    badgeClass: 'bg-[#EEF0FF] text-[#4338CA] dark:bg-[#1E1F42] dark:text-[#A5B4FC]',
  },
  ollama: {
    id: 'ollama',
    shortName: 'Local AI (Offline)',
    tagline: 'Runs privately on your own computer via Ollama — free',
    keyPlaceholder: '',
    keyPrefixHint: 'No key needed',
    docsLabel: 'Download Ollama',
    docsUrl: 'https://ollama.com/download',
    badgeClass: 'bg-[#E6F7FD] text-[#0369A1] dark:bg-[#102A3B] dark:text-[#7DD3FC]',
  },
  demo: {
    id: 'demo',
    shortName: 'Practice Mode',
    tagline: 'Try folders, document summaries & notes offline without an API key',
    keyPlaceholder: '',
    keyPrefixHint: 'No key needed',
    docsLabel: '',
    docsUrl: '',
    badgeClass: 'bg-accent-soft text-accent',
  },
};

export const ProviderBrandIcon: React.FC<{
  providerId: ProviderId;
  className?: string;
}> = ({ providerId, className = 'h-5 w-5' }) => {
  switch (providerId) {
    case 'google':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M12 2.5C12.5 7.6 16.4 11.5 21.5 12C16.4 12.5 12.5 16.4 12 21.5C11.5 16.4 7.6 12.5 2.5 12C7.6 11.5 11.5 7.6 12 2.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'openai':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
          <polygon
            points="12,6.2 17,9.1 17,14.9 12,17.8 7,14.9 7,9.1"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'anthropic':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <path
            d="M7.5 19L12 5L16.5 19M9.2 14.5H14.8"
            stroke="currentColor"
            strokeWidth="1.9"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case 'openrouter':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <circle cx="6" cy="12" r="2.3" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="18" cy="6.5" r="2.3" stroke="currentColor" strokeWidth="1.8" />
          <circle cx="18" cy="17.5" r="2.3" stroke="currentColor" strokeWidth="1.8" />
          <path
            d="M8.2 11L15.8 7.4M8.2 13L15.8 16.6"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
      );
    case 'ollama':
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect
            x="6"
            y="6"
            width="12"
            height="12"
            rx="3"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <rect x="9.5" y="9.5" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M9 3.5V6M15 3.5V6M9 18V20.5M15 18V20.5M3.5 9H6M3.5 15H6M18 9H20.5M18 15H20.5"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
          <rect
            x="4"
            y="4"
            width="7"
            height="7"
            rx="1.8"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <rect
            x="13"
            y="4"
            width="7"
            height="7"
            rx="1.8"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <rect
            x="4"
            y="13"
            width="7"
            height="7"
            rx="1.8"
            stroke="currentColor"
            strokeWidth="1.8"
          />
          <rect
            x="13"
            y="13"
            width="7"
            height="7"
            rx="1.8"
            stroke="currentColor"
            strokeWidth="1.8"
          />
        </svg>
      );
  }
};
