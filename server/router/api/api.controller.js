import path from "path";
import fs from "fs";

import { helpers, modules } from "../../../lib/index.js";
import Client from "../../session/Client/handler/Client.js";
import ConnectionSession from "../../session/Session.js";
import { ButtonResponse, ListResponse } from "../../database/db/messageRespon.db.js";
import HistoryMessage from "../../database/db/history.db.js";
import SessionDatabase from "../../database/db/session.db.js";
import { proto, encodeNewsletterMessage, isJidNewsletter } from "@whiskeysockets/baileys";
import ChannelWebClient from "./channelWeb.js";  // Add ChannelWebClient import

class ControllerApi extends ConnectionSession {
  constructor() {
    super();
    this.history = new HistoryMessage();
    this.sessionDb = new SessionDatabase();
    this.channelWebClients = new Map(); // Store channel web clients by session
  }

  async getOrCreateChannelWebClient(sessionName) {
    if (!this.channelWebClients.has(sessionName)) {
      console.log('[Newsletter] Creating new WhatsApp-web.js client for session:', sessionName);
      const client = new ChannelWebClient(`channel_${sessionName}`);
      this.channelWebClients.set(sessionName, client);
      
      // Initialize in background (don't wait)
      client.initialize().catch(err => {
        console.error('[Newsletter] WhatsApp-web.js init error:', err);
      });
      
      console.log('[Newsletter] WhatsApp-web.js client created - waiting for QR scan if needed');
    }
    return this.channelWebClients.get(sessionName);
  }

  async checkSessionMode(req, res, sessions, isChannel = false) {
    try {
      const sessionName = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
      const session = await this.sessionDb.findOneSessionDB(sessionName);
      
      if (!session) {
        return { valid: false, message: `Session ${sessionName} not found` };
      }
      
      if (isChannel && !session.mode_channel) {
        return { valid: false, message: `Channel mode is DISABLED for session ${sessionName}` };
      }
      
      if (!isChannel && !session.mode_chat) {
        return { valid: false, message: `Chat mode is DISABLED for session ${sessionName}` };
      }
      
      return { valid: true };
    } catch (error) {
      console.log(error);
      return { valid: false, message: "Internal Server Error" };
    }
  }

  async clientValidator(req, res, sessions, target) {
    try {
      const toTarget = helpers.phoneNumber(target);
      const client = this.getClient();
      if (!client) {
        res.send({ status: 403, message: `Session ${sessions} not Found` });
        return { toTarget: null, client: null };
      } else if (client && client.isStop == true) {
        res.send({ status: 403, message: `Session ${sessions} is Stopped` });
        return { toTarget: null, client: null };
      } else {
        return { toTarget, client };
      }
    } catch (error) {
      console.log(error);
      res.send({ status: 500, message: "Internal Server Error" });
      return { toTarget: null, client: null };
    }
  }

  async getSessions(req, res) {
    try {
      const db = await this.sessionDb.findAllSessionDB();
      const sessions = [];

      if (Array.isArray(db) && db.length) {
        for (let i = 0; i < db.length; i++) {
          const session = db[i];
          const client = this.getClient(session.session_name);
          if (client) {
            sessions.push({
              ...session.toJSON(),
              status: client.isStop === true ? "Disconnected" : "Connected",
              session_number: client?.user?.id?.split(":")[0].split("@")[0]
            });
          } else {
            sessions.push({
              ...session.toJSON(),
              status: "Disconnected",
              session_number: null
            });
          }
        }
      }

      res.send({ status: 200, message: "Success Get Sessions", sessions });
    } catch (error) {
      console.log(error);
      res.send({ status: 500, message: "Internal Server Error" });
    }
  }

  async sendText(req, res) {
    try {
      let { sessions, target, message } = req.body;
      if (!sessions || !target || !message) {
        return res.send({ status: 400, message: "Input All Data!" });
      }
      sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
      const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
      if (!client || !toTarget) return;

      const modeCheck = await this.checkSessionMode(req, res, sessions, false);
      if (!modeCheck.valid) {
        return res.send({ status: 403, message: modeCheck.message });
      }

      const result = await client.sendMessage(toTarget, { text: message });
      await this.history.pushNewMessage(sessions, "SEND", toTarget, message);

      if (result) {
        return res.send({ status: 200, message: `Success Send Message to ${target}!` });
      }
    } catch (error) {
      console.log(error);
      return res.send({ status: 500, message: "Internal Server Error" });
    }
  }

