module.exports = {
  apps: [{
    name: 'seals-mes-api',
    script: './dist/server.js',
    instances: 2,
    exec_mode: 'cluster',
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    merge_logs: true,
    watch: false,
    max_restarts: 10,
    restart_delay: 5000
  }]
}
