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
      args: "run start:prod",
      env: {
        PORT: 3001,
        NODE_ENV: "production",
        BROWSER: "none"
      },
      watch: false
    }
  ]
};