  async sendNewsletter(req, res) {
    try {
      let { sessions, channelId, message, method } = req.body;
      if (!sessions || !channelId || !message) {
        return res.send({ status: 400, message: "Input Session, Channel ID, and Message!" });
      }
      sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
      
      const modeCheck = await this.checkSessionMode(req, res, sessions, true);
      if (!modeCheck.valid) {
        return res.send({ status: 403, message: modeCheck.message });
      }
      
      // Determine which method to use
      const preferredMethod = method || 'whatsapp-web'; // Default to whatsapp-web
      
      if (preferredMethod === 'whatsapp-web') {
        console.log('[Newsletter] Using WhatsApp-web.js method...');
        
        try {
          const channelWebClient = await this.getOrCreateChannelWebClient(sessions);
          
          const result = await channelWebClient.sendToChannel(channelId, message);
          
          await this.history.pushNewMessage(sessions, "NEWSLETTER", `${channelId}@newsletter`, message);
          return res.send({ 
            status: 200, 
            message: `Pesan terkirim via WhatsApp-web.js!\n\nMessage ID: ${result.messageId}\nChat ID: ${result.chatId}\n\n⚠️ Jika pesan tidak muncul di channel, pastikan Anda sudah scan QR Code sekali untuk WhatsApp-web.js`,
            messageId: result.messageId,
            method: 'whatsapp-web.js'
          });
        } catch (webError) {
          console.log(`[Newsletter] WhatsApp-web.js failed:`, webError.message);
          
          // Fallback to Baileys
          console.log(`[Newsletter] Falling back to Baileys...`);
          const baileysClient = this.getClient();
          if (baileysClient && baileysClient.isStop !== true) {
            try {
              let channelJid = channelId;
              if (!channelId.includes("@newsletter")) {
                channelJid = `${channelId}@newsletter`;
              }
              
              const result = await baileysClient.sendMessage(channelJid, { text: message });
              if (result?.key?.id) {
                await this.history.pushNewMessage(sessions, "NEWSLETTER", channelJid, message);
                return res.send({ 
                  status: 200, 
                  message: `Pesan terkirim via Baileys!\n\nMessage ID: ${result.key.id}\n\nCatatan: Pesan mungkin tidak langsung muncul di channel.`,
                  messageId: result.key.id,
                  method: 'baileys'
                });
              }
            } catch (baileysError) {
              console.log(`[Newsletter] Baileys fallback failed:`, baileysError.message);
            }
          }
          
          return res.send({ 
            status: 500, 
            message: `Gagal mengirim via WhatsApp-web.js\n\nError: ${webError.message}\n\n💡 Solusi:\n- Pastikan Anda sudah scan QR Code untuk WhatsApp-web.js\n- Coba metode Baileys di UI toggle`
          });
        }
      } else {
        // Use Baileys method
        console.log('[Newsletter] Using Baileys method...');
        
        const baileysClient = this.getClient();
        if (!baileysClient || baileysClient.isStop === true) {
          return res.send({ 
            status: 500, 
            message: `Baileys client tidak tersedia\n\n💡 Solusi:\n- Pastikan session aktif\n- Coba metode WhatsApp-web.js di UI toggle`
          });
        }
        
        try {
          let channelJid = channelId;
          if (!channelId.includes("@newsletter")) {
            channelJid = `${channelId}@newsletter`;
          }
          
          const result = await baileysClient.sendMessage(channelJid, { text: message });
          if (result?.key?.id) {
            await this.history.pushNewMessage(sessions, "NEWSLETTER", channelJid, message);
            return res.send({ 
              status: 200, 
              message: `Pesan terkirim via Baileys!\n\nMessage ID: ${result.key.id}\n\nCatatan: Pesan mungkin tidak langsung muncul di channel.`,
              messageId: result.key.id,
              method: 'baileys'
            });
          }
        } catch (baileysError) {
          console.log(`[Newsletter] Baileys failed:`, baileysError.message);
          return res.send({ 
            status: 500, 
            message: `Gagal mengirim via Baileys\n\nError: ${baileysError.message}\n\n💡 Solusi:\n- Coba metode WhatsApp-web.js di UI toggle`
          });
        }
      }
    } catch (error) {
      console.log('[Newsletter] ERROR:', error);
      return res.send({ 
        status: 500, 
        message: `Error: ${error.message}`
      });
    }
  }

  async sendNewsletterMedia(req, res) {
    return res.send({ 
      status: 501, 
      message: `⚠️ Media ke Channel belum tersedia.\n\nSaat ini hanya TEXT message yang bisa dikirim ke Channel.\n\nUntuk kirim media, gunakan WhatsApp mobile langsung.`
    });
  }

