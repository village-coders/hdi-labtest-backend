module.exports = {
  apps: [
    {
      name: 'hdi-backend',
      script: 'dist/server.js',
      instances: 1, // Keep 1 instance to avoid duplicate cron job executions
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
      },
    },
  ],
};
