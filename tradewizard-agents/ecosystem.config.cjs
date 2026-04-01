/**
 * PM2 Ecosystem Configuration for TradeWizard Automated Market Monitor
 * 
 * Usage:
 *   pm2 start ecosystem.config.cjs
 *   pm2 stop tradewizard-monitor
 *   pm2 restart tradewizard-monitor
 *   pm2 logs tradewizard-monitor
 *   pm2 monit
 */

module.exports = {
  apps: [
    {
      // Application configuration
      name: 'tradewizard-monitor',
      script: './dist/monitor.js',
      cwd: '/opt/tradewizard-agents',
      
      // Execution mode
      instances: 1,
      exec_mode: 'fork',
      
      // Environment
      env: {
        NODE_ENV: 'production',
        LOG_LEVEL: 'info'
      },
      
      // Restart policy
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      restart_delay: 5000,
      
      // Logging
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      
      // Advanced features
      watch: false,
      ignore_watch: ['node_modules', 'logs', '.git'],
      
      // Resource limits
      max_memory_restart: '1G',
      
      // Graceful shutdown
      kill_timeout: 30000,
      wait_ready: true,
      listen_timeout: 10000,
      
      // Health monitoring
      health_check: {
        enabled: true,
        interval: 30000,
        timeout: 10000,
        url: 'http://localhost:3000/health'
      },
      
      // Cron restart (optional - restart daily at 3 AM)
      cron_restart: '0 3 * * *',
      
      // Source map support
      source_map_support: true,
      
      // Instance variables
      instance_var: 'INSTANCE_ID'
    }
  ],
  
  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'tradewizard',
      host: ['your-server.com'],
      ref: 'origin/main',
      repo: 'git@github.com:your-org/tradewizard.git',
      path: '/opt/tradewizard-agents',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.cjs --env production',
      'pre-setup': 'mkdir -p /opt/tradewizard-agents/logs'
    },
    staging: {
      user: 'tradewizard',
      host: ['staging-server.com'],
      ref: 'origin/develop',
      repo: 'git@github.com:your-org/tradewizard.git',
      path: '/opt/tradewizard-agents-staging',
      'post-deploy': 'npm ci && npm run build && pm2 reload ecosystem.config.cjs --env staging',
      env: {
        NODE_ENV: 'staging',
        LOG_LEVEL: 'debug'
      }
    }
  }
};
