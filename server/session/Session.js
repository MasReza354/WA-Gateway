import WASocket, { Browsers, DisconnectReason, fetchLatestBaileysVersion, makeInMemoryStore, useMultiFileAuthState } from "@whiskeysockets/baileys";
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

// Tracking untuk cleanup resource
let storeInterval = null;
let currentClient = null;
let currentSessionName = null;

// Export all sessions
export function getAllSessions() {
  return sessions;
}

class ConnectionSession extends SessionDatabase {
  constructor() {
    super();
    this.sessionPath = SESSION_PATH;
    this.logPath = LOG_PATH;
    this.count = 0;
  }

  getClient() {
    return sessions && sessions.client ? sessions : null;
  }

  /**
   * Membersihkan resource dari client lama sebelum membuat yang baru.
   * Mencegah memory leak dari event listener dan setInterval yang menumpuk.
   */
  cleanupOldClient() {
    // Clear store write interval
    if (storeInterval) {
      clearInterval(storeInterval);
      storeInterval = null;
    }

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

  async deleteSession(session_name) {
    // Cleanup resource terlebih dahulu
    this.cleanupOldClient();

    if (fs.existsSync(`${this.sessionPath}/${session_name}`)) fs.rmSync(`${this.sessionPath}/${session_name}`, { force: true, recursive: true });
    if (fs.existsSync(`${this.sessionPath}/store/${session_name}.json`)) fs.unlinkSync(`${this.sessionPath}/store/${session_name}.json`);
    if (fs.existsSync(`${this.logPath}/${session_name}.txt`)) fs.unlinkSync(`${this.logPath}/${session_name}.txt`);
    await this.deleteSessionDB(session_name);
    sessions = {};
    currentClient = null;
    currentSessionName = null;
  }

  async generateQr(input, session_name) {
    let rawData = await qrcode.toDataURL(input, { scale: 8 });
    let dataBase64 = rawData.replace(/^data:image\/png;base64,/, "");
    await modules.sleep(3000);
    socket.emit(`update-qr`, { buffer: dataBase64, session_name });
    this.count++;
    console.log(
      modules.color("[SYS]", "#EB6112"),
      modules.color(`[Session: ${session_name}] Open the browser, a qr has appeared on the website, scan it now!`, "#E6B0AA")
    );
    console.log(`QR Count: ${this.count}`);
  }

  async createSession(session_name) {
    // Cleanup client lama sebelum membuat yang baru (mencegah memory leak)
    this.cleanupOldClient();

    // Reset QR count untuk session baru
    this.count = 0;
    
    // Set session name saat ini
    currentSessionName = session_name;

    const sessionDir = `${this.sessionPath}/${session_name}`;
    const storePath = `${this.sessionPath}/store/${session_name}.json`;
    let { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    const options = {
      printQRInTerminal: false,
      auth: state,
      logger: pino({ level: "silent" }),
      browser: Browsers.macOS("Safari"),
      version,
    };

    const store = makeInMemoryStore({});
    store.readFromFile(storePath);

    const client = WASocket.default(options);

    // Simpan interval reference agar bisa di-clear nanti
    storeInterval = setInterval(() => {
      store.writeToFile(storePath);
    }, 10_000);
    store.bind(client.ev);

    // Simpan reference ke client saat ini
    currentClient = client;
    sessions = { client, isStop: false, sessionName: session_name };

    client.ev.on("creds.update", saveCreds);
    client.ev.on("connection.update", async (update) => {
      // Jika client ini sudah bukan client aktif, abaikan event-nya
      if (currentClient !== client || currentSessionName !== session_name) {
        console.log(`[SYS] Ignoring connection update for old client/session: ${session_name}`);
        try { 
          client.ev.removeAllListeners("connection.update");
          client.ev.removeAllListeners("creds.update");
          client.ev.removeAllListeners("messages.upsert");
        } catch (e) {}
        return;
      }

      if (this.count >= 3) {
        console.log(`[SYS] QR count reached limit (${this.count}), canceling session`);
        this.deleteSession(session_name);
        socket.emit("connection-status", { session_name, result: "No Response, QR Scan Canceled" });
        console.log(`Count : ${this.count}, QR Stopped!`);
        return;
      }

      if (update.qr) {
        console.log(`[SYS] QR received for session: ${session_name}, attempt: ${this.count + 1}`);
        this.generateQr(update.qr, session_name);
      }

      if (update.isNewLogin) {
        await this.createSessionDB(session_name, client.authState.creds.me.id.split(":")[0]);
        let files = `${this.logPath}/${session_name}.txt`;
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
          // Cleanup resources dulu sebelum delete
          this.cleanupOldClient();
          // Hapus session
          if (fs.existsSync(`${this.sessionPath}/${session_name}`)) {
            fs.rmSync(`${this.sessionPath}/${session_name}`, { force: true, recursive: true });
          }
          sessions = {};
          currentClient = null;
          currentSessionName = null;
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
          this.cleanupOldClient();
          sessions = {};
          currentClient = null;
          currentSessionName = null;
          return socket.emit("connection-status", {
            session_name,
            result: `[Session: ${session_name}] Connection Replaced, Another New Session Opened, Please Create QR Again`,
          });

        } else if (reason === DisconnectReason.loggedOut) {
          console.log(
            modules.color("[SYS]", "#EB6112"),
            modules.color(`Device Logged Out, Please Delete [Session: ${session_name}] and Scan Again.`, "#E6B0AA")
          );
          this.cleanupOldClient();
          if (fs.existsSync(`${this.sessionPath}/${session_name}`)) {
            fs.rmSync(`${this.sessionPath}/${session_name}`, { force: true, recursive: true });
          }
          sessions = {};
          currentClient = null;
          currentSessionName = null;
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
      if (currentClient !== client || currentSessionName !== session_name) return;
      if (type !== "notify") return;
      const message = new Message(client, { messages, type }, session_name);
      message.mainHandler();
    });
  }
}

export default ConnectionSession;
