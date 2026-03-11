import { makeWASocket, Browsers, DisconnectReason, fetchLatestBaileysVersion, useMultiFileAuthState } from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import pino from "pino";
import qrcode from "qrcode";
import fs from "fs";
import { modules } from "../../lib/index.js";
import { socket, moment } from "../config/index.js";
import SessionDatabase from "../database/db/session.db.js";
import Message from "./Client/handler/Message.js";

const { SESSION_PATH, LOG_PATH } = process.env;
let sessions = {};
let qrCodeStore = {};

// Tracking untuk cleanup resource
let currentClient = null;

// Export all sessions
export function getAllSessions() {
  return sessions;
}

// Export QR code store
export function getQRCodeStore() {
  return qrCodeStore;
}

export function clearQRCodeStore(session_name) {
  delete qrCodeStore[session_name];
}

class ConnectionSession extends SessionDatabase {
  constructor() {
    super();
    this.sessionPath = SESSION_PATH;
    this.logPath = LOG_PATH;
    this.count = 0;
  }

  getClient() {
    return sessions ?? null;
  }

  /**
   * Membersihkan resource dari client lama sebelum membuat yang baru.
   * Mencegah memory leak dari event listener dan setInterval yang menumpuk.
   */
  cleanupOldClient() {
    // Hapus semua event listener dari client lama
    if (currentClient && currentClient.ev) {
      try {
        currentClient.ev.removeAllListeners("connection.update");
        currentClient.ev.removeAllListeners("creds.update");
        currentClient.ev.removeAllListeners("messages.upsert");
      } catch (e) {
        // Abaikan error saat cleanup
      }
    }
    currentClient = null;
  }

  async deleteSession(session_name, deleteFromDB = true) {
    // Cleanup resource terlebih dahulu
    this.cleanupOldClient();

    if (fs.existsSync(`${this.sessionPath}/${session_name}`)) fs.rmSync(`${this.sessionPath}/${session_name}`, { force: true, recursive: true });
    if (fs.existsSync(`${this.sessionPath}/store/${session_name}.json`)) fs.unlinkSync(`${this.sessionPath}/store/${session_name}.json`);
    if (fs.existsSync(`${this.logPath}/${session_name}.txt`)) fs.unlinkSync(`${this.logPath}/${session_name}.txt`);
    if (deleteFromDB) {
      await this.deleteSessionDB(session_name);
    }
    sessions = {};
  }

  async syncSessionsFromFolder() {
    const dbSessions = await this.findAllSessionDB();
    const dbSessionNames = dbSessions.map(s => s.session_name);
    
    if (!fs.existsSync(this.sessionPath)) {
      fs.mkdirSync(this.sessionPath, { recursive: true });
      return;
    }
    
    const folders = fs.readdirSync(this.sessionPath).filter(f => f !== "store");
    
    for (const folder of folders) {
      const sessionDir = `${this.sessionPath}/${folder}`;
      const credsFile = `${sessionDir}/creds.json`;
      
      if (fs.existsSync(credsFile)) {
        try {
          const creds = JSON.parse(fs.readFileSync(credsFile, "utf8"));
          const sessionNumber = creds.me?.id?.split(":")[0] || "unknown";
          
          if (!dbSessionNames.includes(folder)) {
            await this.session.create({ 
              session_name: folder, 
              session_number: sessionNumber, 
              status: "STOPPED" 
            });
            console.log(
              modules.color("[SYS]", "#EB6112"),
              modules.color(`[Session: ${folder}] Restored from folder`, "#82E0AA")
            );
          } else {
            const dbSession = dbSessions.find(s => s.session_name === folder);
            if (dbSession && dbSession.status !== "STOPPED") {
              await this.updateStatusSessionDB(folder, "STOPPED");
            }
          }
        } catch (e) {
          console.log(
            modules.color("[SYS]", "#EB6112"),
            modules.color(`[Session: ${folder}] Cannot read creds, skipping sync`, "#E6B0AA")
          );
        }
      }
    }
    
    for (const dbSession of dbSessions) {
      if (!folders.includes(dbSession.session_name)) {
        await this.deleteSessionDB(dbSession.session_name);
        console.log(
          modules.color("[SYS]", "#EB6112"),
          modules.color(`[Session: ${dbSession.session_name}] Removed from DB (no folder)`, "#E6B0AA")
        );
      }
    }
  }

