module.exports = {
    apps: [
      {
        name: 'dashboard',
        script: 'node_modules/next/dist/bin/next',
        args: 'start',
        watch: false,
        env: {
          NODE_ENV: 'production',
          PORT: 3003,
        },
      },
    ],
  };