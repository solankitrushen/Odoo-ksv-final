const levels = { error: 0, warn: 1, info: 2, debug: 3 };
const currentLevel =
  levels[process.env.LOG_LEVEL?.toLowerCase()] ?? levels.info;

function log(level, message, meta = {}) {
  if (levels[level] > currentLevel) return;
  const entry = {
    time: new Date().toISOString(),
    level,
    message,
    ...meta,
  };
  const line = JSON.stringify(entry);
  if (level === "error") console.error(line);
  else console.log(line);
}

export const logger = {
  error: (msg, meta) => log("error", msg, meta),
  warn: (msg, meta) => log("warn", msg, meta),
  info: (msg, meta) => log("info", msg, meta),
  debug: (msg, meta) => log("debug", msg, meta),
};

export default logger;
