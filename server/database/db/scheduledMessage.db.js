import ScheduledMessage from "../models/scheduledMessage.model.js";

class ScheduledMessageDatabase {
    async createScheduledMessage(data) {
        return await ScheduledMessage.create(data);
    }

    async getAllScheduledMessages() {
        return await ScheduledMessage.findAll({ order: [["scheduled_at", "ASC"]] });
    }

    async getPendingMessages() {
        return await ScheduledMessage.findAll({
            where: { status: "pending" },
            order: [["scheduled_at", "ASC"]],
        });
    }

    async getScheduledMessageById(id) {
        return await ScheduledMessage.findByPk(id);
    }

    async updateStatus(id, status, sent_at = null) {
        return await ScheduledMessage.update(
            { status, sent_at },
            { where: { id } }
        );
    }

    async deleteScheduledMessage(id) {
        return await ScheduledMessage.destroy({ where: { id } });
    }

    async deleteAllScheduledMessages() {
        return await ScheduledMessage.destroy({ where: {} });
    }
}

export default ScheduledMessageDatabase;
