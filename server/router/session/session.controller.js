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
				if (fs.readdirSync(this.sessionPath).length < 2) {
					if (!fs.existsSync(`${this.sessionPath}/${session_name}`)) {
						this.createSession(session_name);
						req.flash("side", "Success Create Session, Scan QR Now!");
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
      req.flash("error_msg", `Something Wrong`);
      return res.redirect(endpoint);
    }
  }

  async startOneSession(req, res) {
    try {
      let { session } = req.query;
      if (session) {
        const client = this.getClient();
        const isEmpty = !client || !client.client;
        const isStopped = client && client.isStop === true;
        const isUnstable = client && client.client && client.isStop === undefined;

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
      res.send({ status: 500, message: "Something Wrong" });
    }
  }

  async stopOneSession(req, res) {
    try {
      let { session } = req.query;
      if (session) {
        const client = this.getClient();
        const hasClient = client && client.client && Object.keys(client).length > 0;
        // Gunakan strict === false agar undefined tidak lolos
        const isActive = hasClient && client.isStop === false;

        if (isActive) {
          if (fs.existsSync(`${this.sessionPath}/${session}`)) {
            client.isStop = true;
            try {
              if (client.client && client.client.ws) {
                await client.client.ws.close();
              }
            } catch (wsError) {
              // WebSocket mungkin sudah tertutup, tetap lanjutkan
            }
            return res.send({ status: 200, message: `Success Stop Session ${session}` });
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
      res.send({ status: 500, message: "Something Wrong" });
    }
  }

  async deleteUserSession(req, res) {
    let endpoint = "/dashboard";
    try {
      let { session } = req.params;
      if (session) {
        await this.deleteSession(session);
        req.flash("success_msg", `Success Delete Session ${session}!`);
        return res.redirect(endpoint);
      } else {
        req.flash("error_msg", `Input Data`);
        return res.redirect(endpoint);
      }
    } catch (error) {
      req.flash("error_msg", `Something Wrong`);
      return res.redirect(endpoint);
    }
  }
}

export default ControllerUser;
