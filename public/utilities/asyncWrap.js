// Async error wrapper utility
// Wraps async route handlers to catch errors and pass them to next()
const asyncWrap = (fn) => {
  return (req, res, next) => {
    fn(req, res, next).catch(next);
  };
};

module.exports = asyncWrap;