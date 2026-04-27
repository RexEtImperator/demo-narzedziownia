function getClientIp(req) {
  return req.headers['x-forwarded-for'] || req.socket.remoteAddress;
}

const validateString = (str, minLength = 1) => typeof str === 'string' && str.trim().length >= minLength;

module.exports = { getClientIp, validateString };
