#!/usr/bin/env node

/**
 * Agent Intelligence Query Engine
 * Provides core functions for agent reputation, discovery, and threat detection
 * Designed to work both standalone (with cache) and connected to backend
 */

const fs = require('fs');
const path = require('path');

class IntelligenceEngine {
  constructor(config = {}) {
    this.config = {
      backend_url: config.backend_url || process.env.INTELLIGENCE_BACKEND_URL,
      cache_dir: config.cache_dir || path.join(process.env.HOME, '.cache/agent-intelligence'),
      use_cache: config.use_cache !== false,
      ...config
    };
    
    this.ensureCacheDir();
    this._cache = {};
  }

  ensureCacheDir() {
    if (!fs.existsSync(this.config.cache_dir)) {
      fs.mkdirSync(this.config.cache_dir, { recursive: true });
    }
  }

  /**
   * Search agents by name, platform, or reputation range
   */
  async searchAgents(query) {
    if (!query || typeof query !== 'object') {
      throw new Error('Query must be an object with properties: name, platform, min_score, max_score, limit');
    }

    const { name, platform, min_score, max_score, limit = 10 } = query;

    try {
      // Try backend first
      if (this.config.backend_url) {
        return await this._queryBackend('/api/agents/search', query);
      }
    } catch (error) {
      // Fall back to cache
    }

    // Fallback: search cache
    return this._searchCache(query);
  }

  /**
   * Get detailed agent profile with reputation breakdown
   */
  async getAgent(agent_id) {
    if (!agent_id) throw new Error('agent_id required');

    try {
      if (this.config.backend_url) {
        return await this._queryBackend(`/api/agents/${agent_id}`);
      }
    } catch (error) {
      // Fall back to cache
    }

    return this._getFromCache('agents', agent_id);
  }

  /**
   * Get reputation score for agent (0-100)
   */
  async getReputation(agent_id) {
    if (!agent_id) throw new Error('agent_id required');

    const agent = await this.getAgent(agent_id);
    if (!agent) return null;

    return {
      agent_id,
      name: agent.name,
      platform: agent.platform,
      composite_score: agent.reputation?.composite_score || 0,
      breakdown: agent.reputation?.breakdown || {},
      last_updated: agent.reputation?.last_updated
    };
  }

  /**
   * Check if agent is flagged as threat (sock puppet, spam, scam)
   */
  async checkThreats(agent_id) {
    if (!agent_id) throw new Error('agent_id required');

    try {
      if (this.config.backend_url) {
        return await this._queryBackend(`/api/threats/${agent_id}`);
      }
    } catch (error) {
      // Fall back to cache
    }

    const threatCache = this._getThreatsCache() || {};
    const agentThreats = threatCache[agent_id] || [];
    
    return {
      agent_id,
      threats: agentThreats,
      is_flagged: agentThreats.length > 0,
      severity: this._calculateSeverity(agentThreats)
    };
  }

  /**
   * Get leaderboard: top agents by reputation
   */
  async getLeaderboard(options = {}) {
    const { platform, limit = 20, offset = 0 } = options;

    try {
      if (this.config.backend_url) {
        return await this._queryBackend('/api/leaderboards/reputation', {
          platform,
          limit,
          offset
        });
      }
    } catch (error) {
      // Fall back to cache
    }

    const leaderboard = this._getFromCache('leaderboards', 'composite') || [];
    return leaderboard
      .filter(a => !platform || a.platform === platform)
      .slice(offset, offset + limit)
      .map((agent, idx) => ({
        rank: offset + idx + 1,
        ...agent
      }));
  }

  /**
   * Get trending topics and agents
   */
  async getTrends() {
    try {
      if (this.config.backend_url) {
        return await this._queryBackend('/api/trends');
      }
    } catch (error) {
      // Fall back to cache
    }

    return this._getFromCache('trends', 'current') || {
      topics: [],
      rising_agents: [],
      trending_posts: [],
      timestamp: null
    };
  }

  /**
   * Link cross-platform accounts (identity resolution)
   */
  async linkIdentities(agent_id) {
    if (!agent_id) throw new Error('agent_id required');

    try {
      if (this.config.backend_url) {
        return await this._queryBackend(`/api/identities/${agent_id}`);
      }
    } catch (error) {
      // Fall back to cache
    }

    const identityCache = this._getFromCache('identities', agent_id) || {};
    return {
      primary_id: agent_id,
      linked_accounts: identityCache.linked_accounts || [],
      confidence: identityCache.confidence || 0,
      is_multi_account: (identityCache.linked_accounts || []).length > 0
    };
  }

