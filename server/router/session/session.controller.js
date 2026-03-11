import fs from "fs";
import ConnectionSession from "../../session/Session.js";

class ControllerUser extends ConnectionSession {
	constructor() {
		super();
	}

  async createOneSession(req, res) {
    let endpoint = `/dashboard`;
    try {
      let { session_name } = req.body;
      if (session_name) {
        if (fs.readdirSync(this.sessionPath).filter(x => x !== 'store').length < 2) {
          if (!fs.existsSync(`${this.sessionPath}/${session_name}`)) {
            fs.mkdirSync(`${this.sessionPath}/${session_name}`, { recursive: true });
            req.flash("side", `Success Create Session ${session_name}, Click Generate QR to Start!`);
            return res.redirect(endpoint);
          } else {
            req.flash("error_msg", `Can't Create a Session With the Name ${session_name}, Because that Name Already Exists`);
            return res.redirect(endpoint);
          }
        } else {
          req.flash("error_msg", `Can't create more than one session`);
          return res.redirect(endpoint);
        }
      }
    } catch (error) {
      console.log(error);
      req.flash("error_msg", `Something Wrong`);
      return res.redirect(endpoint);
    }
  }

  async generateQRSession(req, res) {
    try {
      let { session } = req.query;
      if (session) {
        const client = this.getClient();
        const hasClient = client && client.client;
        
        if (hasClient) {
          return res.send({ status: 403, message: `Session is already running, stop it first!` });
        }
        
        if (fs.existsSync(`${this.sessionPath}/${session}`)) {
          await this.createSession(session);
          return res.send({ status: 200, message: `QR Code generating for Session ${session}` });
        } else {
          return res.send({ status: 404, message: `Session ${session} Folder Not Found!` });
        }
      } else {
        res.send({ status: 400, message: "Input Data!" });
      }
    } catch (error) {
      console.log(error);
      res.send({ status: 500, message: "Something Wrong" });
    }
  }

	async startOneSession(req, res) {
		try {
			let { session } = req.query;
			if (session) {
				const client = this.getClient();
				const isEmpty = !client || (Object.keys(client).length === 0 && client.constructor === Object);
				const isStopped = client && client.isStop === true;
				// Juga izinkan start jika isStop undefined (session dalam keadaan tidak stabil)
				const isUnstable = client && Object.keys(client).length > 0 && client.isStop === undefined;

				if (isEmpty || isStopped || isUnstable) {
					if (fs.existsSync(`${this.sessionPath}/${session}`)) {
						await this.createSession(session);
						return res.send({ status: 200, message: `Success Start Session ${session}` });
					} else {
						return res.send({ status: 404, message: `Session ${session} Folder Not Found!` });
					}
				} else {
					return res.send({ status: 403, message: `Session is already active before!` });
				}
			} else {
				res.send({ status: 400, message: "Input Data!" });
			}
		} catch (error) {
			console.log(error);
			res.send({ status: 500, message: "Something Wrong" });
		}
	}

	async stopOneSession(req, res) {
		try {
			let { session } = req.query;
			if (session) {
				const client = this.getClient();
				const hasClient = client && Object.keys(client).length > 0;
				// Gunakan strict === false agar undefined tidak lolos
				const isActive = hasClient && client.isStop === false;

				if (isActive) {
					if (fs.existsSync(`${this.sessionPath}/${session}`)) {
						client.isStop = true;
						try {
							await client.ws.close();
						} catch (wsError) {
							// WebSocket mungkin sudah tertutup, tetap lanjutkan
							console.log(`[SYS] WebSocket close warning: ${wsError.message}`);
						}
						return res.send({ status: 200, message: `Success Stopped Session ${session}` });
					} else {
						return res.send({ status: 404, message: `Session ${session} Folder Not Found!` });
					}
				} else if (!hasClient) {
					return res.send({ status: 403, message: `Tidak ada session aktif saat ini!` });
				} else {
					return res.send({ status: 403, message: `Session sudah dalam keadaan berhenti!` });
				}
			} else {
				res.send({ status: 400, message: "Input Data!" });
			}
		} catch (error) {
			console.log(error);
			res.send({ status: 500, message: "Something Wrong" });
		}
	}

  async deleteUserSession(req, res) {
    let endpoint = "/dashboard";
    try {
      let { session } = req.params;
      if (session) {
        await this.deleteSession(session, true);
        req.flash("success_msg", `Success Delete Session ${session}!`);
        return res.redirect(endpoint);
      } else {
        req.flash("error_msg", `Input Data`);
        return res.redirect(endpoint);
      }
    } catch (error) {
      console.log(error);
      req.flash("error_msg", `Something Wrong`);
      return res.redirect(endpoint);
    }
  }

  async updateSessionMode(req, res) {
    try {
      let { session, mode_chat, mode_channel } = req.body;
      if (!session) {
        return res.send({ status: 400, message: "Session required!" });
      }
      
      const chatMode = mode_chat === true || mode_chat === "true" || mode_chat === "on";
      const channelMode = mode_channel === true || mode_channel === "true" || mode_channel === "on";
      
      const db = new (await import('../../database/db/session.db.js')).default();
      const updated = await db.updateSessionMode(session, chatMode, channelMode);
      
      if (updated) {
        return res.send({ 
          status: 200, 
          message: "Session mode updated",
          data: { mode_chat: chatMode, mode_channel: channelMode }
        });
      } else {
        return res.send({ status: 404, message: "Session not found!" });
      }
    } catch (error) {
      console.log(error);
      return res.send({ status: 500, message: "Internal Server Error" });
    }
  }
}

export default ControllerUser;
