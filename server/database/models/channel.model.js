import { DataTypes } from "sequelize";
import { sequelize } from "../../config/Database.js";

const Channel = sequelize.define(
	"Channel",
	{
		id: {
			type: DataTypes.INTEGER,
			primaryKey: true,
			autoIncrement: true,
		},
		session_name: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		channel_id: {
			type: DataTypes.STRING,
			allowNull: false,
			unique: true,
		},
		channel_name: {
			type: DataTypes.STRING,
			allowNull: false,
		},
		description: {
			type: DataTypes.TEXT,
			allowNull: true,
		},
	},
	{ tableName: "channels", timestamps: true }
);

export default Channel;
