import {
  WebSocketMessage,
  createWebSocketMessage,
} from '@primo-poker/shared';
import { MultiplexedWebSocketManager, MultiplexedConnection } from './websocket-multiplexed';
// For Cloudflare Workers, we'll use CompressionStream/DecompressionStream
// instead of Node.js zlib

// Helper functions for compression
async function gzip(data: string, options?: { level?: number }): Promise<Uint8Array> {
  const encoder = new TextEncoder();
  const stream = new CompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(encoder.encode(data));
  writer.close();
  
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new DecompressionStream('gzip');
  const writer = stream.writable.getWriter();
  writer.write(data);
  writer.close();
  
  const chunks: Uint8Array[] = [];
  const reader = stream.readable.getReader();
  
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  
  const totalLength = chunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  
  return result;
}

export interface CompressionConfig {
  compressionLevel?: number; // 1-9, where 9 is max compression
  compressionThreshold?: number; // Minimum message size to compress (bytes)
  enableBatchCompression?: boolean;
  batchWindow?: number; // ms
}

interface CompressionStats {
  totalMessages: number;
  compressedMessages: number;
  totalBytesIn: number;
  totalBytesOut: number;
  compressionRatio: number;
  messageTypeStats: Map<string, MessageTypeStats>;
}

interface MessageTypeStats {
  count: number;
  totalSize: number;
  compressedSize: number;
  averageCompressionRatio: number;
}

export interface CompressedConnection extends MultiplexedConnection {
  compressionEnabled: boolean;
  compressionType: 'permessage-deflate' | 'manual-gzip' | 'none';
  compressionStats: {
    messagesSent: number;
    messagesCompressed: number;
    byteSaved: number;
  };
}

export class CompressedWebSocketManager extends MultiplexedWebSocketManager {
  private compressedConnections = new Map<string, CompressedConnection>();
  private compressionConfig: Required<CompressionConfig>;
  private globalStats: CompressionStats;
  private messageHandlers: ((ws: WebSocket, message: WebSocketMessage) => void)[] = [];
  private errorHandlers: ((ws: WebSocket, error: Error) => void)[] = [];

  constructor(jwtSecret: string, config: CompressionConfig = {}) {
    super(jwtSecret);
    
    this.compressionConfig = {
      compressionLevel: config.compressionLevel ?? 6,
      compressionThreshold: config.compressionThreshold ?? 1024, // 1KB default
      enableBatchCompression: config.enableBatchCompression ?? false,
      batchWindow: config.batchWindow ?? 100,
    };

    this.globalStats = {
      totalMessages: 0,
      compressedMessages: 0,
      totalBytesIn: 0,
      totalBytesOut: 0,
      compressionRatio: 1,
      messageTypeStats: new Map(),
    };
  }

  async handleConnection(ws: WebSocket, request: Request): Promise<void> {
    await super.handleConnection(ws, request);

    // Get the connection created by parent
    const baseConnection = super.getConnectionInfo(ws);
    if (!baseConnection) return;

    const url = new URL(request.url);
    const compressionDisabled = url.searchParams.get('compression') === 'off';

    // Determine compression support
    let compressionType: 'permessage-deflate' | 'manual-gzip' | 'none' = 'none';
    
    if (!compressionDisabled) {
      if (this.hasNativeCompression(ws)) {
        compressionType = 'permessage-deflate';
      } else {
        compressionType = 'manual-gzip';
      }
    }

    // Create compressed connection
    const connectionId = this.findConnectionId(ws);
    if (!connectionId) return;

    const compressedConnection: CompressedConnection = {
      ...baseConnection,
      compressionEnabled: compressionType !== 'none',
      compressionType,
      compressionStats: {
        messagesSent: 0,
        messagesCompressed: 0,
        byteSaved: 0,
      },
    };

    this.compressedConnections.set(connectionId, compressedConnection);

    // Override message handler for decompression
    ws.addEventListener('message', (event) => {
      this.handleCompressedMessage(connectionId, event.data);
    });
  }

  private hasNativeCompression(ws: WebSocket): boolean {
    // Check if WebSocket supports permessage-deflate extension
    return (ws as any).extensions?.includes('permessage-deflate') ?? false;
  }

