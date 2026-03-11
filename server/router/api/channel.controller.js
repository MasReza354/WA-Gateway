import ChannelDatabase from "../../database/db/channel.db.js";

const channelDb = new ChannelDatabase();

export class ChannelController {
	async getChannels(req, res) {
		try {
			const channels = await channelDb.findAllChannels();
			return res.status(200).json({
				status: 200,
				data: channels
			});
		} catch (error) {
			console.log(error);
			return res.status(500).json({
				status: 500,
				message: "Internal Server Error"
			});
		}
	}

	async createChannel(req, res) {
		try {
			const { session_name, channel_id, channel_name, description } = req.body;
			
			if (!session_name || !channel_id || !channel_name) {
				return res.status(400).json({
					status: 400,
					message: "Session name, Channel ID, and Channel name are required!"
				});
			}

			// Check if channel already exists
			const existing = await channelDb.findAllChannels();
			if (existing.find(c => c.channel_id === channel_id)) {
				return res.status(400).json({
					status: 400,
					message: "Channel ID already exists!"
				});
			}

			const channel = await channelDb.createChannel(session_name, channel_id, channel_name, description || "");
			
			return res.status(200).json({
				status: 200,
				message: "Channel saved successfully!",
				data: channel
			});
		} catch (error) {
			console.log(error);
			return res.status(500).json({
				status: 500,
				message: "Internal Server Error"
			});
		}
	}

	async updateChannel(req, res) {
		try {
			const { id, channel_name, description } = req.body;
			
			if (!id || !channel_name) {
				return res.status(400).json({
					status: 400,
					message: "Channel ID and name are required!"
				});
			}

			const updated = await channelDb.updateChannel(id, channel_name, description);
			
			if (updated) {
				return res.status(200).json({
					status: 200,
					message: "Channel updated successfully!"
				});
			} else {
				return res.status(404).json({
					status: 404,
					message: "Channel not found!"
				});
			}
		} catch (error) {
			console.log(error);
			return res.status(500).json({
				status: 500,
				message: "Internal Server Error"
			});
		}
	}

	async deleteChannel(req, res) {
		try {
			const { id } = req.query;
			
			if (!id) {
				return res.status(400).json({
					status: 400,
					message: "Channel ID is required!"
				});
			}

			const deleted = await channelDb.deleteChannel(id);
			
			if (deleted) {
				return res.status(200).json({
					status: 200,
					message: "Channel deleted successfully!"
				});
			} else {
				return res.status(404).json({
					status: 404,
					message: "Channel not found!"
				});
			}
		} catch (error) {
			console.log(error);
			return res.status(500).json({
				status: 500,
				message: "Internal Server Error"
			});
		}
	}
}

export default ChannelController;
