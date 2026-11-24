import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AuraDatabase } from '../src/main/db/database';
import { AiRouter } from '../src/main/ai/router';
import { extractDeterministicMemories } from '../src/main/ai/memoryCurator';
import { McpClientManager } from '../src/main/mcp/mcpManager';
import { assertAllowedPath } from '../src/main/security/pathGuard';
import { SafetyGate } from '../src/main/security/safetyGate';
import { decryptSecret, encryptSecret, maskSecretHint } from '../src/main/security/vault';
import { parseDocumentBuffer } from '../src/main/tools/documentTools';
import { extractCleanReadableText } from '../src/main/tools/webTools';
import type { StreamEvent } from '../src/shared/types';

const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'auradesk-test-'));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop()!;
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore Windows WAL lock timing in temp cleanup
    }
  }
});

describe('AuraDesk Core Backend & Security Suite', () => {
  it('encrypts, decrypts, and masks API secrets cleanly', () => {
    const rawKey = 'sk-proj-1234567890abcdefXYZ';
    const encrypted = encryptSecret(rawKey);
    expect(encrypted).not.toContain(rawKey);
    expect(decryptSecret(encrypted)).toBe(rawKey);
    expect(maskSecretHint(rawKey)).toBe('sk-p••••fXYZ');
  });

  it('initializes SQLite schema, seeds 4 built-in workflows, and persists memories, MCP secrets, and artifacts', () => {
    const dir = makeTempDir();
    const db = new AuraDatabase(path.join(dir, 'auradesk.sqlite'));

    const workflows = db.listWorkflows();
    expect(workflows.length).toBeGreaterThanOrEqual(4);
    expect(workflows.some((w) => w.title === 'Clean & Organize My Folder')).toBe(true);

    // Provider key storage never leaks plaintext
    const savedProvider = db.saveProviderCredentials({
      providerId: 'openai',
      apiKey: 'sk-live-secret-key-9988',
      isVerified: true,
    });
    expect(savedProvider.hasKey).toBe(true);
    expect(savedProvider.keyHint).toBe('sk-l••••9988');
    expect(db.getProviderSecret('openai').apiKey).toBe('sk-live-secret-key-9988');

    // Memory CRUD & pinning
    const m1 = db.saveMemory({ content: 'Prefers concise tables', category: 'Preferences' });
    const m2 = db.saveMemory({
      content: 'Name is Kareem',
      category: 'About You',
      pinned: true,
    });
    const list = db.listMemories();
    expect(list[0].id).toBe(m2.id);
    expect(list.length).toBe(2);
    db.deleteMemory(m1.id);
    expect(db.listMemories().length).toBe(1);

    // Visual MCP Connector secret storage
    const mcp = db.saveMcpServer({
      name: 'Notion Connector',
      description: 'Reads project pages',
      transport: 'streamable-http',
      url: 'https://example.com/mcp',
      envVars: { API_KEY: 'ntn_secret_123' },
    });
    expect(mcp.envKeys).toEqual(['API_KEY']);
    expect(db.getMcpServerWithSecrets(mcp.id).envVars.API_KEY).toBe('ntn_secret_123');

    // Canvas Artifact CRUD
    const conv = db.createConversation('Q4 Planning');
    const artifact = db.saveArtifact({
      conversationId: conv.id,
      title: 'Q4 Summary',
      kind: 'markdown',
      content: '# Q4 Summary\n\nAll on track.',
    });
    expect(db.listArtifacts()[0].title).toBe('Q4 Summary');
    expect(db.getArtifact(artifact.id)?.content).toContain('All on track');

    db.close();
  });

  it('enforces strict canonical folder sandboxing and blocks path traversal', () => {
    const root = makeTempDir();
    const sharedDir = path.join(root, 'SharedDocs');
    const secretDir = path.join(root, 'PrivateSystem');
    fs.mkdirSync(sharedDir, { recursive: true });
    fs.mkdirSync(secretDir, { recursive: true });

    const allowed = [
      {
        id: 'f1',
        folderPath: sharedDir,
        label: 'SharedDocs',
        trustMode: 'ask' as const,
        createdAt: new Date().toISOString(),
      },
    ];

    const validTarget = path.join(sharedDir, 'Invoices', 'january.pdf');
    const resolved = assertAllowedPath(validTarget, allowed);
    expect(resolved.matchedFolder.id).toBe('f1');

    const traversalAttempt = path.join(sharedDir, '..', 'PrivateSystem', 'passwords.txt');
    expect(() => assertAllowedPath(traversalAttempt, allowed)).toThrow(/privacy/i);
  });

  it('parses CSV spreadsheets with automatic column summaries and cleans HTML web pages', async () => {
    const csvContent = 'Item,Amount\nHosting,120.50\nDesign,379.50\nDomain,20.00\n';
    const parsedCsv = await parseDocumentBuffer({
      name: 'expenses.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(csvContent, 'utf8'),
    });
    expect(parsedCsv.summaryPreview).toContain('3 rows');
    expect(parsedCsv.extractedText).toContain('sum=520.00');

    const html = `<html><head><title>Clean Test</title><script>alert(1)</script></head><body><nav>Menu</nav><h1>Main Story</h1><p>Hello world &amp; friends.</p></body></html>`;
    const readable = extractCleanReadableText(html);
    expect(readable.title).toBe('Clean Test');
    expect(readable.markdown).toContain('# Main Story');
    expect(readable.markdown).toContain('Hello world & friends.');
    expect(readable.markdown).not.toContain('alert(1)');
  });

  it('extracts deterministic personal memories and streams Guided Demo turn with SafetyGate approval', async () => {
    const facts = extractDeterministicMemories(
      'My name is Sarah Chen and please remember that I prefer executive summaries under 5 bullet points.'
    );
    expect(facts.length).toBeGreaterThanOrEqual(2);

    const dir = makeTempDir();
    const sharedFolder = path.join(dir, 'MyDownloads');
    fs.mkdirSync(sharedFolder, { recursive: true });
    fs.writeFileSync(path.join(sharedFolder, 'receipt.pdf'), 'sample', 'utf8');

    const db = new AuraDatabase(path.join(dir, 'auradesk.sqlite'));
    db.updateSettings({ activeProviderId: 'demo', onboardingCompleted: true });
    db.addAllowedFolder(sharedFolder, 'ask');

    const safetyGate = new SafetyGate();
    const mcpManager = new McpClientManager(db);
    const router = new AiRouter(db, mcpManager, safetyGate, async () => {});

    // Automatically approve the Plain-English Safety Request when triggered
    safetyGate.onRequest((req) => {
      expect(req.headline).toContain('AuraDesk-Organization-Summary.md');
      setTimeout(() => {
        safetyGate.resolveRequest(req.requestId, 'allow_once');
      }, 20);
    });

    const events: StreamEvent[] = [];
    await router.streamChatTurn({
      content: 'My name is Maya. Please inspect and organize my folder.',
      emit: (evt) => events.push(evt),
    });

    expect(events.some((e) => e.type === 'artifact-upsert')).toBe(true);
    expect(events.some((e) => e.type === 'done')).toBe(true);
    expect(fs.existsSync(path.join(sharedFolder, 'AuraDesk-Organization-Summary.md'))).toBe(true);

    // Wait briefly for async memory curation
    await new Promise((r) => setTimeout(r, 80));
    expect(db.listMemories().some((m) => m.content.includes('Maya'))).toBe(true);

    db.close();
  });
});