  async sendLocation(req, res) {
    try {
      let { sessions, target, long, lat } = req.body;
      if (!sessions || !target || !long || !lat) {
        return res.send({ status: 400, message: "Input All Data!" });
      }
      sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
      const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
      if (!client || !toTarget) return;

      const modeCheck = await this.checkSessionMode(req, res, sessions, false);
      if (!modeCheck.valid) {
        return res.send({ status: 403, message: modeCheck.message });
      }

      const result = await client.sendMessage(toTarget, {
        location: {
          degreesLatitude: parseFloat(lat),
          degreesLongitude: parseFloat(long),
        },
      });
      await this.history.pushNewMessage(sessions, "SEND", toTarget, `Location: ${lat}, ${long}`);

      if (result) {
        return res.send({ status: 200, message: `Success Send Location to ${target}!` });
      }
    } catch (error) {
      console.log(error);
      return res.send({ status: 500, message: "Internal Server Error" });
    }
  }

  async sendMedia(req, res) {
    try {
      let { sessions, target, message } = req.body;
      if (!sessions || !target || !message) {
        return res.send({ status: 400, message: "Input All Data!" });
      }
      sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
      const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
      if (!client || !toTarget) return;

      const modeCheck = await this.checkSessionMode(req, res, sessions, false);
      if (!modeCheck.valid) {
        return res.send({ status: 403, message: modeCheck.message });
      }

      const regex = /^(https?:\/\/\S+\.(jpg|jpeg|png|gif|mp4|webp))$/i;
      if (!regex.test(message)) {
        return res.send({ status: 400, message: "URL Tidak Valid!" });
      }

      const ext = message.split(".").pop();
      const download = await helpers.downloadFile(message, ext);

      const result = await client.sendMessage(toTarget, {
        image: download,
        caption: message,
      });
      await this.history.pushNewMessage(sessions, "SEND", toTarget, `Media: ${message}`);

      if (result) {
        return res.send({ status: 200, message: `Success Send Media to ${target}!` });
      }
    } catch (error) {
      console.log(error);
      return res.send({ status: 500, message: "Internal Server Error" });
    }
  }

  async sendSticker(req, res) {
    try {
      let { sessions, target, message } = req.body;
      if (!sessions || !target || !message) {
        return res.send({ status: 400, message: "Input All Data!" });
      }
      sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
      const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
      if (!client || !toTarget) return;

      const modeCheck = await this.checkSessionMode(req, res, sessions, false);
      if (!modeCheck.valid) {
        return res.send({ status: 403, message: modeCheck.message });
      }

      const regex = /^(https?:\/\/\S+\.(jpg|jpeg|png|gif|webp))$/i;
      if (!regex.test(message)) {
        return res.send({ status: 400, message: "URL Tidak Valid!" });
      }

      const ext = message.split(".").pop();
      const download = await helpers.downloadFile(message, ext);

      const result = await client.sendMessage(toTarget, {
        sticker: download,
      });
      await this.history.pushNewMessage(sessions, "SEND", toTarget, `Sticker: ${message}`);

      if (result) {
        return res.send({ status: 200, message: `Success Send Sticker to ${target}!` });
      }
    } catch (error) {
      console.log(error);
      return res.send({ status: 500, message: "Internal Server Error" });
    }
  }

  async sendContact(req, res) {
    try {
      let { sessions, target, contact } = req.body;
      if (!sessions || !target || !contact) {
        return res.send({ status: 400, message: "Input All Data!" });
      }
      sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
      const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
      if (!client || !toTarget) return;

      const modeCheck = await this.checkSessionMode(req, res, sessions, false);
      if (!modeCheck.valid) {
        return res.send({ status: 403, message: modeCheck.message });
      }

      const result = await client.sendMessage(toTarget, {
        contacts: {
          displayName: contact.name,
          contacts: [
            {
              displayName: contact.name,
              vcard: `BEGIN:VCARD\nVERSION:3.0\nFN:${contact.name}\nORG:whatsapp-gateway\nTEL:+${contact.number}\nEND:VCARD`,
            },
          ],
        },
      });
      await this.history.pushNewMessage(sessions, "SEND", toTarget, `Contact: ${contact.name}`);

      if (result) {
        return res.send({ status: 200, message: `Success Send Contact to ${target}!` });
      }
    } catch (error) {
      console.log(error);
      return res.send({ status: 500, message: "Internal Server Error" });
    }
  }

