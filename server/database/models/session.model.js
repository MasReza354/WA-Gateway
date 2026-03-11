import { DataTypes } from "sequelize";
import { sequelize } from "../../config/Database.js";

const Session = sequelize.define(
	"Session",
	{
		session_name: {
			type: DataTypes.STRING,
			unique: true,
			primaryKey: true,
			allowNull: false,
		},
		session_number: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		status: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		mode_chat: {
			type: DataTypes.BOOLEAN,
			defaultValue: true,
		},
		mode_channel: {
			type: DataTypes.BOOLEAN,
			defaultValue: true,
		},
	},
	{ tableName: "sessions", timestamps: true }
);

Session.removeAttribute("id");

export default Session;
