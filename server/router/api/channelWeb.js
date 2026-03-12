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
    try {
      if (!this.client) {
        throw new Error('Client not initialized - Please restart and scan QR');
      }

      console.log(`\n[CHANNEL-WEB] ========== SENDING TO CHANNEL ==========`);
      console.log(`[CHANNEL-WEB] Target Channel ID: ${channelId}`);
      console.log(`[CHANNEL-WEB] Message: ${message}`);
      
      // Wait for client to be ready
      await this.waitForReady(180000);
      console.log('[CHANNEL-WEB] Client ready!');

      // Get the underlying Puppeteer page
      const page = this.client.pupPage;
      
      if (!page) {
        throw new Error('Puppeteer page not available');
      }

      console.log('[CHANNEL-WEB] Got Puppeteer page, navigating to channel...');

      // Format channel JID
      const channelJid = channelId.includes('@newsletter') ? channelId : `${channelId}@newsletter`;
      
      // Method: Use WhatsApp Web URL to directly access the channel
      const channelUrl = `https://web.whatsapp.com/channel/${channelId}`;
      
      console.log(`[CHANNEL-WEB] Navigating to: ${channelUrl}`);
      
      try {
        // Navigate to channel page
        await page.goto(channelUrl, { 
          waitUntil: 'networkidle2', 
          timeout: 60000 
        });
        
        console.log('[CHANNEL-WEB] Channel page loaded');
        
        // Wait for message input to appear
        await page.waitForSelector('div[contenteditable="true"][data-tab="10"]', { timeout: 10000 });
        
        console.log('[CHANNEL-WEB] Found message input, typing message...');
        
        // Type the message
        await page.type('div[contenteditable="true"][data-tab="10"]', message);
        
        // Wait a bit for message to be typed
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Find and click send button
        const sendButton = await page.$('button[data-tab="10"] span[data-icon="send"]');
        
        if (sendButton) {
          console.log('[CHANNEL-WEB] Clicking send button...');
          await sendButton.click();
          
          // Wait for message to be sent
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('[CHANNEL-WEB] ✅ Message sent successfully via Puppeteer!');
          
          return {
            success: true,
            messageId: `puppeteer_${Date.now()}`,
            timestamp: Date.now(),
            chatId: channelJid,
            method: 'puppeteer-dom'
          };
        } else {
          throw new Error('Send button not found');
        }
      } catch (navError) {
        console.log('[CHANNEL-WEB] Navigation method failed:', navError.message);
        console.log('[CHANNEL-WEB] Falling back to sendMessage method...');
        
        // Fallback: Try regular sendMessage
        const chats = await this.client.getChats();
        console.log(`[CHANNEL-WEB] Found ${chats.length} chats`);
        
        let channelChat = null;
        for (const chat of chats) {
          if (chat.id._serialized === channelJid || chat.id._serialized.includes(channelId)) {
            channelChat = chat;
            console.log(`[CHANNEL-WEB] Found channel: ${channelJid}`);
            break;
          }
        }
        
        if (channelChat) {
          const result = await channelChat.sendMessage(message);
          console.log('[CHANNEL-WEB] ✅ Message sent via sendMessage!');
          return {
            success: true,
            messageId: result.id._serialized,
            timestamp: result.timestamp,
            chatId: channelChat.id._serialized,
            method: 'sendMessage'
          };
        } else {
          throw new Error('Channel not found in chat list - You may need to follow the channel first or it may be in Updates tab');
        }
      }
    } catch (error) {
      console.error('[CHANNEL-WEB] Error:', error);
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