import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;

class ChannelWebClient {
  constructor(sessionName = 'channel_session') {
    this.sessionName = sessionName;
    this.client = null;
    this.qrCallback = null;
    this.readyCallback = null;
  }

  initialize() {
    this.client = new Client({
      authStrategy: new LocalAuth({ clientId: this.sessionName }),
      puppeteer: {
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });

    this.client.on('qr', (qr) => {
      console.log('[CHANNEL-WEB] QR Code received');
      if (this.qrCallback) {
        this.qrCallback(qr);
      }
      qrcode.generate(qr, { small: true });
    });

    this.client.on('ready', () => {
      console.log('[CHANNEL-WEB] Client is ready!');
      if (this.readyCallback) {
        this.readyCallback();
      }
    });

    this.client.on('authenticated', () => {
      console.log('[CHANNEL-WEB] Authenticated');
    });

    this.client.on('auth_failure', (msg) => {
      console.error('[CHANNEL-WEB] Authentication failed:', msg);
    });

    this.client.on('disconnected', (reason) => {
      console.log('[CHANNEL-WEB] Disconnected:', reason);
    });
  }

  async start() {
    if (!this.client) {
      this.initialize();
    }
    await this.client.initialize();
  }

  async waitForReady(timeout = 30000) {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('ChannelWeb client timeout'));
      }, timeout);

      this.readyCallback = () => {
        clearTimeout(timeoutId);
        resolve();
      };
    });
  }

  async sendToChannel(channelId, message) {
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      // Wait for client to be ready
      await this.waitForReady();

      // Find the channel chat
      const chats = await this.client.getChats();
      const channelChat = chats.find(chat => 
        chat.id._serialized.includes(channelId) || 
        chat.name?.toLowerCase().includes('channel') ||
        chat.isNewsletter
      );

      if (!channelChat) {
        throw new Error(`Channel ${channelId} not found`);
      }

      // Send message to channel
      const result = await channelChat.sendMessage(message);
      console.log('[CHANNEL-WEB] Message sent to channel:', result.id._serialized);
      
      return {
        success: true,
        messageId: result.id._serialized,
        timestamp: result.timestamp,
        chatId: channelChat.id._serialized
      };
    } catch (error) {
      console.error('[CHANNEL-WEB] Error sending to channel:', error);
      throw error;
    }
  }

  async getChannels() {
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      await this.waitForReady();
      const chats = await this.client.getChats();
      
      // Filter for channel/newletter chats
      const channels = chats.filter(chat => 
        chat.isNewsletter || 
        chat.id.server === 'newsletter' ||
        chat.name?.toLowerCase().includes('channel')
      );

      return channels.map(chat => ({
        id: chat.id._serialized,
        name: chat.name,
        isMuted: chat.isMuted,
        timestamp: chat.timestamp,
        unreadCount: chat.unreadCount
      }));
    } catch (error) {
      console.error('[CHANNEL-WEB] Error getting channels:', error);
      throw error;
    }
  }

  async generateQR(callback) {
    this.qrCallback = callback;
  }

  getClient() {
    return this.client;
  }

  async stop() {
    if (this.client) {
      await this.client.destroy();
    }
  }
}

export default ChannelWebClient;