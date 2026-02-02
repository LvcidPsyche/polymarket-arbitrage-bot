#!/usr/bin/env node

/**
 * Test suite for Agent Intelligence Query Engine
 */

const IntelligenceEngine = require('./query_engine.js');
const fs = require('fs');
const path = require('path');

class TestRunner {
  constructor() {
    this.engine = new IntelligenceEngine({ use_cache: true });
    this.tests_passed = 0;
    this.tests_failed = 0;
    this.setup();
  }

  setup() {
    // Create sample cache data
    const sampleAgents = [
      {
        id: 'alice_dev',
        name: 'Alice Dev',
        platform: 'moltx',
        handle: '@alice_dev',
        bio: 'AI developer and agent researcher',
        reputation: {
          composite_score: 85,
          breakdown: {
            moltbook_activity: 80,
            moltx_influence: 90,
            clawchan_community: 70,
            engagement_quality: 88,
            security_record: 95,
            longevity: 75
          }
        },
        metrics: {
          posts_count: 250,
          followers: 5000,
          following: 200,
          avg_engagement: 12.5
        }
      },
      {
        id: 'bob_trader',
        name: 'Bob Trader',
        platform: 'moltbook',
        handle: 'bob_trader',
        bio: 'Token analysis and trading',
        reputation: {
          composite_score: 45,
          breakdown: {
            moltbook_activity: 50,
            moltx_influence: 30,
            clawchan_community: 40,
            engagement_quality: 45,
            security_record: 85,
            longevity: 30
          }
        },
        metrics: {
          posts_count: 50,
          followers: 500,
          following: 100,
          avg_engagement: 3.2
        }
      },
      {
        id: 'charlie_bot',
        name: 'Charlie Bot',
        platform: '4claw',
        handle: 'charlie_bot',
        bio: 'Automated trading bot',
        reputation: {
          composite_score: 15,
          breakdown: {
            moltbook_activity: 10,
            moltx_influence: 5,
            clawchan_community: 20,
            engagement_quality: 12,
            security_record: 0,
            longevity: 5
          }
        },
        metrics: {
          posts_count: 1000,
          followers: 100,
          following: 10,
          avg_engagement: 0.5
        }
      }
    ];

    const sampleThreats = {
      charlie_bot: [
        { type: 'sock_puppet', severity: 'high', description: 'Multi-account network detected' }
      ]
    };

    const sampleTrends = {
      current: {
        topics: [
          { topic: 'AGI', posts_count: 234, sentiment: 'positive' },
          { topic: 'meme_tokens', posts_count: 567, sentiment: 'neutral' }
        ],
        rising_agents: [
          { id: 'alice_dev', name: 'Alice Dev', score_change: 5, new_followers: 200 }
        ],
        trending_posts: []
      }
    };

    const sampleLeaderboard = {
      composite: sampleAgents
        .sort((a, b) => b.reputation.composite_score - a.reputation.composite_score)
    };

    this.engine.updateCache('agents', { all: sampleAgents, ...sampleAgents.reduce((acc, a) => ({ ...acc, [a.id]: a }), {}) });
    this.engine.updateCache('threats', sampleThreats);
    this.engine.updateCache('trends', sampleTrends);
    this.engine.updateCache('leaderboards', sampleLeaderboard);
  }

  assert(condition, message) {
    if (condition) {
      this.tests_passed++;
      console.log(`  ✅ ${message}`);
    } else {
      this.tests_failed++;
      console.error(`  ❌ ${message}`);
    }
  }

  async run() {
    console.log('\n🦀 Agent Intelligence - Test Suite\n');

    await this.testSearch();
    await this.testGetAgent();
    await this.testGetReputation();
    await this.testCheckThreats();
    await this.testGetLeaderboard();
    await this.testGetTrends();
    await this.testLinkIdentities();

    console.log(`\n📊 Results: ${this.tests_passed} passed, ${this.tests_failed} failed\n`);
    
    if (this.tests_failed > 0) {
      process.exit(1);
    }
  }

  async testSearch() {
    console.log('Test: searchAgents()');
    
    const results = await this.engine.searchAgents({
      min_score: 40,
      limit: 10
    });

    this.assert(Array.isArray(results), 'Returns array');
    this.assert(results.length > 0, 'Returns results');
    this.assert(results[0].reputation.composite_score >= 40, 'Filters by min_score');
    this.assert(results.length <= 10, 'Respects limit');
  }

  async testGetAgent() {
    console.log('\nTest: getAgent()');
    
    const agent = await this.engine.getAgent('alice_dev');

    this.assert(agent !== null, 'Returns agent');
    this.assert(agent.id === 'alice_dev', 'Correct agent ID');
    this.assert(agent.reputation !== undefined, 'Has reputation data');
    this.assert(agent.reputation.composite_score === 85, 'Correct score');
  }

  async testGetReputation() {
    console.log('\nTest: getReputation()');
    
    const rep = await this.engine.getReputation('alice_dev');

    this.assert(rep !== null, 'Returns reputation');
    this.assert(rep.composite_score === 85, 'Correct composite score');
    this.assert(rep.breakdown !== undefined, 'Has breakdown');
    this.assert(Object.keys(rep.breakdown).length > 0, 'Breakdown has factors');
  }

  async testCheckThreats() {
    console.log('\nTest: checkThreats()');
    
    const clean = await this.engine.checkThreats('alice_dev');
    this.assert(clean.is_flagged === false, 'Clean agent not flagged');
    this.assert(clean.severity === 'clear', 'Clean agent has clear severity');

    const threat = await this.engine.checkThreats('charlie_bot');
    this.assert(threat.is_flagged === true, 'Threat agent is flagged');
    this.assert(threat.severity === 'high', 'Threat agent has high severity');
    this.assert(threat.threats.length > 0, 'Threat agent has threat list');
  }

  async testGetLeaderboard() {
    console.log('\nTest: getLeaderboard()');
    
    const leaderboard = await this.engine.getLeaderboard({ limit: 5 });

    this.assert(Array.isArray(leaderboard), 'Returns array');
    this.assert(leaderboard.length > 0, 'Has results');
    this.assert(leaderboard[0].rank === 1, 'First entry ranked #1');
    
    for (let i = 0; i < leaderboard.length - 1; i++) {
      this.assert(
        leaderboard[i].reputation.composite_score >= leaderboard[i+1].reputation.composite_score,
        `Leaderboard sorted (position ${i} >= ${i+1})`
      );
    }
  }

  async testGetTrends() {
    console.log('\nTest: getTrends()');
    
    const trends = await this.engine.getTrends();

    this.assert(trends !== null, 'Returns trends object');
    this.assert(Array.isArray(trends.topics), 'Has topics array');
    this.assert(Array.isArray(trends.rising_agents), 'Has rising_agents array');
    this.assert(trends.timestamp !== null, 'Has timestamp');
  }

  async testLinkIdentities() {
    console.log('\nTest: linkIdentities()');
    
    const identities = await this.engine.linkIdentities('alice_dev');

    this.assert(identities !== null, 'Returns identity data');
    this.assert(identities.primary_id === 'alice_dev', 'Correct primary ID');
    this.assert(Array.isArray(identities.linked_accounts), 'Has linked_accounts array');
    this.assert(typeof identities.confidence === 'number', 'Has confidence score');
  }
}

// Run tests
if (require.main === module) {
  const runner = new TestRunner();
  runner.run().catch(error => {
    console.error('Test error:', error);
    process.exit(1);
  });
}

module.exports = TestRunner;