  private async handleCompressedMessage(connectionId: string, data: string | ArrayBuffer): Promise<void> {
    const connection = this.compressedConnections.get(connectionId);
    if (!connection) return;

    try {
      let messageData: string;

      if (typeof data !== 'string') {
        // Binary data - check if compressed
        const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data as ArrayBuffer);
        
        if (buffer.length > 0 && buffer[0] === 0x01) {
          // Compressed message with our header
          const compressed = buffer.slice(1);
          const decompressed = await gunzip(compressed);
          messageData = new TextDecoder().decode(decompressed);
          this.globalStats.totalBytesIn += buffer.length;
        } else {
          // Not compressed
          messageData = new TextDecoder().decode(buffer);
          this.globalStats.totalBytesIn += buffer.length;
        }
      } else {
        // String data - not compressed
        messageData = data;
        this.globalStats.totalBytesIn += new TextEncoder().encode(data).length;
      }

      // Parse and handle message
      const message = JSON.parse(messageData);
      this.globalStats.totalMessages++;

      // Notify handlers
      this.messageHandlers.forEach(handler => handler(connection.ws, message));

      // Process message internally
      // Note: In a real implementation, this would delegate to parent's message handling
    } catch (error) {
      console.error('Failed to handle compressed message:', error);
      const err = new Error(`Failed to handle decompression: ${error instanceof Error ? error.message : 'Unknown error'}`);
      this.errorHandlers.forEach(handler => handler(connection.ws, err));
      this.sendError(connectionId, 'Failed to process message');
    }
  }

  protected sendToConnection(
    connectionId: string,
    message: WebSocketMessage
  ): void {
    const connection = this.compressedConnections.get(connectionId);
    if (!connection) return;
    this.sendWebSocketMessage(connection.ws, message);
  }

  public sendWebSocketMessage(
    ws: WebSocket,
    message: WebSocketMessage,
    options: { compress?: boolean } = {}
  ): void {
    const connectionId = this.findConnectionId(ws);
    if (!connectionId) return;

    const connection = this.compressedConnections.get(connectionId);
    if (!connection || connection.ws.readyState !== 1) return; // 1 = OPEN

    const messageStr = JSON.stringify(message);
    const messageBytes = new TextEncoder().encode(messageStr).length;

    // Update stats
    connection.compressionStats.messagesSent++;
    this.updateMessageTypeStats(message.type, messageBytes);

    // Determine if we should compress
    const shouldCompress = options.compress !== false &&
      connection.compressionEnabled &&
      connection.compressionType === 'manual-gzip' &&
      messageBytes > this.compressionConfig.compressionThreshold &&
      !this.isRealtimeCritical(message);

    if (shouldCompress) {
      this.sendCompressedMessage(connection, messageStr, messageBytes);
    } else {
      // Send uncompressed
      try {
        connection.ws.send(messageStr);
        this.globalStats.totalBytesOut += messageBytes;
      } catch (error) {
        console.error('Failed to send message:', error);
      }
    }
  }

  private async sendCompressedMessage(
    connection: CompressedConnection,
    messageStr: string,
    originalSize: number
  ): Promise<void> {
    try {
      const compressed = await gzip(messageStr, {
        level: this.compressionConfig.compressionLevel,
      });

      // Add compression header
      const header = new Uint8Array([0x01]); // Compression flag
      const compressedWithHeader = new Uint8Array(header.length + compressed.length);
      compressedWithHeader.set(header, 0);
      compressedWithHeader.set(compressed, header.length);

      connection.ws.send(compressedWithHeader);

      // Update stats
      const compressedSize = compressedWithHeader.length;
      connection.compressionStats.messagesCompressed++;
      connection.compressionStats.byteSaved += originalSize - compressedSize;
      this.globalStats.compressedMessages++;
      this.globalStats.totalBytesOut += compressedSize;

      // Update compression ratio
      this.globalStats.compressionRatio = 
        this.globalStats.totalBytesIn / this.globalStats.totalBytesOut;
    } catch (error) {
      console.error('Compression failed, sending uncompressed:', error);
      connection.ws.send(messageStr);
      this.globalStats.totalBytesOut += originalSize;
    }
  }

  protected isRealtimeCritical(message: WebSocketMessage): boolean {
    // Don't compress time-critical messages
    return ['player_action', 'ping', 'pong'].includes(message.type);
  }

  private updateMessageTypeStats(type: string, size: number): void {
    const stats = this.globalStats.messageTypeStats.get(type) || {
      count: 0,
      totalSize: 0,
      compressedSize: 0,
      averageCompressionRatio: 1,
    };

    stats.count++;
    stats.totalSize += size;
    this.globalStats.messageTypeStats.set(type, stats);
  }

  protected findConnectionId(ws: WebSocket): string | undefined {
    for (const [id, connection] of this.compressedConnections) {
      if (connection.ws === ws) {
        return id;
      }
    }
    return undefined;
  }

  // Public API
  public getConnectionInfo(ws: WebSocket): CompressedConnection | undefined {
    const connectionId = this.findConnectionId(ws);
    return connectionId ? this.compressedConnections.get(connectionId) : undefined;
  }

  public getCompressionStats(): CompressionStats & { batchedMessages: number } {
    return {
      ...this.globalStats,
      batchedMessages: 0, // Will be implemented with batching
    };
  }

  public getCompressionMetricsByType(): Record<string, MessageTypeStats> {
    const metrics: Record<string, MessageTypeStats> = {};
    for (const [type, stats] of this.globalStats.messageTypeStats) {
      metrics[type] = { ...stats };
    }
    return metrics;
  }

  public getCompressionRecommendations(): {
    suggestedThreshold: number;
    messageTypeSettings: Record<string, { shouldCompress: boolean }>;
  } {
    const recommendations: Record<string, { shouldCompress: boolean }> = {};
    let totalSavings = 0;
    let totalMessages = 0;

    for (const [type, stats] of this.globalStats.messageTypeStats) {
      const avgSize = stats.totalSize / stats.count;
      const compressionRatio = stats.compressedSize > 0 
        ? stats.totalSize / stats.compressedSize 
        : 1;
      
      // Recommend compression if average size > 500 bytes and good compression ratio
      recommendations[type] = {
        shouldCompress: avgSize > 500 && compressionRatio > 1.2,
      };

      if (avgSize > this.compressionConfig.compressionThreshold) {
        totalSavings += (stats.totalSize - stats.compressedSize);
        totalMessages += stats.count;
      }
    }

    // Suggest new threshold based on actual usage
    const avgSavingsPerMessage = totalMessages > 0 ? totalSavings / totalMessages : 0;
    const suggestedThreshold = avgSavingsPerMessage > 100 
      ? Math.max(500, this.compressionConfig.compressionThreshold - 200)
      : Math.min(2048, this.compressionConfig.compressionThreshold + 200);

    return {
      suggestedThreshold,
      messageTypeSettings: recommendations,
    };
  }

  public onMessage(handler: (ws: WebSocket, message: WebSocketMessage) => void): void {
    this.messageHandlers.push(handler);
  }

  public onError(handler: (ws: WebSocket, error: Error) => void): void {
    this.errorHandlers.push(handler);
  }

  // Protected method for child classes
  protected getAllConnections(): Map<string, CompressedConnection> {
    return this.compressedConnections;
  }
}