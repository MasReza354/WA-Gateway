import fs from "fs";
import express from "express";
import SessionDatabase from "../../database/db/session.db.js";
import { AutoReply } from "../../database/db/messageRespon.db.js";
import HistoryMessage from "../../database/db/history.db.js";
import ScheduledMessageDatabase from "../../database/db/scheduledMessage.db.js";
import { getAllSessions, getQRCodeStore } from "../../session/Session.js";
const router = express.Router();

const { SESSION_PATH, LOG_PATH } = process.env;
const scheduledDb = new ScheduledMessageDatabase();

const db = new SessionDatabase();

router.get("/", async (req, res) => {
	let sessionCheck = fs.readdirSync(SESSION_PATH).filter((x) => x != "store")[0];
	let session_name = sessionCheck ? sessionCheck : null;
	let loggerPath = fs.existsSync(`${LOG_PATH}/${session_name}.txt`) ? `${LOG_PATH.replace("./public/", "")}/${session_name}.txt` : null;
	const session = session_name ? await db.findOneSessionDB(session_name) : null;
	res.render("dashboard/dashboard", {
		loggerPath,
		session,
		session_name,
		layout: "layouts/main",
	});
});

router.get("/send-message", async (req, res) => {
	const session = await db.findAllSessionDB();
	res.render("dashboard/sendMessage", {
		session,
		layout: "layouts/main",
	});
});

router.get("/auto-reply", async (req, res) => {
	const session = await db.findAllSessionDB();
	const replyList = await new AutoReply().checkReplyMessage();
	res.render("dashboard/autoReply", {
		session,
		replyList,
		layout: "layouts/main",
	});
});

router.get("/api-doc", async (req, res) => {
	res.render("dashboard/apidoc", {
		layout: "layouts/main",
	});
});

router.get("/history-message", async (req, res) => {
	let db = await new HistoryMessage().getAllMessage();
	res.render("dashboard/history", {
		layout: "layouts/main",
		db,
	});
});

// Scheduled Messages Page
router.get("/scheduled", async (req, res) => {
	const sessions = await db.findAllSessionDB();
	const scheduled = await scheduledDb.getAllScheduledMessages();
	res.render("dashboard/scheduled", {
		layout: "layouts/main",
		sessions,
		scheduled,
	});
});

// Multi-Session Management Page
router.get("/sessions", async (req, res) => {
	const sessions = await db.findAllSessionDB();
	res.render("dashboard/sessions", {
		layout: "layouts/main",
		sessions,
	});
});

// WhatsApp Channel Guide
router.get("/channel-guide", (req, res) => {
	res.render("dashboard/channelGuide", {
		layout: "layouts/main",
	});
});

// API: Get real-time session status
router.get("/api/session-status", async (req, res) => {
	try {
		const sessions = await db.findAllSessionDB();
		const allSessions = getAllSessions();
		
		const status = sessions.map(session => {
			const isActive = allSessions && Object.keys(allSessions).length > 0;
			return {
				...session.toJSON(),
				isActive,
				realTimeStatus: isActive ? "CONNECTED" : session.status
			};
		});
		
		res.json({ status: 200, sessions: status });
	} catch (error) {
		res.json({ status: 500, message: error.message });
	}
});

// API: Get QR Code for session
router.get("/api/qr-code/:session_name", async (req, res) => {
	try {
		const { session_name } = req.params;
		const qrStore = getQRCodeStore();
		const qrData = qrStore[session_name];
		
		if (qrData) {
			res.json({ status: 200, qr: qrData });
		} else {
			res.json({ status: 404, message: "QR Code not found" });
		}
	} catch (error) {
		res.json({ status: 500, message: error.message });
	}
});

// Channel Management Page
router.get("/channels", async (req, res) => {
	res.render("dashboard/channels", {
		layout: "layouts/main",
	});
});

export default router;
