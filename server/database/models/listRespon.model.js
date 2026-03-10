import { sequelize } from "../../config/Database.js";

const ListResponseModel = sequelize.define(
	"ListResponse",
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
	{ tableName: "listresponses", timestamps: true }
);

export default ListResponseModel;
