import Channel from "../models/channel.model.js";

class ChannelDatabase {
	constructor() {
		this.channel = Channel;
	}

	async createChannel(session_name, channel_id, channel_name, description = "") {
		return await this.channel.create({ 
			session_name, 
			channel_id, 
			channel_name,
			description 
		});
	}

	async findAllChannels() {
		const array = await this.channel.findAll({
			order: [['createdAt', 'DESC']]
		});
		return Array.isArray(array) ? array : [];
	}

	async findChannelsBySession(session_name) {
		return await this.channel.findAll({
			where: { session_name },
			order: [['createdAt', 'DESC']]
		});
	}

	async findOneChannel(id) {
		return await this.channel.findByPk(id);
	}

	async updateChannel(id, channel_name, description) {
		const channel = await this.channel.findByPk(id);
		if (channel) {
			await channel.update({ channel_name, description });
			return true;
		}
		return false;
	}

	async deleteChannel(id) {
		const channel = await this.channel.findByPk(id);
		if (channel) {
			await channel.destroy();
			return true;
		}
		return false;
	}

	async deleteAllChannels() {
		return await this.channel.destroy({ where: {} });
	}
}

export default ChannelDatabase;
