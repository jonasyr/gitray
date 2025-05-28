/* eslint-env node */
/* eslint-disable no-undef */
module.exports = {
  beforeRequest: (requestParams, context, ee, next) => {
    requestParams.headers = requestParams.headers || {};
    requestParams.headers['X-Request-ID'] =
      `perf-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return next();
  },
  afterResponse: (requestParams, response, context, ee, next) => {
    if (response.timings && response.timings.response > 5000) {
      console.log(
        `Slow request detected: ${requestParams.url} took ${response.timings.response}ms`
      );
    }
    if (response.headers['x-cache-status']) {
      context.vars.cacheStatus = response.headers['x-cache-status'];
    }
    return next();
  },
};
