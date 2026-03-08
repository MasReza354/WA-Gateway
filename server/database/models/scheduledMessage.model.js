import { DataTypes } from "sequelize";
import { sequelize } from "../../config/Database.js";

const ScheduledMessage = sequelize.define(
    "ScheduledMessage",
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
        target: {
            type: DataTypes.STRING,
            allowNull: false,
        },
        message: {
            type: DataTypes.TEXT,
            allowNull: false,
        },
        scheduled_at: {
            type: DataTypes.DATE,
            allowNull: false,
        },
        status: {
            type: DataTypes.STRING,
            defaultValue: "pending", // pending, sent, failed, cancelled
        },
        sent_at: {
            type: DataTypes.DATE,
            allowNull: true,
        },
    },
    { tableName: "scheduled_messages", timestamps: true }
);

export default ScheduledMessage;
