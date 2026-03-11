import pkg from 'whatsapp-web.js';
import qrcode from 'qrcode-terminal';

const { Client, LocalAuth } = pkg;

class ChannelWebClient {
  constructor(sessionName = 'channel_session') {
    this.sessionName = sessionName;
    this.client = null;
    this.qrCallback = null;
    this.isReady = false;
    this.readyPromise = null;
  }

  initialize() {
    return new Promise((resolve, reject) => {
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
        console.log('[CHANNEL-WEB] QR Code received - Please scan!');
        if (this.qrCallback) {
          this.qrCallback(qr);
        }
        qrcode.generate(qr, { small: true });
      });

      this.client.on('ready', () => {
        console.log('[CHANNEL-WEB] Client is ready!');
        this.isReady = true;
        if (this.readyPromise) {
          this.readyPromise.resolve();
        }
        resolve();
      });

      this.client.on('authenticated', () => {
        console.log('[CHANNEL-WEB] Authenticated');
      });

      this.client.on('auth_failure', (msg) => {
        console.error('[CHANNEL-WEB] Authentication failed:', msg);
        reject(new Error(`Auth failure: ${msg}`));
      });

      this.client.on('disconnected', (reason) => {
        console.log('[CHANNEL-WEB] Disconnected:', reason);
        this.isReady = false;
      });

      this.client.initialize().catch(err => {
        console.error('[CHANNEL-WEB] Initialize error:', err);
        reject(err);
      });
    });
  }

  async start() {
    if (!this.client) {
      await this.initialize();
    }
  }

  async waitForReady(timeout = 60000) {
    // If already ready, return immediately
    if (this.isReady) {
      console.log('[CHANNEL-WEB] Client already ready');
      return Promise.resolve();
    }

    // If there's already a pending promise, wait for it
    if (this.readyPromise) {
      return this.readyPromise.promise;
    }

    // Create a new promise with timeout
    let resolveFunc, rejectFunc;
    const promise = new Promise((resolve, reject) => {
      resolveFunc = resolve;
      rejectFunc = reject;
    });

    this.readyPromise = {
      promise,
      resolve: resolveFunc,
      reject: rejectFunc
    };

    // Set timeout
    const timeoutId = setTimeout(() => {
      console.log('[CHANNEL-WEB] Ready timeout');
      this.readyPromise = null;
      rejectFunc(new Error('ChannelWeb client timeout'));
    }, timeout);

    // Clear timeout when resolved
    promise.then(() => {
      clearTimeout(timeoutId);
      this.readyPromise = null;
    }).catch(() => {
      clearTimeout(timeoutId);
      this.readyPromise = null;
    });

    return promise;
  }

  async sendToChannel(channelId, message) {
    try {
      if (!this.client) {
        throw new Error('Client not initialized');
      }

      console.log('[CHANNEL-WEB] Waiting for client to be ready...');
      await this.waitForReady(60000);
      console.log('[CHANNEL-WEB] Client ready, finding channel...');

      // Find the channel chat
      const chats = await this.client.getChats();
      console.log(`[CHANNEL-WEB] Found ${chats.length} chats`);
      
      const channelChat = chats.find(chat => {
        const isMatch = chat.id._serialized.includes(channelId) || 
                       chat.name?.toLowerCase().includes('channel') ||
                       chat.isNewsletter;
        if (isMatch) {
          console.log(`[CHANNEL-WEB] Found channel: ${chat.id._serialized}`);
        }
        return isMatch;
      });

      if (!channelChat) {
        throw new Error(`Channel ${channelId} not found. Make sure you're following the channel.`);
      }

      // Send message to channel
      console.log(`[CHANNEL-WEB] Sending message to ${channelChat.id._serialized}`);
      const result = await channelChat.sendMessage(message);
      console.log('[CHANNEL-WEB] Message sent:', result.id._serialized);
      
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