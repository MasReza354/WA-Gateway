import { sequelize } from "../../config/Database.js";

const History = sequelize.define(
	"History",
	{
		session_name: {
			type: "STRING",
			allowNull: false,
		},
		target: {
			type: "STRING",
			allowNull: false,
		},
		type: {
			type: "STRING",
			allowNull: false,
		},
		date: {
			type: "STRING",
			allowNull: false,
		},
		caption: {
			type: "STRING",
			allowNull: false,
		},
	},
	{ tableName: "historys", timestamps: false }
);

export default History;