  async sendButton(req, res) {
    try {
      let { sessions, target, title, footer, buttons } = req.body;
      if (!sessions || !target || !title || !footer || !buttons) {
        return res.send({ status: 400, message: "Input All Data!" });
      }
      sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
      const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
      if (!client || !toTarget) return;

      const modeCheck = await this.checkSessionMode(req, res, sessions, false);
      if (!modeCheck.valid) {
        return res.send({ status: 403, message: modeCheck.message });
      }

      const result = await client.sendMessage(
        toTarget,
        {
          templateButtons: buttons.map((btn, index) => ({
            index: index,
            urlButton: {
              displayText: btn.text,
              url: btn.url,
            },
          })),
          text: title,
          footer: footer,
        },
        { quoted: null }
      );
      await this.history.pushNewMessage(sessions, "SEND", toTarget, `Button: ${title}`);

      if (result) {
        return res.send({ status: 200, message: `Success Send Button to ${target}!` });
      }
    } catch (error) {
      console.log(error);
      return res.send({ status: 500, message: "Internal Server Error" });
    }
  }

  async sendListMessage(req, res) {
    try {
      let { sessions, target, title, footer, buttonText, sections } = req.body;
      if (!sessions || !target || !title || !footer || !buttonText || !sections) {
        return res.send({ status: 400, message: "Input All Data!" });
      }
      sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
      const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
      if (!client || !toTarget) return;

      const modeCheck = await this.checkSessionMode(req, res, sessions, false);
      if (!modeCheck.valid) {
        return res.send({ status: 403, message: modeCheck.message });
      }

      const result = await client.sendMessage(
        toTarget,
        {
          text: title,
          footer: footer,
          title: title,
          buttonText: buttonText,
          sections: sections,
        },
        { quoted: null }
      );
      await this.history.pushNewMessage(sessions, "SEND", toTarget, `List: ${title}`);

      if (result) {
        return res.send({ status: 200, message: `Success Send List Message to ${target}!` });
      }
    } catch (error) {
      console.log(error);
      return res.send({ status: 500, message: "Internal Server Error" });
    }
  }

  async sendProduct(req, res) {
    try {
      let { sessions, target, title, body, price, url } = req.body;
      if (!sessions || !target || !title || !body || !price || !url) {
        return res.send({ status: 400, message: "Input All Data!" });
      }
      sessions = sessions.includes("(") ? sessions.split(" (")[0] : sessions;
      const { client, toTarget } = await this.clientValidator(req, res, sessions, target);
      if (!client || !toTarget) return;

      const modeCheck = await this.checkSessionMode(req, res, sessions, false);
      if (!modeCheck.valid) {
        return res.send({ status: 403, message: modeCheck.message });
      }

      const regex = /^(https?:\/\/\S+\.(jpg|jpeg|png|gif|mp4|webp))$/i;
      if (!regex.test(url)) {
        return res.send({ status: 400, message: "URL Tidak Valid!" });
      }

      const ext = url.split(".").pop();
      const download = await helpers.downloadFile(url, ext);

      const result = await client.sendMessage(toTarget, {
        product: {
          product: {
            id: "123456789",
            title: title,
            description: body,
            currencyCode: "IDR",
            priceAmount1000: parseInt(price) * 1000,
            retailerId: "Retailer",
            url: "https://www.google.com",
          },
          catalog: {
            id: "123456789",
            name: "Catalog Name",
          },
          body: body,
          title: title,
          footer: "Footer Text",
        },
        image: download,
      });
      await this.history.pushNewMessage(sessions, "SEND", toTarget, `Product: ${title}`);

      if (result) {
        return res.send({ status: 200, message: `Success Send Product to ${target}!` });
      }
    } catch (error) {
      console.log(error);
      return res.send({ status: 500, message: "Internal Server Error" });
    }
  }

  async deleteHistory(req, res) {
    try {
      const { session_name } = req.query;
      if (!session_name) {
        return res.send({ status: 400, message: "Session name is required!" });
      }

      await this.history.deleteHistoryBySession(session_name);
      res.send({ status: 200, message: "History deleted successfully" });
    } catch (error) {
      console.log(error);
      res.send({ status: 500, message: "Internal Server Error" });
    }
  }

  async deleteAllHistory(req, res) {
    try {
      await this.history.deleteAllHistory();
      res.send({ status: 200, message: "All history deleted successfully" });
    } catch (error) {
      console.log(error);
      res.send({ status: 500, message: "Internal Server Error" });
    }
  }

  async validateChannel(req, res) {
    // Channel validation removed - Baileys doesn't support channel operations
    return res.send({ 
      status: 501, 
      valid: false,
      message: "Channel validation tidak tersedia. Silakan cek channel langsung dari WhatsApp mobile."
    });
  }
}

export default ControllerApi;