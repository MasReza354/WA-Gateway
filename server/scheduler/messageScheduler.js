import ScheduledMessageDatabase from "../database/db/scheduledMessage.db.js";
import { getAllSessions } from "../session/Session.js";

const scheduledDb = new ScheduledMessageDatabase();

// Check and send scheduled messages every minute
export function startScheduler() {
    setInterval(async () => {
        try {
            const pendingMessages = await scheduledDb.getPendingMessages();
            const now = new Date();

            for (const msg of pendingMessages) {
                const scheduledTime = new Date(msg.scheduled_at);
                
                if (scheduledTime <= now) {
                    try {
                        const sessions = getAllSessions();
                        
                        if (sessions && sessions.sendMessage && sessions.isStop === false) {
                            const jid = msg.target.includes("@") ? msg.target : `${msg.target}@s.whatsapp.net`;
                            
                            await sessions.sendMessage(jid, { text: msg.message });
                            await scheduledDb.updateStatus(msg.id, "sent", new Date());
                        } else {
                            await scheduledDb.updateStatus(msg.id, "failed");
                        }
                    } catch (error) {
                        await scheduledDb.updateStatus(msg.id, "failed");
                    }
                }
            }
        } catch (error) {
            // Error handling
        }
    }, 60000);
}
