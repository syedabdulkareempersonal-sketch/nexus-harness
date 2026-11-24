import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AuraDatabase } from '../src/main/db/database';
import { extractDeterministicMemories } from '../src/main/ai/memoryCurator';
import { assertAllowedPath } from '../src/main/security/pathGuard';
import { SafetyGate } from '../src/main/security/safetyGate';
import { decryptSecret, encryptSecret, maskSecretHint } from '../src/main/security/vault';
import { parseDocumentBuffer } from '../src/main/tools/documentTools';
import { extractCleanReadableText } from '../src/main/tools/webTools';

const tempDirs: string[] = [];

function createTempDir(): string {
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
      // ignore cleanup race on Windows
    }
  }
});

describe('AuraDesk Core Architecture & Safety Suite', () => {
  it('encrypts and decrypts secrets cleanly without exposing plaintext', () => {
    const rawKey = 'sk-proj-1234567890abcdefXYZ';
    const cipher = encryptSecret(rawKey);
    expect(cipher).not.toContain(rawKey);
    expect(decryptSecret(cipher)).toBe(rawKey);
    expect(maskSecretHint(rawKey)).toBe('sk-p••••fXYZ');
  });

  it('persists providers, memories, workflows, MCP secrets, and artifacts in SQLite', () => {
    const dir = createTempDir();
    const db = new AuraDatabase(path.join(dir, 'auradesk.sqlite'));

    try {
      // Seeded workflows & providers
      const workflows = db.listWorkflows();
      expect(workflows.length).toBeGreaterThanOrEqual(4);
      const providers = db.listProviders();
      expect(providers.length).toBe(6);
      expect(providers[0].id).toBe('google');

      // Provider key encryption
      const savedProvider = db.saveProviderCredentials({
        providerId: 'google',
        apiKey: 'AIzaSyTestSecretKey9876',
        selectedModel: 'gemini-2.5-pro',
        isVerified: true,
      });
      expect(savedProvider.hasKey).toBe(true);
      expect(savedProvider.keyHint).toBe('AIza••••9876');
      expect(db.getProviderSecret('google').apiKey).toBe('AIzaSyTestSecretKey9876');

      // Memory Board CRUD & Pinning
      const m1 = db.saveMemory({ content: 'Prefers bullet summaries', category: 'Preferences' });
      const m2 = db.saveMemory({
        content: 'Name is Maya Lin',
        category: 'About You',
        pinned: true,
      });
      const listedMemories = db.listMemories();
      expect(listedMemories[0].id).toBe(m2.id);
      expect(listedMemories.length).toBe(2);
      db.deleteMemory(m1.id);
      expect(db.listMemories().length).toBe(1);

      // Visual MCP Server encrypted env storage
      const mcp = db.saveMcpServer({
        name: 'Company Wiki',
        description: 'Internal search',
        transport: 'streamable-http',
        url: 'https://wiki.example.com/mcp',
        envVars: { API_KEY: 'top-secret-token' },
      });
      expect(mcp.envKeys).toEqual(['API_KEY']);
      expect(db.getMcpServerWithSecrets(mcp.id).envVars.API_KEY).toBe('top-secret-token');

      // Canvas Artifact storage
      const conv = db.createConversation('Q4 Planning');
      const art = db.saveArtifact({
        conversationId: conv.id,
        title: 'Q4 Summary',
        kind: 'markdown',
        content: '# Q4 Summary\nAll goals met.',
      });
      expect(db.listArtifacts()[0].title).toBe(art.title);
    } finally {
      db.close();
    }
  });

  it('enforces strict folder sandbox boundaries and blocks path traversal', () => {
    const dir = createTempDir();
    const safeSub = path.join(dir, 'Downloads');
    const secretOutside = path.join(dir, 'PrivateKeys');
    fs.mkdirSync(safeSub, { recursive: true });
    fs.mkdirSync(secretOutside, { recursive: true });

    const allowed = [
      {
        id: 'f1',
        folderPath: safeSub,
        label: 'Downloads',
        trustMode: 'ask' as const,
        createdAt: new Date().toISOString(),
      },
    ];

    const valid = assertAllowedPath(path.join(safeSub, 'report.pdf'), allowed);
    expect(valid.matchedFolder.id).toBe('f1');

    expect(() =>
      assertAllowedPath(path.join(safeSub, '..', 'PrivateKeys', 'id_rsa'), allowed)
    ).toThrow(/only access folders you have explicitly shared/i);
  });

  it('pauses and resolves human-in-the-loop SafetyGate decisions', async () => {
    const gate = new SafetyGate();
    let capturedId = '';
    gate.onRequest((req) => {
      capturedId = req.requestId;
    });

    const decisionPromise = gate.requestApproval({
      conversationId: 'conv-1',
      headline: 'Create folder?',
      whatWillHappen: 'Creates Invoices folder',
      whyExplanation: 'Groups PDFs neatly',
      canTrustFolder: true,
      riskLevel: 'gentle',
    });

    expect(capturedId).toBeTruthy();
    gate.resolveRequest(capturedId, 'trust_folder');
    await expect(decisionPromise).resolves.toBe('trust_folder');
  });

  it('parses CSV spreadsheets and clean readable web HTML without external runtimes', async () => {
    const csvBuf = Buffer.from('Item,Amount\n Hosting,120\n Domain,30\n Design,250\n', 'utf8');
    const parsedCsv = await parseDocumentBuffer({
      name: 'expenses.csv',
      mimeType: 'text/csv',
      buffer: csvBuf,
    });
    expect(parsedCsv.summaryPreview).toContain('3 rows');
    expect(parsedCsv.extractedText).toContain('sum=400.00');

    const html = `<html><head><title>Solar Breakthrough</title><script>evil()</script></head><body><nav>Menu</nav><h1>Clean Energy Rises</h1><p>Costs dropped by 24% this year.</p></body></html>`;
    const readable = extractCleanReadableText(html);
    expect(readable.title).toBe('Solar Breakthrough');
    expect(readable.markdown).toContain('# Clean Energy Rises');
    expect(readable.markdown).not.toContain('evil()');
  });

  it('extracts deterministic personal memories accurately', () => {
    const facts = extractDeterministicMemories(
      'Hi! My name is Elena Vance and I prefer concise executive bullet points. Please remember that our fiscal year ends in March.'
    );
    expect(facts.length).toBe(3);
    expect(facts.map((f) => f.content).join(' | ')).toContain('Elena Vance');
  });
});
