module.exports = {
  apps: [
    {
      name: 'seals-mes-server',
      script: 'dist/server.js',
      cwd: './server',
      // Windows 开发环境: fork 模式（单进程）
      // Linux 生产环境: 改为 instances: 'max', exec_mode: 'cluster'
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '1G',
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000
      }
    }
  ]
};
