import "dotenv/config";
import moment from "moment-timezone";
import { Server } from "socket.io";
import { modules } from "../../lib/index.js";
import SessionDatabase from "../database/db/session.db.js";
import ConnectionSession from "../session/Session.js";
import App from "./App.js";
import { connectDatabase } from "./Database.js";
import ScheduledMessage from "../database/models/scheduledMessage.model.js";
import Channel from "../database/models/channel.model.js";
import { startScheduler } from "../scheduler/messageScheduler.js";

const server = new App();

const { SESSION_NAME, AUTO_START } = process.env;

const serverHttp = server.app.listen(server.PORT, async () => {
	await connectDatabase();
	
	// Sync ScheduledMessage table
	await ScheduledMessage.sync();
	
	// Sync Session table (add new columns: mode_chat, mode_channel)
	const Session = (await import('../database/models/session.model.js')).default;
	await Session.sync({ alter: true });
	
	// Sync Channel table
	await Channel.sync({ alter: true });
	
	// Start message scheduler
	startScheduler();
	
	// Sync sessions from folder to database
	await new ConnectionSession().syncSessionsFromFolder();
	
	if (AUTO_START == "y") {
		await new ConnectionSession().createSession(SESSION_NAME);
	} else {
		await new SessionDatabase().startProgram();
	}
	console.log(modules.color("[APP]", "#EB6112"), modules.color(moment().format("DD/MM/YY HH:mm:ss"), "#F8C471"), modules.color(`App Listening at http://localhost:${server.PORT}`, "#82E0AA"));
});

const io = new Server(serverHttp);
const socket = io.on("connection", (socket) => {
	socket.on("disconnect", () => {
		console.log("Socket Disconnect");
	});
	return socket;
});

export { socket, moment };
