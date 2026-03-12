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
    const maxRetries = 2;
    let lastError = null;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        if (!this.client) {
          throw new Error('Client not initialized - Please restart and scan QR');
        }

        console.log(`\n[CHANNEL-WEB] ========== ATTEMPT ${attempt}/${maxRetries} ==========`);
        console.log(`[CHANNEL-WEB] Waiting for client to be ready...`);
        await this.waitForReady(180000);
        console.log('[CHANNEL-WEB] Client ready!');
        console.log('[CHANNEL-WEB] User:', this.client.info?.pushname || this.client.info?.wid);

        // Wait a bit for WhatsApp Web to fully load
        console.log('[CHANNEL-WEB] Waiting 3 seconds for WhatsApp Web to stabilize...');
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Find the channel chat with multiple detection methods
        console.log('[CHANNEL-WEB] Fetching all chats...');
        const startTime = Date.now();
        
        const chats = await this.client.getChats();
        const fetchTime = (Date.now() - startTime) / 1000;
        console.log(`[CHANNEL-WEB] Fetched ${chats.length} total chats in ${fetchTime}s`);
        
        // Method 1: Filter by isNewsletter property
        const newsletterChats = chats.filter(chat => chat.isNewsletter);
        console.log(`[CHANNEL-WEB] Method 1 - Found ${newsletterChats.length} chats with isNewsletter=true`);
        
        // Method 2: Filter by chat ID server (newsletter server)
        const serverChats = chats.filter(chat => chat.id?.server === 'newsletter');
        console.log(`[CHANNEL-WEB] Method 2 - Found ${serverChats.length} chats with server='newsletter'`);
        
        // Method 3: Filter by chat ID containing @newsletter
        const jidChats = chats.filter(chat => chat.id?._serialized?.includes('@newsletter'));
        console.log(`[CHANNEL-WEB] Method 3 - Found ${jidChats.length} chats with @newsletter in ID`);
        
        // Method 4: Search by channel ID (exact match or partial)
        const searchChats = chats.filter(chat => {
          const chatId = chat.id?._serialized || '';
          const chatName = chat.name || '';
          return chatId.includes(channelId) || chatName.includes(channelId);
        });
        console.log(`[CHANNEL-WEB] Method 4 - Found ${searchChats.length} chats matching channel ID "${channelId}"`);
        
        // Combine all methods
        const allChannelChats = new Map();
        
        [...newsletterChats, ...serverChats, ...jidChats, ...searchChats].forEach(chat => {
          allChannelChats.set(chat.id._serialized, chat);
        });
        
        console.log(`\n[CHANNEL-WEB] ========== ALL DETECTED CHANNELS ==========`);
        console.log(`[CHANNEL-WEB] Total unique channels found: ${allChannelChats.size}`);
        
        if (allChannelChats.size > 0) {
          let i = 0;
          allChannelChats.forEach((chat, jid) => {
            i++;
            if (i <= 20) { // Show first 20 channels
              console.log(`  ${i}. Name: "${chat.name}"`);
              console.log(`     ID: ${jid}`);
              console.log(`     isNewsletter: ${chat.isNewsletter}`);
              console.log(`     server: ${chat.id?.server}`);
              console.log(`     isGroup: ${chat.isGroup}`);
              console.log('');
            }
          });
          if (allChannelChats.size > 20) {
            console.log(`  ... and ${allChannelChats.size - 20} more channels`);
          }
        } else {
          console.log('[CHANNEL-WEB] ⚠️ NO CHANNELS FOUND AT ALL!');
          console.log('[CHANNEL-WEB] Possible reasons:');
          console.log('  1. You haven\'t created/followed any channels with this account');
          console.log('  2. WhatsApp Web hasn\'t synced channels yet (try waiting)');
          console.log('  3. Channel detection issue with whatsapp-web.js');
        }
        
        // Find the specific channel
        let channelChat = null;
        
        // Try exact match first
        const exactMatchId = channelId.includes('@newsletter') ? channelId : `${channelId}@newsletter`;
        channelChat = allChannelChats.get(exactMatchId);
        
        if (!channelChat) {
          // Try partial match
          for (const [jid, chat] of allChannelChats.entries()) {
            if (jid.includes(channelId) || chat.name?.includes(channelId)) {
              channelChat = chat;
              console.log(`[CHANNEL-WEB] Found partial match: ${jid}`);
              break;
            }
          }
        }

        if (!channelChat) {
          // Last resort: check ALL chats for the channel ID
          for (const chat of chats) {
            const chatId = chat.id?._serialized || '';
            if (chatId.includes(channelId)) {
              channelChat = chat;
              console.log(`[CHANNEL-WEB] Found in full chat scan: ${chatId}`);
              break;
            }
          }
        }

        if (!channelChat) {
          console.log(`\n[CHANNEL-WEB] ========== ERROR ==========`);
          console.log(`[CHANNEL-WEB] Channel "${channelId}" NOT FOUND!`);
          console.log(`[CHANNEL-WEB] Your account appears to have NO channels.`);
          console.log(`\nSolutions:`);
          console.log(`1. Create a NEW channel from WhatsApp mobile (Updates tab → + → New Channel)`);
          console.log(`2. Follow the channel from WhatsApp mobile first`);
          console.log(`3. Wait 1-2 minutes for WhatsApp Web to sync`);
          console.log(`4. Restart PM2 and try again`);
          
          const errorMsg = `Channel tidak ditemukan!\n\nAkun ini tidak memiliki channel sama sekali.\n\nSolusi:\n1. Buat channel BARU dari WhatsApp mobile\n2. Atau follow channel yang ingin dikirimi pesan\n3. Tunggu 1-2 menit untuk sinkronisasi\n4. Restart PM2 dan coba lagi`;
          throw new Error(errorMsg);
        }

        // Send message to channel
        console.log(`\n[CHANNEL-WEB] ========== SENDING MESSAGE ==========`);
        console.log(`[CHANNEL-WEB] Target: ${channelChat.id._serialized}`);
        console.log(`[CHANNEL-WEB] Channel Name: ${channelChat.name}`);
        console.log(`[CHANNEL-WEB] Message: ${message}`);
        
        const result = await channelChat.sendMessage(message);
        console.log('[CHANNEL-WEB] ✅ Message sent successfully!');
        console.log('[CHANNEL-WEB] Message ID:', result.id._serialized);
        console.log(`[CHANNEL-WEB] ========== SUCCESS ==========\n`);
        
        return {
          success: true,
          messageId: result.id._serialized,
          timestamp: result.timestamp,
          chatId: channelChat.id._serialized,
          channelName: channelChat.name
        };
      } catch (error) {
        lastError = error;
        console.error(`[CHANNEL-WEB] Attempt ${attempt} failed:`, error.message);
        
        if (attempt < maxRetries) {
          console.log(`[CHANNEL-WEB] Retrying in 5 seconds...`);
          await new Promise(resolve => setTimeout(resolve, 5000));
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