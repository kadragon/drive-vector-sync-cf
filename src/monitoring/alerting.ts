/**
 * Alerting module for error notifications and sync reports
 *
 * Trace:
 *   task_id: TASK-018
 */

import { SyncMetrics, PerformanceMetrics } from './metrics.js';

export interface AlertConfig {
  webhookUrl?: string;
  webhookType?: 'slack' | 'discord';
  errorThreshold?: number;
  performanceThreshold?: number;
}

/**
 * Alerting service for sending notifications
 */
export class AlertingService {
  constructor(private config: AlertConfig) {}

  /**
   * Send sync completion alert
   */
  async sendSyncCompleted(metrics: SyncMetrics, perfMetrics: PerformanceMetrics): Promise<void> {
    if (!this.config.webhookUrl) {
      return;
    }

    const message = this.formatSyncCompletedMessage(metrics, perfMetrics);
    await this.sendWebhook(message);
  }

  /**
   * Send error alert
   */
  async sendErrorAlert(error: Error, context?: Record<string, any>): Promise<void> {
    if (!this.config.webhookUrl) {
      return;
    }

    const message = this.formatErrorMessage(error, context);
    await this.sendWebhook(message);
  }

  /**
   * Send sync failure alert with detailed metrics
   */
  async sendSyncFailed(metrics: SyncMetrics, error: Error): Promise<void> {
    if (!this.config.webhookUrl) {
      return;
    }

    const message = this.formatSyncFailedMessage(metrics, error);
    await this.sendWebhook(message);
  }

  /**
   * Send performance degradation alert
   */
  async sendPerformanceAlert(metrics: SyncMetrics, perfMetrics: PerformanceMetrics): Promise<void> {
    if (!this.config.webhookUrl) {
      return;
    }

    // Check if performance is below threshold
    const threshold = this.config.performanceThreshold || 0.5; // files per second
    if (perfMetrics.filesPerSecond < threshold && metrics.filesProcessed > 10) {
      const message = this.formatPerformanceMessage(perfMetrics);
      await this.sendWebhook(message);
    }
  }

