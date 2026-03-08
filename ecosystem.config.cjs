module.exports = {
    apps: [
        {
            name: "wa-gateway",
            script: "./server/config/index.js",
            watch: false,
            instances: 1, // atau biarkan 1 untuk WA Bot agar tidak bentrok session
            exec_mode: "fork",
            env: {
                NODE_ENV: "production",
                PORT: 8080 // pastikan ini sesuai dengan yg dipakai di .env
            }
        }
    ]
};
