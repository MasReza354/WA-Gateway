import { sequelize } from "../../config/Database.js";

const ButtonResponseModel = sequelize.define(
	"ButtonResponse",
	{
		session_name: {
			type: "STRING",
			allowNull: false,
		},
		target_number: {
			type: "STRING",
			allowNull: false,
		},
		msg_id: {
			type: "STRING",
			allowNull: false,
		},
		keyword: {
			type: "STRING",
			allowNull: false,
		},
		response: {
			type: "STRING",
			allowNull: false,
		},
	},
	{ tableName: "buttonresponses", timestamps: true }
);

export default ButtonResponseModel;