  /**
   * Format sync completed message
   */
  private formatSyncCompletedMessage(
    metrics: SyncMetrics,
    perfMetrics: PerformanceMetrics
  ): WebhookMessage {
    const status = metrics.success ? '✅' : '❌';
    const duration = ((metrics.duration || 0) / 1000).toFixed(2);

    if (this.config.webhookType === 'discord') {
      return {
        content: `${status} Sync Completed`,
        embeds: [
          {
            title: 'Drive Vector Sync Report',
            color: metrics.success ? 0x00ff00 : 0xff0000,
            fields: [
              {
                name: 'Status',
                value: metrics.success ? 'Success' : 'Failed',
                inline: true,
              },
              {
                name: 'Duration',
                value: `${duration}s`,
                inline: true,
              },
              {
                name: 'Files Processed',
                value: `${metrics.filesProcessed} (${metrics.filesAdded}A, ${metrics.filesModified}M, ${metrics.filesDeleted}D)`,
                inline: false,
              },
              {
                name: 'Vectors',
                value: `${metrics.vectorsUpserted} upserted, ${metrics.vectorsDeleted} deleted`,
                inline: true,
              },
              {
                name: 'Chunks',
                value: `${metrics.chunksProcessed}`,
                inline: true,
              },
              {
                name: 'Performance',
                value: `${perfMetrics.filesPerSecond.toFixed(2)} files/s, ${perfMetrics.chunksPerSecond.toFixed(2)} chunks/s`,
                inline: false,
              },
              {
                name: 'API Calls',
                value: `Embedding: ${metrics.embeddingApiCalls}, Drive: ${metrics.driveApiCalls}, Qdrant: ${metrics.qdrantApiCalls}`,
                inline: false,
              },
              {
                name: 'Errors',
                value: `${metrics.errors.length}`,
                inline: true,
              },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }

    // Slack format
    return {
      text: `${status} Sync Completed`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Drive Vector Sync Report',
          },
        },
        {
          type: 'section',
          fields: [
            {
              type: 'mrkdwn',
              text: `*Status:*\n${metrics.success ? 'Success ✅' : 'Failed ❌'}`,
            },
            {
              type: 'mrkdwn',
              text: `*Duration:*\n${duration}s`,
            },
            {
              type: 'mrkdwn',
              text: `*Files:*\n${metrics.filesProcessed} (${metrics.filesAdded}A, ${metrics.filesModified}M, ${metrics.filesDeleted}D)`,
            },
            {
              type: 'mrkdwn',
              text: `*Vectors:*\n${metrics.vectorsUpserted} upserted, ${metrics.vectorsDeleted} deleted`,
            },
            {
              type: 'mrkdwn',
              text: `*Performance:*\n${perfMetrics.filesPerSecond.toFixed(2)} files/s`,
            },
            {
              type: 'mrkdwn',
              text: `*Errors:*\n${metrics.errors.length}`,
            },
          ],
        },
      ],
    };
  }

  /**
   * Format error message
   */
  private formatErrorMessage(error: Error, context?: Record<string, any>): WebhookMessage {
    if (this.config.webhookType === 'discord') {
      return {
        content: '🚨 Error Alert',
        embeds: [
          {
            title: 'Sync Error',
            color: 0xff0000,
            fields: [
              {
                name: 'Error Type',
                value: error.constructor.name,
                inline: true,
              },
              {
                name: 'Message',
                value: error.message.substring(0, 1000),
                inline: false,
              },
              {
                name: 'Context',
                value: context ? JSON.stringify(context, null, 2).substring(0, 1000) : 'N/A',
                inline: false,
              },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }

    // Slack format
    return {
      text: '🚨 Error Alert',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Sync Error',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Error:* ${error.constructor.name}\n*Message:* ${error.message}`,
          },
        },
      ],
    };
  }

  /**
   * Format sync failed message
   */
  private formatSyncFailedMessage(metrics: SyncMetrics, error: Error): WebhookMessage {
    const duration = ((metrics.duration || 0) / 1000).toFixed(2);

    if (this.config.webhookType === 'discord') {
      return {
        content: '❌ Sync Failed',
        embeds: [
          {
            title: 'Sync Failed',
            color: 0xff0000,
            fields: [
              {
                name: 'Error',
                value: `${error.constructor.name}: ${error.message}`,
                inline: false,
              },
              {
                name: 'Duration',
                value: `${duration}s`,
                inline: true,
              },
              {
                name: 'Files Processed',
                value: `${metrics.filesProcessed}`,
                inline: true,
              },
              {
                name: 'Total Errors',
                value: `${metrics.errors.length}`,
                inline: true,
              },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }

    // Slack format
    return {
      text: '❌ Sync Failed',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Sync Failed',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Error:* ${error.constructor.name}\n*Message:* ${error.message}\n*Duration:* ${duration}s\n*Files Processed:* ${metrics.filesProcessed}`,
          },
        },
      ],
    };
  }

  /**
   * Format performance degradation message
   */
  private formatPerformanceMessage(perfMetrics: PerformanceMetrics): WebhookMessage {
    if (this.config.webhookType === 'discord') {
      return {
        content: '⚠️ Performance Alert',
        embeds: [
          {
            title: 'Performance Degradation Detected',
            color: 0xffa500,
            fields: [
              {
                name: 'Files/Second',
                value: perfMetrics.filesPerSecond.toFixed(2),
                inline: true,
              },
              {
                name: 'Chunks/Second',
                value: perfMetrics.chunksPerSecond.toFixed(2),
                inline: true,
              },
              {
                name: 'Avg File Processing',
                value: `${perfMetrics.avgFileProcessingTime.toFixed(0)}ms`,
                inline: true,
              },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      };
    }

    // Slack format
    return {
      text: '⚠️ Performance Alert',
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: 'Performance Degradation Detected',
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Files/Second:* ${perfMetrics.filesPerSecond.toFixed(2)}\n*Avg Processing Time:* ${perfMetrics.avgFileProcessingTime.toFixed(0)}ms`,
          },
        },
      ],
    };
  }

  /**
   * Send webhook message
   */
  private async sendWebhook(message: WebhookMessage): Promise<void> {
    if (!this.config.webhookUrl) {
      return;
    }

    try {
      const response = await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        console.error(`Failed to send webhook: ${response.status} ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error sending webhook:', error);
    }
  }
}

/**
 * Webhook message types
 */
interface WebhookMessage {
  content?: string;
  text?: string;
  blocks?: any[];
  embeds?: any[];
}
