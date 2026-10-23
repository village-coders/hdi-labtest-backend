module.exports = {
  apps: [
    {
      name: 'hdi-labtest-backend',
      script: 'dist/server.js',
      instances: 1, // Keep 1 instance to prevent duplicate cron reminder emails
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 5005,
      },
    },
  ],
};
