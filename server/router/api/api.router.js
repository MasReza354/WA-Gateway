import express from "express";
const router = express.Router();

import ControllerApi from "./api.controller.js";
import ScheduledMessageDatabase from "../../database/db/scheduledMessage.db.js";

const controller = new ControllerApi();
const scheduledDb = new ScheduledMessageDatabase();

router.get("/", (req, res) => {
	res.send("okee");
});

router.get("/session", controller.getSessions.bind(controller));

router.post("/sendtext", controller.sendText.bind(controller));
router.post("/sendmedia", controller.sendMedia.bind(controller));
router.post("/sendsticker", controller.sendSticker.bind(controller));
router.post("/sendcontact", controller.sendContact.bind(controller));
router.post("/sendbutton", controller.sendButton.bind(controller));
router.post("/sendlist", controller.sendListMessage.bind(controller));
router.post("/sendlocation", controller.sendLocation.bind(controller));
router.post("/sendproduct", controller.sendProduct.bind(controller));

// WhatsApp Channel/Newsletter API
router.post("/sendnewsletter", controller.sendNewsletter.bind(controller));
router.post("/sendnewslettermedia", controller.sendNewsletterMedia.bind(controller));
router.post("/validate-channel", controller.validateChannel.bind(controller));
router.get("/debug-session", controller.debugSession.bind(controller));

router.get("/del-history", controller.deleteHistory.bind(controller));
router.get("/delall-history", controller.deleteAllHistory.bind(controller));

// Scheduled Messages API
router.post("/schedule/add", async (req, res) => {
	try {
		const { session_name, target, message, scheduled_at } = req.body;
		if (!session_name || !target || !message || !scheduled_at) {
			return res.json({ status: 400, message: "Data tidak lengkap" });
		}
		await scheduledDb.createScheduledMessage({
			session_name,
			target,
			message,
			scheduled_at: new Date(scheduled_at),
			status: "pending"
		});
		res.json({ status: 200, message: "Pesan dijadwalkan" });
	} catch (error) {
		res.json({ status: 500, message: error.message });
	}
});

router.get("/schedule/cancel", async (req, res) => {
	try {
		const { id } = req.query;
		await scheduledDb.updateStatus(id, "cancelled");
		res.json({ status: 200, message: "Jadwal dibatalkan" });
	} catch (error) {
		res.json({ status: 500, message: error.message });
	}
});

router.get("/schedule/delete", async (req, res) => {
	try {
		const { id } = req.query;
		await scheduledDb.deleteScheduledMessage(id);
		res.json({ status: 200, message: "Jadwal dihapus" });
	} catch (error) {
		res.json({ status: 500, message: error.message });
	}
});

export default router;