  async generateQr(input, session_name) {
    let rawData = await qrcode.toDataURL(input, { scale: 8 });
    let dataBase64 = rawData.replace(/^data:image\/png;base64,/, "");
    
    // Simpan QR code ke store
    qrCodeStore[session_name] = {
      buffer: dataBase64,
      session_name,
      timestamp: Date.now()
    };
    
    // Emit QR dengan retry untuk memastikan client menerima
    const emitQR = () => {
      socket.emit(`update-qr`, { buffer: dataBase64, session_name });
      socket.emit(`qr-${session_name}`, { buffer: dataBase64, session_name });
    };
    
    emitQR();
    setTimeout(emitQR, 500);
    setTimeout(emitQR, 1000);
    
    this.count++;
    console.log(
      modules.color("[SYS]", "#EB6112"),
      modules.color(`[Session: ${session_name}] QR Code generated, waiting for scan...`, "#E6B0AA")
    );
    console.log(`QR Count: ${this.count}`);
  }

  async createSession(session_name) {
    // Cleanup client lama sebelum membuat yang baru (mencegah memory leak)
    this.cleanupOldClient();

    // Reset QR count untuk session baru
    this.count = 0;
    
    // Emit session created event
    socket.emit("session-created", { session_name });

    const sessionDir = `${this.sessionPath}/${session_name}`;
    let { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    const options = {
      printQRInTerminal: false,
      auth: state,
      logger: pino({ level: "silent" }),
      browser: Browsers.macOS("Safari"),
      version,
    };

    const client = makeWASocket(options);

    // Simpan reference ke client saat ini
    currentClient = client;
    sessions = { ...client, isStop: false };

    client.ev.on("creds.update", saveCreds);
    client.ev.on("connection.update", async (update) => {
      // Jika client ini sudah bukan client aktif, abaikan event-nya
      if (currentClient !== client) {
        try { client.ev.removeAllListeners("connection.update"); } catch (e) {}
        return;
      }

      if (this.count >= 6) {
        await this.updateStatusSessionDB(session_name, "STOPPED");
        this.deleteSession(session_name, false);
        socket.emit("connection-status", { session_name, result: "No Response, QR Scan Canceled" });
        console.log(`Count : ${this.count}, QR Stopped!`);
        return;
      }

      if (update.qr) this.generateQr(update.qr, session_name);

      if (update.isNewLogin) {
        await this.createSessionDB(session_name, client.authState.creds.me.id.split(":")[0]);
        let files = `${this.logPath}/${session_name}.txt`;
        if (!fs.existsSync(this.logPath)) {
          fs.mkdirSync(this.logPath, { recursive: true });
        }
        if (fs.existsSync(files)) {
          var readLog = fs.readFileSync(files, "utf8");
        } else {
          fs.writeFileSync(files, `Success Create new Session : ${session_name}, ${client.authState.creds.me.id.split(":")[0]}\n`);
          var readLog = fs.readFileSync(files, "utf8");
        }
        return socket.emit("logger", {
          session_name,
          result: readLog,
          files,
          session_number: client.authState.creds.me.id.split(":")[0],
          status: "CONNECTED",
        });
      }

      const { lastDisconnect, connection } = update;
      if (connection === "close") {
        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;

        if (reason === DisconnectReason.badSession) {
          console.log(
            modules.color("[SYS]", "#EB6112"),
            modules.color(`Bad Session File, Please Delete [Session: ${session_name}] and Scan Again`, "#E6B0AA")
          );
          await this.updateStatusSessionDB(session_name, "STOPPED");
          this.deleteSession(session_name, false);
          return socket.emit("connection-status", { session_name, result: "Bad Session File, Please Create QR Again" });

        } else if (reason === DisconnectReason.connectionClosed) {
          const checked = this.getClient();
          // Perbaikan: gunakan === true/false secara eksplisit, handle undefined
          if (checked && checked.isStop === true) {
            await this.updateStatusSessionDB(session_name, "STOPPED");
            console.log(modules.color("[SYS]", "#EB6112"), modules.color(`[Session: ${session_name}] Connection close Success`, "#E6B0AA"));
            socket.emit("session-status", { session_name, status: "STOPPED" });
          } else if (checked && checked.isStop === false) {
            console.log(
              modules.color("[SYS]", "#EB6112"),
              modules.color(`[Session: ${session_name}] Connection closed, reconnecting....`, "#E6B0AA")
            );
            this.createSession(session_name);
          } else {
            // isStop undefined atau sessions kosong - update status dan jangan reconnect
            console.log(
              modules.color("[SYS]", "#EB6112"),
              modules.color(`[Session: ${session_name}] Connection closed (session state unknown), not reconnecting.`, "#E6B0AA")
            );
            await this.updateStatusSessionDB(session_name, "STOPPED");
            socket.emit("session-status", { session_name, status: "STOPPED" });
          }

        } else if (reason === DisconnectReason.connectionLost) {
          console.log(
            modules.color("[SYS]", "#EB6112"),
            modules.color(`[Session: ${session_name}] Connection Lost from Server, reconnecting...`, "#E6B0AA")
          );
          // Tambah delay sebelum reconnect untuk menghindari reconnect loop yang terlalu cepat
          await modules.sleep(3000);
          this.createSession(session_name);

        } else if (reason === DisconnectReason.connectionReplaced) {
          console.log(
            modules.color("[SYS]", "#EB6112"),
            modules.color(`[Session: ${session_name}] Connection Replaced, Another New Session Opened, Please Close Current Session First`, "#E6B0AA")
          );
          await this.updateStatusSessionDB(session_name, "STOPPED");
          this.cleanupOldClient();
          socket.emit("session-status", { session_name, status: "STOPPED" });
          return socket.emit("connection-status", {
            session_name,
            result: `[Session: ${session_name}] Connection Replaced, Another New Session Opened, Please Create QR Again`,
          });

        } else if (reason === DisconnectReason.loggedOut) {
          console.log(
            modules.color("[SYS]", "#EB6112"),
            modules.color(`Device Logged Out, Please Delete [Session: ${session_name}] and Scan Again.`, "#E6B0AA")
          );
          await this.updateStatusSessionDB(session_name, "STOPPED");
          this.deleteSession(session_name, false);
          return socket.emit("connection-status", { session_name, result: `[Session: ${session_name}] Device Logged Out, Please Create QR Again` });

        } else if (reason === DisconnectReason.restartRequired) {
          console.log(modules.color("[SYS]", "#EB6112"), modules.color(`[Session: ${session_name}] Restart Required, Restarting...`, "#E6B0AA"));
          this.createSession(session_name);

        } else if (reason === DisconnectReason.timedOut) {
          console.log(modules.color("[SYS]", "#EB6112"), modules.color(`[Session: ${session_name}] Connection TimedOut, Reconnecting...`, "#E6B0AA"));
          // Tambah delay sebelum reconnect
          await modules.sleep(3000);
          this.createSession(session_name);

        } else {
          console.log(
            modules.color("[SYS]", "#EB6112"),
            modules.color(`[Session: ${session_name}] Unknown DisconnectReason: ${reason}`, "#E6B0AA")
          );
          // Jangan panggil client.end() yang bisa throw error - cukup cleanup dan update status
          this.cleanupOldClient();
          await this.updateStatusSessionDB(session_name, "STOPPED");
          socket.emit("session-status", { session_name, status: "STOPPED" });
        }
      } else if (connection == "open") {
        await this.updateStatusSessionDB(session_name, "CONNECTED");
        socket.emit("session-status", { session_name, status: "CONNECTED" });
        console.log(
          modules.color("[SYS]", "#EB6112"),
          modules.color(moment().format("DD/MM/YY HH:mm:ss"), "#F8C471"),
          modules.color(`[Session: ${session_name}] Session is Now Connected - Baileys Version ${version}, isLatest : ${isLatest}`, "#82E0AA")
        );
      }
    });

    client.ev.on("messages.upsert", async ({ messages, type }) => {
      // Jika client ini sudah bukan client aktif, abaikan
      if (currentClient !== client) return;
      if (type !== "notify") return;
      const message = new Message(client, { messages, type }, session_name);
      message.mainHandler();
    });
  }
}

export default ConnectionSession;
