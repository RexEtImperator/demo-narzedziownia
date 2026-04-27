const NodeCache = require('node-cache');
const myCache = new NodeCache({ stdTTL: 60 }); // default 60s TTL

const cacheMiddleware = (duration) => (req, res, next) => {
  if (req.method !== 'GET') {
    return next();
  }
  const url = req.originalUrl || req.url || '';
  const userPart = req.user ? `u:${req.user.id || req.user.username || req.user.role || 'unknown'}` : 'anon';
  const key = `__express__:${userPart}:${url}`;
  const cachedBody = myCache.get(key);
  if (cachedBody) {
    res.send(cachedBody);
    return;
  } else {
    res.sendResponse = res.send;
    res.send = (body) => {
      myCache.set(key, body, duration);
      res.sendResponse(body);
    };
    next();
  }
};

const clearCache = (urlPath) => {
  const keys = myCache.keys();
  const prefix = `__express__:`;
  keys.forEach(key => {
    if (key.includes(urlPath)) {
      myCache.del(key);
    }
  });
};

module.exports = { cacheMiddleware, clearCache };
