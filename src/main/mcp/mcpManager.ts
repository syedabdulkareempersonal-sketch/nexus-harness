import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { jsonSchema, tool, type CoreTool } from 'ai';
import type { AuraDatabase } from '../db/database';
import type { SafetyGate } from '../security/safetyGate';
import type { McpServerConfig, McpTestResult, ToolActivity } from '@shared/types';

interface ManagedConnection {
  serverId: string;
  client: Client;
  close: () => Promise<void>;
  tools: Array<{
    name: string;
    description: string;
    inputSchema: Record<string, unknown>;
  }>;
}

function toPlainEnglishMcpError(err: unknown, config: McpServerConfig): string {
  const raw = err instanceof Error ? err.message : String(err);
  if (/ENOENT/i.test(raw)) {
    return `Could not find the program "${config.command || 'command'}" on your computer. Make sure that app is installed or check its command name.`;
  }
  if (/ECONNREFUSED|fetch failed/i.test(raw)) {
    return `Could not reach "${config.url || config.name}". Make sure the connector service is running and the web address is right.`;
  }
  if (/401|403|unauthorized/i.test(raw)) {
    return `The connector "${config.name}" asked for a valid secret key. Double-check its Secret Key in Superpowers.`;
  }
  return `Could not connect to "${config.name}": ${raw.slice(0, 160)}`;
}

function sanitizeToolKey(serverName: string, toolName: string): string {
  const prefix = serverName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 20);
  const cleanTool = toolName
    .replace(/[^a-zA-Z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 38);
  return `mcp_${prefix || 'ext'}_${cleanTool || 'action'}`;
}

export class McpClientManager {
  private active = new Map<string, ManagedConnection>();

  constructor(private db: AuraDatabase) {}

  public async disconnectServer(serverId: string): Promise<void> {
    const existing = this.active.get(serverId);
    if (!existing) return;
    this.active.delete(serverId);
    try {
      await existing.close();
    } catch {
      // Ignore transport close errors during teardown
    }
  }

  public async shutdownAll(): Promise<void> {
    const ids = Array.from(this.active.keys());
    await Promise.allSettled(ids.map((id) => this.disconnectServer(id)));
  }

