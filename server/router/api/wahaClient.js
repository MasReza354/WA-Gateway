import fetch from 'node-fetch';

class WahaClient {
  constructor() {
    this.baseUrl = process.env.WAHA_URL || 'http://localhost:3000';
    this.apiKey = process.env.WAHA_API_KEY || '';
    this.session = 'default';
  }

  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'x-api-key': this.apiKey
    };
  }

  async getSessions() {
    try {
      const response = await fetch(`${this.baseUrl}/api/sessions`, {
        method: 'GET',
        headers: this.getHeaders()
      });

      if (!response.ok) {
        throw new Error(`WAHA API Error: ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('[WAHA] getSessions error:', error.message);
      throw error;
    }
  }

  async getSessionStatus(sessionName = this.session) {
    try {
      const sessions = await this.getSessions();
      const session = sessions.find(s => s.name === sessionName);
      return session || null;
    } catch (error) {
      console.error('[WAHA] getSessionStatus error:', error.message);
      return null;
    }
  }

  async sendText(chatId, text, session = this.session) {
    try {
      const response = await fetch(`${this.baseUrl}/api/sendText`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          session: session,
          chatId: chatId,
          text: text
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`WAHA sendText error: ${response.status} - ${errorText}`);
      }

      return {
        success: true,
        status: response.status,
        message: 'Message sent successfully'
      };
    } catch (error) {
      console.error('[WAHA] sendText error:', error.message);
      throw error;
    }
  }

  async sendToChannel(channelId, message, session = this.session) {
    try {
      let channelJid = channelId;
      if (!channelId.includes('@newsletter')) {
        channelJid = `${channelId}@newsletter`;
      }

      console.log(`[WAHA] Sending to channel: ${channelJid}`);
      
      const result = await this.sendText(channelJid, message, session);
      
      return {
        success: true,
        messageId: `waha_${Date.now()}`,
        chatId: channelJid,
        method: 'waha'
      };
    } catch (error) {
      console.error('[WAHA] sendToChannel error:', error.message);
      throw error;
    }
  }

  async sendImage(chatId, imageUrl, caption = '', session = this.session) {
    try {
      const response = await fetch(`${this.baseUrl}/api/sendImage`, {
        method: 'POST',
        headers: this.getHeaders(),
        body: JSON.stringify({
          session: session,
          chatId: chatId,
          file: {
            url: imageUrl
          },
          caption: caption
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`WAHA sendImage error: ${response.status} - ${errorText}`);
      }

      return {
        success: true,
        status: response.status
      };
    } catch (error) {
      console.error('[WAHA] sendImage error:', error.message);
      throw error;
    }
  }

  isConfigured() {
    return !!(this.baseUrl && this.apiKey);
  }
}

const wahaClient = new WahaClient();
export default wahaClient;