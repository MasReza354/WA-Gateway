import ScheduledMessageDatabase from "../database/db/scheduledMessage.db.js";
import { getAllSessions } from "../session/Session.js";

const scheduledDb = new ScheduledMessageDatabase();

// Check and send scheduled messages every minute
export function startScheduler() {
    console.log("[Scheduler] Message scheduler started");
    
    setInterval(async () => {
        try {
            const pendingMessages = await scheduledDb.getPendingMessages();
            const now = new Date();

            for (const msg of pendingMessages) {
                const scheduledTime = new Date(msg.scheduled_at);
                
                // If scheduled time has passed
                if (scheduledTime <= now) {
                    console.log(`[Scheduler] Sending scheduled message to ${msg.target}`);
                    
                    try {
                        const sessions = getAllSessions();
                        
                        // sessions di-spread dari baileys client, jadi sendMessage ada di level atas
                        // Juga pastikan session tidak sedang dalam keadaan stop
                        if (sessions && sessions.sendMessage && sessions.isStop === false) {
                            const jid = msg.target.includes("@") ? msg.target : `${msg.target}@s.whatsapp.net`;
                            
                            await sessions.sendMessage(jid, { text: msg.message });
                            
                            await scheduledDb.updateStatus(msg.id, "sent", new Date());
                            console.log(`[Scheduler] Message sent successfully to ${msg.target}`);
                        } else {
                            await scheduledDb.updateStatus(msg.id, "failed");
                            console.log(`[Scheduler] Session ${msg.session_name} not connected`);
                        }
                    } catch (error) {
                        await scheduledDb.updateStatus(msg.id, "failed");
                        console.log(`[Scheduler] Failed to send message: ${error.message}`);
                    }
                }
            }
        } catch (error) {
            console.log(`[Scheduler] Error: ${error.message}`);
        }
    }, 60000); // Check every 60 seconds
}

export default { startScheduler };