  // ===== INTERNAL METHODS =====

  async _queryBackend(endpoint, params = {}) {
    if (!this.config.backend_url) throw new Error('No backend configured');

    const url = new URL(endpoint, this.config.backend_url);
    Object.entries(params).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        url.searchParams.append(key, JSON.stringify(value));
      }
    });

    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
      timeout: 5000
    });

    if (!response.ok) {
      throw new Error(`Backend error: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  _searchCache(query) {
    const cacheFile = path.join(this.config.cache_dir, 'agents.json');
    let agents = [];
    
    if (fs.existsSync(cacheFile)) {
      try {
        const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
        agents = data.all || Object.values(data).filter(a => a.id);
      } catch (error) {
        // Cache corrupted, return empty
      }
    }

    const { name, platform, min_score, max_score, limit = 10 } = query;

    return agents
      .filter(agent => {
        if (name && !agent.name.toLowerCase().includes(name.toLowerCase())) return false;
        if (platform && agent.platform !== platform) return false;
        if (min_score && (agent.reputation?.composite_score || 0) < min_score) return false;
        if (max_score && (agent.reputation?.composite_score || 0) > max_score) return false;
        return true;
      })
      .sort((a, b) => (b.reputation?.composite_score || 0) - (a.reputation?.composite_score || 0))
      .slice(0, limit);
  }

  _getFromCache(category, key) {
    const cacheFile = path.join(this.config.cache_dir, `${category}.json`);
    
    if (!fs.existsSync(cacheFile)) return null;

    try {
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
      return key === 'all' ? data : (data[key] || null);
    } catch (error) {
      return null;
    }
  }

  _getThreatsCache() {
    const cacheFile = path.join(this.config.cache_dir, 'threats.json');
    
    if (!fs.existsSync(cacheFile)) return {};

    try {
      return JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    } catch (error) {
      return {};
    }
  }

  _calculateSeverity(threats) {
    if (threats.length === 0) return 'clear';
    if (threats.some(t => t.severity === 'critical')) return 'critical';
    if (threats.some(t => t.severity === 'high')) return 'high';
    if (threats.some(t => t.severity === 'medium')) return 'medium';
    return 'low';
  }

  updateCache(category, data) {
    const cacheFile = path.join(this.config.cache_dir, `${category}.json`);
    fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
  }

  getCacheStats() {
    const stats = {};
    const files = fs.readdirSync(this.config.cache_dir);
    
    files.forEach(file => {
      if (file.endsWith('.json')) {
        const filePath = path.join(this.config.cache_dir, file);
        const size = fs.statSync(filePath).size;
        stats[file] = { size, updated_at: fs.statSync(filePath).mtime };
      }
    });

    return stats;
  }
}

// CLI Interface
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];
  const engine = new IntelligenceEngine();

  (async () => {
    try {
      switch (command) {
        case 'search':
          console.log(JSON.stringify(
            await engine.searchAgents(JSON.parse(args[1] || '{}')),
            null, 2
          ));
          break;

        case 'agent':
          console.log(JSON.stringify(
            await engine.getAgent(args[1]),
            null, 2
          ));
          break;

        case 'reputation':
          console.log(JSON.stringify(
            await engine.getReputation(args[1]),
            null, 2
          ));
          break;

        case 'threats':
          console.log(JSON.stringify(
            await engine.checkThreats(args[1]),
            null, 2
          ));
          break;

        case 'leaderboard':
          console.log(JSON.stringify(
            await engine.getLeaderboard(JSON.parse(args[1] || '{}')),
            null, 2
          ));
          break;

        case 'trends':
          console.log(JSON.stringify(
            await engine.getTrends(),
            null, 2
          ));
          break;

        case 'identities':
          console.log(JSON.stringify(
            await engine.linkIdentities(args[1]),
            null, 2
          ));
          break;

        case 'cache':
          console.log(JSON.stringify(engine.getCacheStats(), null, 2));
          break;

        default:
          console.error('Usage: query_engine.js <command> [args]');
          console.error('Commands: search, agent, reputation, threats, leaderboard, trends, identities, cache');
          process.exit(1);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  })();
}

module.exports = IntelligenceEngine;
