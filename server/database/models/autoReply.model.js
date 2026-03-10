import { sequelize } from "../../config/Database.js";

const AutoReplyModel = sequelize.define(
	"AutoReply",
	{
		session_name: {
			type: "STRING",
			allowNull: false,
		},
		session_number: {
			type: "STRING",
			allowNull: false,
		},
		keyword: {
			type: "STRING",
			allowNull: false,
		},
		date: {
			type: "STRING",
			allowNull: false,
		},
		response: {
			type: "STRING",
			allowNull: false,
		},
	},
	{ tableName: "autoreplys", timestamps: true }
);

export default AutoReplyModel;
