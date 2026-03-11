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
    this.isInitializing = false;
  }

  initialize() {
    return new Promise((resolve, reject) => {
      if (this.isInitializing) {
        console.log('[CHANNEL-WEB] Already initializing, waiting...');
        return;
      }
      
      this.isInitializing = true;
      
      console.log('[CHANNEL-WEB] Initializing with session:', this.sessionName);
      
      this.client = new Client({
        authStrategy: new LocalAuth({ 
          clientId: this.sessionName,
          dataPath: `./wwebjs_auth/${this.sessionName}`
        }),
        puppeteer: {
          headless: true,
          args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
          ],
          executablePath: process.env.CHROME_BIN || undefined,
          timeout: 180000,
          protocolTimeout: 300000  // Increase to 5 minutes for heavy operations
        }
      });

      this.client.on('qr', (qr) => {
        console.log('[CHANNEL-WEB] QR Code received - Please scan!');
        console.log('[CHANNEL-WEB] This QR is for WhatsApp-web.js (Channel feature)');
        console.log('[CHANNEL-WEB] This will NOT affect your Baileys session');
        if (this.qrCallback) {
          this.qrCallback(qr);
        }
        qrcode.generate(qr, { small: true });
      });

      this.client.on('ready', () => {
        console.log('[CHANNEL-WEB] Client is ready!');
        console.log('[CHANNEL-WEB] User:', this.client.info?.pushname || this.client.info?.wid);
        this.isReady = true;
        this.isInitializing = false;
        if (this.readyPromise) {
          this.readyPromise.resolve();
        }
        resolve();
      });

      this.client.on('authenticated', () => {
        console.log('[CHANNEL-WEB] Authenticated - Session saved');
      });

      this.client.on('auth_failure', (msg) => {
        console.error('[CHANNEL-WEB] Authentication failed:', msg);
        this.isInitializing = false;
        reject(new Error(`Auth failure: ${msg}`));
      });

      this.client.on('disconnected', (reason) => {
        console.log('[CHANNEL-WEB] Disconnected:', reason);
        this.isReady = false;
        this.isInitializing = false;
      });
      
      this.client.on('loading_screen', (percent, message) => {
        console.log(`[CHANNEL-WEB] Loading: ${percent}% - ${message}`);
      });
      
      this.client.on('logged_out', () => {
        console.log('[CHANNEL-WEB] Logged out - Need to scan QR again');
        this.isReady = false;
        this.isInitializing = false;
      });

      this.client.initialize().catch(err => {
        console.error('[CHANNEL-WEB] Initialize error:', err);
        this.isInitializing = false;
        reject(err);
      });
    });
  }

  async start() {
    if (!this.client) {
      await this.initialize();
    }
  }

  async waitForReady(timeout = 120000) {
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
      console.log('[CHANNEL-WEB] Ready timeout after', timeout, 'ms');
      this.readyPromise = null;
      rejectFunc(new Error('ChannelWeb client timeout - Please restart and scan QR again'));
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
    const maxRetries = 3;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.client) {
          throw new Error('Client not initialized - Please restart and scan QR');
        }

        console.log(`[CHANNEL-WEB] Attempt ${attempt}/${maxRetries} - Waiting for client to be ready...`);
        await this.waitForReady(180000);
        console.log('[CHANNEL-WEB] Client ready, finding channel...');

        // Wait a bit for WhatsApp Web to fully load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Find the channel chat with retry
        console.log('[CHANNEL-WEB] Fetching chats (this may take a while if you have many chats)...');
        const startTime = Date.now();
        
        const chats = await this.client.getChats();
        const fetchTime = (Date.now() - startTime) / 1000;
        console.log(`[CHANNEL-WEB] Fetched ${chats.length} chats in ${fetchTime}s`);
        
        // Filter for newsletter/channel chats
        const newsletterChats = chats.filter(chat => chat.isNewsletter);
        console.log(`[CHANNEL-WEB] Found ${newsletterChats.length} newsletter channels`);
        
        if (newsletterChats.length > 0) {
          console.log('[CHANNEL-WEB] Available channels:');
          newsletterChats.forEach((ch, i) => {
            console.log(`  ${i+1}. ${ch.name} (${ch.id._serialized})`);
          });
        }
        
        const channelChat = chats.find(chat => {
          const isMatch = chat.id._serialized.includes(channelId) || 
                         chat.name?.toLowerCase().includes('channel') ||
                         chat.isNewsletter;
          if (isMatch) {
            console.log(`[CHANNEL-WEB] Found matching channel: ${chat.id._serialized}`);
          }
          return isMatch;
        });

        if (!channelChat) {
          const errorMsg = `Channel ${channelId} not found.\n\nSolutions:\n1. Make sure you FOLLOW the channel from WhatsApp mobile\n2. Or CREATE a new channel with this account\n3. Try using the numeric channel ID instead\n4. Check if channel ID is correct`;
          throw new Error(errorMsg);
        }

        // Send message to channel
        console.log(`[CHANNEL-WEB] Sending message to ${channelChat.id._serialized}`);
        const result = await channelChat.sendMessage(message);
        console.log('[CHANNEL-WEB] Message sent successfully:', result.id._serialized);
        
        return {
          success: true,
          messageId: result.id._serialized,
          timestamp: result.timestamp,
          chatId: channelChat.id._serialized
        };
      } catch (error) {
        lastError = error;
        console.error(`[CHANNEL-WEB] Attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxRetries) {
          console.log(`[CHANNEL-WEB] Retrying in 3 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      }
    }
    
    console.error('[CHANNEL-WEB] All attempts failed');
    throw lastError;
  }

  async generateQR(callback) {
    this.qrCallback = callback;
  }

  getClient() {
    return this.client;
  }

  async stop() {
    if (this.client) {
      console.log('[CHANNEL-WEB] Stopping client...');
      await this.client.destroy();
      this.client = null;
      this.isReady = false;
      this.isInitializing = false;
      console.log('[CHANNEL-WEB] Client stopped');
    }
  }
  
  async restart() {
    console.log('[CHANNEL-WEB] Restarting client...');
    await this.stop();
    await new Promise(resolve => setTimeout(resolve, 2000));
    await this.initialize();
  }
}

export default ChannelWebClient;