  public async connectServer(serverId: string): Promise<McpTestResult> {
    await this.disconnectServer(serverId);

    const { config, envVars } = this.db.getMcpServerWithSecrets(serverId);

    try {
      const client = new Client(
        { name: 'AuraDesk', version: '1.0.0' },
        { capabilities: {} }
      );

      let closeTransport: () => Promise<void>;

      if (config.transport === 'stdio') {
        if (!config.command) {
          throw new Error('Please enter the program command for this local connector.');
        }
        const safeEnv: Record<string, string> = {};
        for (const [k, v] of Object.entries(process.env)) {
          if (typeof v === 'string') safeEnv[k] = v;
        }
        Object.assign(safeEnv, envVars);

        const transport = new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: safeEnv,
        });
        await client.connect(transport);
        closeTransport = async () => {
          await client.close();
          await transport.close();
        };
      } else if (config.transport === 'sse') {
        if (!config.url) {
          throw new Error('Please provide a web URL for this connector.');
        }
        const transport = new SSEClientTransport(new URL(config.url));
        await client.connect(transport);
        closeTransport = async () => {
          await client.close();
          await transport.close();
        };
      } else {
        if (!config.url) {
          throw new Error('Please provide a web URL for this connector.');
        }
        const headers: Record<string, string> = {};
        if (envVars.AUTHORIZATION) {
          headers.Authorization = envVars.AUTHORIZATION;
        } else if (envVars.API_KEY) {
          headers.Authorization = `Bearer ${envVars.API_KEY}`;
        }
        const transport = new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: Object.keys(headers).length > 0 ? { headers } : undefined,
        });
        await client.connect(transport);
        closeTransport = async () => {
          await client.close();
          await transport.close();
        };
      }

      const listed = await client.listTools();
      const tools = (listed.tools ?? []).map((t) => ({
        name: t.name,
        description: t.description || `Action "${t.name}" from ${config.name}`,
        inputSchema:
          t.inputSchema && typeof t.inputSchema === 'object'
            ? (t.inputSchema as Record<string, unknown>)
            : { type: 'object', properties: {} },
      }));

      this.active.set(serverId, {
        serverId,
        client,
        close: closeTransport,
        tools,
      });

      const toolNames = tools.map((t) => t.name);
      this.db.updateMcpServerStatus(serverId, {
        lastStatus: 'connected',
        lastError: null,
        discoveredTools: toolNames,
      });

      return {
        ok: true,
        status: 'connected',
        message:
          toolNames.length > 0
            ? `Connected — ${toolNames.length} action${toolNames.length === 1 ? '' : 's'} ready.`
            : 'Connected cleanly.',
        tools: toolNames,
      };
    } catch (err) {
      const friendly = toPlainEnglishMcpError(err, config);
      this.db.updateMcpServerStatus(serverId, {
        lastStatus: 'error',
        lastError: friendly,
      });
      return {
        ok: false,
        status: 'error',
        message: friendly,
        tools: [],
      };
    }
  }

  public async getAiToolsForEnabledServers(params: {
    conversationId: string;
    safetyGate: SafetyGate;
    emitActivity: (activity: ToolActivity) => void;
  }): Promise<Record<string, CoreTool>> {
    const servers = this.db.listMcpServers().filter((s) => s.enabled);
    const out: Record<string, CoreTool> = {};

    for (const server of servers) {
      if (!this.active.has(server.id)) {
        await this.connectServer(server.id);
      }

      const conn = this.active.get(server.id);
      if (!conn) continue;

      for (const mcpTool of conn.tools) {
        const key = sanitizeToolKey(server.name, mcpTool.name);
        const schemaObj = {
          type: 'object' as const,
          properties: (mcpTool.inputSchema.properties as Record<string, unknown>) ?? {},
          required: (mcpTool.inputSchema.required as string[]) ?? undefined,
        };

        out[key] = tool({
          description: `[${server.name}] ${mcpTool.description}`,
          parameters: jsonSchema<Record<string, unknown>>(schemaObj),
          execute: async (args) => {
            const activityId = `act-${Date.now()}-${key}`;
            params.emitActivity({
              id: activityId,
              toolName: key,
              friendlyLabel: `Asking before running "${mcpTool.name}" in ${server.name}...`,
              status: 'running',
            });

            const decision = await params.safetyGate.requestApproval({
              conversationId: params.conversationId,
              headline: `Allow "${server.name}" to run "${mcpTool.name}"?`,
              whatWillHappen: `AuraDesk wants to use your "${server.name}" connector to perform "${mcpTool.name}".`,
              whyExplanation: mcpTool.description,
              canTrustFolder: false,
              previewText: JSON.stringify(args, null, 2).slice(0, 900),
              riskLevel: 'gentle',
            });

            if (decision === 'block') {
              params.emitActivity({
                id: activityId,
                toolName: key,
                friendlyLabel: `Blocked "${mcpTool.name}" in ${server.name}`,
                status: 'blocked',
              });
              return { status: 'declined_by_user' };
            }

            params.emitActivity({
              id: activityId,
              toolName: key,
              friendlyLabel: `Using ${server.name}: ${mcpTool.name}...`,
              status: 'running',
            });

            try {
              const result = await conn.client.callTool({
                name: mcpTool.name,
                arguments: args,
              });
              params.emitActivity({
                id: activityId,
                toolName: key,
                friendlyLabel: `Finished "${mcpTool.name}" via ${server.name}`,
                status: 'completed',
              });
              return result;
            } catch (err) {
              const message = err instanceof Error ? err.message : 'Connector action failed.';
              params.emitActivity({
                id: activityId,
                toolName: key,
                friendlyLabel: `${server.name} reported an issue`,
                status: 'error',
              });
              return { error: message };
            }
          },
        });
      }
    }

    return out;
  }
}
