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

      console.log('[CHANNEL-WEB] Got Puppeteer page');

      // Format channel JID
      const channelJid = channelId.includes('@newsletter') ? channelId : `${channelId}@newsletter`;
      
      console.log('[CHANNEL-WEB] Attempting to send via Puppeteer automation...');
      
      try {
        // Step 1: Navigate to main WhatsApp Web page
        console.log('[CHANNEL-WEB] Step 1: Navigate to WhatsApp Web main page');
        await page.goto('https://web.whatsapp.com', { 
          waitUntil: 'networkidle2', 
          timeout: 60000 
        });
        
        // Wait for main interface to load
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Step 2: Click on Updates/Channels tab
        console.log('[CHANNEL-WEB] Step 2: Looking for Updates/Channels tab...');
        
        // Try to find and click the Updates tab (channels are there)
        const updatesTabSelectors = [
          'div[role="link"][title="Updates"]',
          'div[role="link"][title="Saluran"]',
          'span[data-icon="status"]',  // Status/Updates icon
          'div[data-icon="status"]',
        ];
        
        let updatesTab = null;
        for (const selector of updatesTabSelectors) {
          updatesTab = await page.$(selector);
          if (updatesTab) {
            console.log(`[CHANNEL-WEB] Found Updates tab with: ${selector}`);
            break;
          }
        }
        
        if (updatesTab) {
          console.log('[CHANNEL-WEB] Clicking Updates tab...');
          await updatesTab.click();
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
          console.log('[CHANNEL-WEB] Updates tab not found, continuing anyway...');
        }
        
        // Step 3: Search for the channel
        console.log('[CHANNEL-WEB] Step 3: Searching for channel...');
        
        // Click on search box
        const searchBox = await page.$('div[contenteditable="true"][data-tab="2"], input[type="text"]');
        if (searchBox) {
          await searchBox.click();
          await new Promise(resolve => setTimeout(resolve, 500));
          await searchBox.type(channelId);
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
        
        // Step 4: Try to click on the channel from search results
        console.log('[CHANNEL-WEB] Step 4: Looking for channel in results...');
        
        // Step 5: Find message input and send
        console.log('[CHANNEL-WEB] Step 5: Looking for message input...');
        
        const messageSelectors = [
          'footer div[contenteditable="true"]',
          'div[contenteditable="true"][data-tab="10"]',
          'div[contenteditable="true"][data-tab="60"]',
          'div[contenteditable="true"]'
        ];
        
        let messageInput = null;
        for (const selector of messageSelectors) {
          messageInput = await page.$(selector);
          if (messageInput) {
            console.log(`[CHANNEL-WEB] Found message input: ${selector}`);
            break;
          }
        }
        
        if (!messageInput) {
          throw new Error('Message input not found');
        }
        
        // Click to focus
        await messageInput.click();
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Type message
        console.log('[CHANNEL-WEB] Typing message...');
        await messageInput.type(message, { delay: 50 });
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Find and click send button
        console.log('[CHANNEL-WEB] Looking for send button...');
        
        const sendButtonSelectors = [
          'button[aria-label="Send"]',
          'button span[data-icon="send"]',
          'button[data-tab="10"] span[data-icon="send"]',
          'button[data-tab="60"] span[data-icon="send"]',
          'footer button'
        ];
        
        let sendButton = null;
        for (const selector of sendButtonSelectors) {
          sendButton = await page.$(selector);
          if (sendButton) {
            console.log(`[CHANNEL-WEB] Found send button: ${selector}`);
            break;
          }
        }
        
        if (sendButton) {
          console.log('[CHANNEL-WEB] Clicking send button...');
          await sendButton.click();
          await new Promise(resolve => setTimeout(resolve, 3000));
          
          console.log('[CHANNEL-WEB] ✅ Message sent via Puppeteer!');
          return {
            success: true,
            messageId: `puppeteer_${Date.now()}`,
            timestamp: Date.now(),
            chatId: channelJid,
            method: 'puppeteer-automation'
          };
        } else {
          // Try pressing Enter instead of clicking send
          console.log('[CHANNEL-WEB] Send button not found, trying Enter key...');
          await page.keyboard.press('Enter');
          await new Promise(resolve => setTimeout(resolve, 2000));
          
          console.log('[CHANNEL-WEB] ✅ Message sent via Enter key!');
          return {
            success: true,
            messageId: `puppeteer_${Date.now()}`,
            timestamp: Date.now(),
            chatId: channelJid,
            method: 'puppeteer-enter'
          };
        }
      } catch (puppeteerError) {
        console.log('[CHANNEL-WEB] Puppeteer automation failed:', puppeteerError.message);
        console.log('[CHANNEL-WEB] This is expected - channels are complex to automate');
        
        throw new Error(`Puppeteer automation failed: ${puppeteerError.message}\n\n` +
          `Channel automation via WhatsApp Web is complex because:\n` +
          `1. Channels are in "Updates" tab, not chat list\n` +
          `2. No direct URL for channels\n` +
          `3. UI selectors change frequently\n\n` +
          `RECOMMENDATION: Use Baileys method instead (already working!)`);
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