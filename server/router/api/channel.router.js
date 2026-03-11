import express from "express";
import ChannelController from "./channel.controller.js";

const router = express.Router();
const controller = new ChannelController();

router.get("/channels", controller.getChannels.bind(controller));
router.post("/channels/create", controller.createChannel.bind(controller));
router.post("/channels/update", controller.updateChannel.bind(controller));
router.get("/channels/delete", controller.deleteChannel.bind(controller));

export default router;
