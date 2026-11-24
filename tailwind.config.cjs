/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: 'class',
  content: ['./src/renderer/**/*.{html,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        canvas: 'var(--bg-canvas)',
        surface: 'var(--bg-surface)',
        subtle: 'var(--bg-subtle)',
        elevated: 'var(--bg-elevated)',
        ink: {
          DEFAULT: 'var(--fg-primary)',
          secondary: 'var(--fg-secondary)',
          muted: 'var(--fg-muted)',
        },
        accent: {
          DEFAULT: 'var(--accent-primary)',
          hover: 'var(--accent-hover)',
          soft: 'var(--accent-soft)',
          ink: 'var(--accent-ink)',
        },
        trust: {
          DEFAULT: 'var(--trust-safe)',
          soft: 'var(--trust-soft)',
        },
        warn: {
          DEFAULT: 'var(--warn-amber)',
          soft: 'var(--warn-soft)',
        },
        danger: {
          DEFAULT: 'var(--danger-red)',
          soft: 'var(--danger-soft)',
        },
        hairline: 'var(--border-hairline)',
        strongline: 'var(--border-strong)',
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          '"Segoe UI Variable Text"',
          '"Segoe UI"',
          'system-ui',
          'sans-serif',
        ],
        mono: [
          '"JetBrains Mono"',
          '"Cascadia Mono"',
          'ui-monospace',
          'SFMono-Regular',
          'Consolas',
          'monospace',
        ],
      },
      boxShadow: {
        card: '0 2px 8px -2px rgba(20, 18, 15, 0.06), 0 1px 2px 0 rgba(20, 18, 15, 0.04)',
        float: '0 14px 34px -8px rgba(20, 18, 15, 0.14), 0 4px 10px -2px rgba(20, 18, 15, 0.06)',
        modal: '0 24px 56px -12px rgba(12, 11, 10, 0.28), 0 6px 16px -4px rgba(12, 11, 10, 0.12)',
      },
    },
  },
  plugins: [],
};
