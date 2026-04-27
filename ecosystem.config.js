module.exports = {
  apps: [
    {
      name: "backend",
      script: "./backend/server.js",
      env: {
        PORT: 3000,
        NODE_ENV: "production"
      }
    },
    {
      name: "frontend",
      script: "npm",
      args: "start",
      env: {
        PORT: 3001,
        HTTPS: 'true',
        SSL_CRT_FILE: 'ssl\\localhost.crt',
        SSL_KEY_FILE: 'ssl\\localhost.key',
        BROWSER: "none"
      },
      watch: false
    }
  ]
};
