import { generateText, type LanguageModelV1 } from 'ai';
import type { MemoryCategory, MemoryItem, SaveMemoryInput } from '@shared/types';

interface CandidateFact {
  content: string;
  category: MemoryCategory;
  pinned?: boolean;
}

const DETERMINISTIC_PATTERNS: Array<{
  regex: RegExp;
  category: MemoryCategory;
  format: (match: RegExpMatchArray) => string;
  pinned?: boolean;
}> = [
  {
    regex: /\b(?:[Mm]y name is|[Cc]all me|[Ii] am|[Ii]'m)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,2})\b/,
    category: 'About You',
    format: (m) => `Name is ${m[1].trim()}`,
    pinned: true,
  },
  {
    regex: /\bi\s+(?:work as|am a|work in)\s+([^.!?\n]{4,80})/i,
    category: 'About You',
    format: (m) => `Works as ${m[1].trim()}`,
  },
  {
    regex: /\bi\s+(?:prefer|always like|usually want|love when you)\s+([^.!?\n]{5,110})/i,
    category: 'Preferences',
    format: (m) => `Prefers ${m[1].trim()}`,
  },
  {
    regex: /\b(?:please\s+)?remember(?:\s+that)?\s+([^.!?\n]{5,130})/i,
    category: 'Important',
    format: (m) => m[1].trim().charAt(0).toUpperCase() + m[1].trim().slice(1),
    pinned: true,
  },
  {
    regex: /\b(?:i'm working on|my current project is|we are building)\s+([^.!?\n]{5,110})/i,
    category: 'Projects',
    format: (m) => `Working on ${m[1].trim()}`,
  },
];

function isDuplicateMemory(candidate: string, existing: MemoryItem[]): boolean {
  const norm = candidate.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  if (norm.length < 6) return true;
  return existing.some((item) => {
    const existingNorm = item.content.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    return existingNorm === norm || existingNorm.includes(norm) || norm.includes(existingNorm);
  });
}

export function extractDeterministicMemories(userText: string): CandidateFact[] {
  const found: CandidateFact[] = [];
  for (const rule of DETERMINISTIC_PATTERNS) {
    const match = userText.match(rule.regex);
    if (match && match[1]) {
      // Avoid matching generic phrases like "I am looking for"
      const captured = match[1].trim();
      if (/^(looking|trying|going|asking|wondering|having|using|here)\b/i.test(captured)) {
        continue;
      }
      found.push({
        content: rule.format(match),
        category: rule.category,
        pinned: rule.pinned,
      });
    }
  }
  return found;
}

export async function curateMemoriesFromTurn(params: {
  conversationId: string;
  userText: string;
  assistantText: string;
  existingMemories: MemoryItem[];
  saveMemory: (input: SaveMemoryInput) => MemoryItem;
  model?: LanguageModelV1 | null;
}): Promise<MemoryItem[]> {
  const created: MemoryItem[] = [];
  const currentMemories = [...params.existingMemories];

  // 1. Instant deterministic pass (works offline, local, and demo)
  const quickFacts = extractDeterministicMemories(params.userText);
  for (const fact of quickFacts) {
    if (!isDuplicateMemory(fact.content, currentMemories)) {
      const saved = params.saveMemory({
        content: fact.content,
        category: fact.category,
        pinned: fact.pinned,
        sourceConversationId: params.conversationId,
      });
      created.push(saved);
      currentMemories.push(saved);
    }
  }

  // 2. Optional AI refinement pass when a live LLM is connected and the message is substantial
  if (params.model && created.length === 0 && params.userText.length > 35) {
    try {
      const { text } = await generateText({
        model: params.model,
        maxTokens: 180,
        temperature: 0.1,
        system:
          'You extract at most ONE durable personal fact, preference, or ongoing project explicitly shared by the user so an assistant can remember it across future sessions. If the user did not share any durable personal preference, identity, or ongoing project, reply with NONE. Otherwise reply with JSON only: {"content":"short plain-English note","category":"About You"|"Preferences"|"Projects"|"Important"}',
        prompt: `User message: ${params.userText.slice(0, 800)}`,
      });

      const trimmed = text.trim();
      if (trimmed && !trimmed.startsWith('NONE')) {
        const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as {
            content?: string;
            category?: MemoryCategory;
          };
          if (parsed.content && !isDuplicateMemory(parsed.content, currentMemories)) {
            const validCategories: MemoryCategory[] = [
              'About You',
              'Preferences',
              'Projects',
              'Important',
            ];
            const category = validCategories.includes(parsed.category as MemoryCategory)
              ? (parsed.category as MemoryCategory)
              : 'Preferences';
            const saved = params.saveMemory({
              content: parsed.content.trim(),
              category,
              sourceConversationId: params.conversationId,
            });
            created.push(saved);
          }
        }
      }
    } catch {
      // Non-critical background curator — never interrupt user workflow
    }
  }

  return created;
}
