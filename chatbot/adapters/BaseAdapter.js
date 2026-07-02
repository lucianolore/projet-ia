// Abstract base adapter - extend this for new data sources

class BaseAdapter {
  constructor(name, config = {}) {
    this.name = name;
    this.config = config;
    this.cache = new Map();
  }

  async execute(toolName, params) {
    throw new Error(`execute() not implemented for ${this.name}.${toolName}`);
  }

  // Utility: simple cache with TTL (ms)
  cacheGet(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expires) {
      this.cache.delete(key);
      return null;
    }
    return entry.value;
  }

  cacheSet(key, value, ttlMs = 3600000) {
    this.cache.set(key, {
      value,
      expires: Date.now() + ttlMs,
    });
  }

  // Utility: merge results from multiple adapters
  static mergeResults(results) {
    return results.reduce((acc, r) => ({ ...acc, ...r }), {});
  }

  // Utility: error wrapper
  static formatError(err) {
    return {
      error: err.message,
      code: err.code || 'UNKNOWN',
      retry: err.retryable || false,
    };
  }
}

module.exports = BaseAdapter;
