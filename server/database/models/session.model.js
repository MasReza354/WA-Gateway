import { sequelize } from "../../config/Database.js";

const Session = sequelize.define(
	"Session",
	{
		session_name: {
			type: "STRING",
			unique: true,
			primaryKey: true,
			allowNull: false,
		},
		session_number: {
			type: "STRING",
			allowNull: false,
		},
		status: {
			type: "STRING",
			allowNull: false,
		},
	},
	{ tableName: "sessions", timestamps: true }
);

Session.removeAttribute("id");

export default Session;
