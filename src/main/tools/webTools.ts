import { tool, type CoreTool } from 'ai';
import { z } from 'zod';
import type { ToolActivity } from '@shared/types';

export interface WebToolContext {
  emitActivity: (activity: ToolActivity) => void;
}

function isSafePublicUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)));
}

export function extractCleanReadableText(html: string): { title: string; markdown: string } {
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  const title = titleMatch ? decodeHtmlEntities(titleMatch[1].replace(/\s+/g, ' ').trim()) : 'Web Page';

  let cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ');

  cleaned = cleaned
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n\n# $1\n\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n\n## $1\n\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n\n### $1\n\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<(p|div|section|article|br|tr)[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');

  const text = decodeHtmlEntities(cleaned)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter((line) => line.length > 0)
    .join('\n\n');

  return {
    title,
    markdown: text.slice(0, 18000),
  };
}

async function searchDuckDuckGoHtml(
  query: string
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const endpoint = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await fetch(endpoint, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      Accept: 'text/html',
    },
    signal: AbortSignal.timeout(9000),
  });

  if (!res.ok) return [];
  const html = await res.text();

  const results: Array<{ title: string; url: string; snippet: string }> = [];
  const blockRegex =
    /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/a>|<div[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([\s\S]*?)<\/div>)?/gi;

  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(html)) !== null && results.length < 8) {
    let rawHref = decodeHtmlEntities(match[1]);
    const uddgMatch = rawHref.match(/[?&]uddg=([^&]+)/);
    if (uddgMatch) {
      rawHref = decodeURIComponent(uddgMatch[1]);
    }
    const cleanTitle = decodeHtmlEntities(match[2].replace(/<[^>]+>/g, '').trim());
    const rawSnippet = match[3] || match[4] || '';
    const cleanSnippet = decodeHtmlEntities(rawSnippet.replace(/<[^>]+>/g, '').trim());
    if (cleanTitle && rawHref.startsWith('http')) {
      results.push({ title: cleanTitle, url: rawHref, snippet: cleanSnippet });
    }
  }
  return results;
}

async function searchWikipediaFallback(
  query: string
): Promise<Array<{ title: string; url: string; snippet: string }>> {
  const endpoint = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(
    query
  )}&utf8=&format=json&srlimit=5`;
  const res = await fetch(endpoint, {
    headers: { 'User-Agent': 'AuraDesk/1.0 (Open-Source Desktop Workspace)' },
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    query?: { search?: Array<{ title: string; snippet: string }> };
  };
  return (data.query?.search ?? []).map((item) => ({
    title: item.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title.replace(/ /g, '_'))}`,
    snippet: decodeHtmlEntities(item.snippet.replace(/<[^>]+>/g, '')),
  }));
}

export function buildWebTools(ctx: WebToolContext): Record<string, CoreTool> {
  return {
    web_search: tool({
      description:
        'Searches the live internet for up-to-date facts, articles, products, news, and reference pages.',
      parameters: z.object({
        query: z.string().describe('Clear search query'),
      }),
      execute: async ({ query }) => {
        const activityId = `act-${Date.now()}-websearch`;
        ctx.emitActivity({
          id: activityId,
          toolName: 'web_search',
          friendlyLabel: `Searching the web for "${query}"...`,
          status: 'running',
        });

        try {
          let results = await searchDuckDuckGoHtml(query).catch(() => []);
          if (results.length === 0) {
            results = await searchWikipediaFallback(query).catch(() => []);
          }

          ctx.emitActivity({
            id: activityId,
            toolName: 'web_search',
            friendlyLabel: `Found ${results.length} live web sources for "${query}"`,
            status: 'completed',
          });

          return {
            query,
            results,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Web search timed out.';
          ctx.emitActivity({
            id: activityId,
            toolName: 'web_search',
            friendlyLabel: 'Could not reach live search right now',
            status: 'error',
          });
          return { error: message, results: [] };
        }
      },
    }),

    read_webpage: tool({
      description:
        'Opens a public web URL and extracts clean, ad-free readable article text and headings.',
      parameters: z.object({
        url: z.string().url().describe('Public http or https webpage URL to read'),
      }),
      execute: async ({ url }) => {
        const activityId = `act-${Date.now()}-readpage`;
        let hostname = url;
        try {
          hostname = new URL(url).hostname.replace(/^www\./, '');
        } catch {
          // keep raw
        }

        ctx.emitActivity({
          id: activityId,
          toolName: 'read_webpage',
          friendlyLabel: `Reading clean article from ${hostname}...`,
          status: 'running',
        });

        if (!isSafePublicUrl(url)) {
          ctx.emitActivity({
            id: activityId,
            toolName: 'read_webpage',
            friendlyLabel: `Blocked private or invalid address (${hostname})`,
            status: 'blocked',
          });
          return { error: 'Only public web addresses (http/https) can be opened by the page reader.' };
        }

        try {
          const response = await fetch(url, {
            headers: {
              'User-Agent':
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
              Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8',
            },
            signal: AbortSignal.timeout(10000),
          });

          if (!response.ok) {
            throw new Error(`Website returned status ${response.status}`);
          }

          const rawText = await response.text();
          const contentType = response.headers.get('content-type') || '';

          const extracted = contentType.includes('html')
            ? extractCleanReadableText(rawText)
            : { title: hostname, markdown: rawText.slice(0, 18000) };

          ctx.emitActivity({
            id: activityId,
            toolName: 'read_webpage',
            friendlyLabel: `Read "${extracted.title.slice(0, 48)}"`,
            status: 'completed',
          });

          return {
            url,
            title: extracted.title,
            content: extracted.markdown,
          };
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unable to load webpage.';
          ctx.emitActivity({
            id: activityId,
            toolName: 'read_webpage',
            friendlyLabel: `Could not read ${hostname}`,
            status: 'error',
          });
          return { error: message };
        }
      },
    }),
  };
}
