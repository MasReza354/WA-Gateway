import { sequelize } from "../../config/Database.js";

const ScheduledMessage = sequelize.define(
    "ScheduledMessage",
    {
        id: {
            type: "INTEGER",
            primaryKey: true,
            autoIncrement: true,
        },
        session_name: {
            type: "STRING",
            allowNull: false,
        },
        target: {
            type: "STRING",
            allowNull: false,
        },
        message: {
            type: "TEXT",
            allowNull: false,
        },
        scheduled_at: {
            type: "DATE",
            allowNull: false,
        },
        status: {
            type: "STRING",
            defaultValue: "pending",
        },
        sent_at: {
            type: "DATE",
            allowNull: true,
        },
    },
    { tableName: "scheduled_messages", timestamps: true }
);

export default ScheduledMessage;
