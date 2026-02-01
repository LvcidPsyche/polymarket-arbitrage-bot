#!/usr/bin/env python3

"""
Machine Learning Opportunity Predictor for Arbitrage Trading
Uses historical data to improve opportunity detection and success rate prediction
"""

import json
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
from collections import defaultdict
import pickle
import os

class MLOpportunityPredictor:
    def __init__(self):
        self.model_file = 'opportunity_model.pkl'
        self.features_file = 'feature_cache.json'
        self.training_data_file = 'training_data.json'
        
        # Feature weights (will be learned from data)
        self.feature_weights = {
            'market_volatility': 0.2,
            'time_to_resolution': 0.25,
            'probability_spread': 0.3,
            'volume_ratio': 0.15,
            'historical_accuracy': 0.1
        }
        
        self.training_data = self.load_training_data()
        self.feature_cache = self.load_feature_cache()
        
    def load_training_data(self):
        """Load historical trading data for model training"""
        try:
            if os.path.exists(self.training_data_file):
                with open(self.training_data_file, 'r') as f:
                    return json.load(f)
            return {'opportunities': [], 'outcomes': []}
        except Exception as e:
            print(f"📛 Error loading training data: {e}")
            return {'opportunities': [], 'outcomes': []}
    
    def load_feature_cache(self):
        """Load cached feature calculations"""
        try:
            if os.path.exists(self.features_file):
                with open(self.features_file, 'r') as f:
                    return json.load(f)
            return {}
        except Exception as e:
            print(f"📛 Error loading feature cache: {e}")
            return {}
    
    def save_training_data(self):
        """Save training data to disk"""
        try:
            with open(self.training_data_file, 'w') as f:
                json.dump(self.training_data, f, indent=2)
        except Exception as e:
            print(f"📛 Error saving training data: {e}")
    
    def save_feature_cache(self):
        """Save feature cache to disk"""
        try:
            with open(self.features_file, 'w') as f:
                json.dump(self.feature_cache, f, indent=2)
        except Exception as e:
            print(f"📛 Error saving feature cache: {e}")
    
    def extract_features(self, opportunity):
        """Extract ML features from an arbitrage opportunity"""
        features = {}
        
        # Market volatility feature
        features['market_volatility'] = self.calculate_market_volatility(opportunity)
        
        # Time to resolution feature
        features['time_to_resolution'] = self.calculate_time_feature(opportunity)
        
        # Probability spread feature (how extreme the probability is)
        features['probability_spread'] = self.calculate_probability_spread(opportunity)
        
        # Volume ratio feature
        features['volume_ratio'] = self.calculate_volume_ratio(opportunity)
        
        # Historical accuracy for similar events
        features['historical_accuracy'] = self.calculate_historical_accuracy(opportunity)
        
        # Market maker activity
        features['mm_activity'] = self.calculate_mm_activity(opportunity)
        
        # Cross-platform spread
        features['cross_platform_spread'] = opportunity.get('cross_platform_spread', 0)
        
        # Event category confidence
        features['event_category'] = self.categorize_event(opportunity)
        
        return features
    
    def calculate_market_volatility(self, opportunity):
        """Calculate market volatility indicator"""
        try:
            # Use price changes and volume fluctuations
            price_history = opportunity.get('price_history', [])
            if len(price_history) < 2:
                return 0.5  # Default moderate volatility
            
            prices = [p['price'] for p in price_history[-10:]]  # Last 10 data points
            if len(prices) < 2:
                return 0.5
                
            # Calculate standard deviation of price changes
            price_changes = [abs(prices[i] - prices[i-1]) for i in range(1, len(prices))]
            volatility = np.std(price_changes) if price_changes else 0
            
            # Normalize to 0-1 scale
            return min(volatility * 10, 1.0)
            
        except Exception as e:
            print(f"⚠️ Error calculating volatility: {e}")
            return 0.5
    
    def calculate_time_feature(self, opportunity):
        """Calculate time-based features"""
        try:
            resolution_time = opportunity.get('resolution_time')
            if not resolution_time:
                return 0.5
            
            # Parse resolution time
            if isinstance(resolution_time, str):
                try:
                    resolution_dt = datetime.fromisoformat(resolution_time.replace('Z', '+00:00'))
                except:
                    return 0.5
            else:
                resolution_dt = datetime.fromtimestamp(resolution_time)
            
            time_remaining = (resolution_dt - datetime.now()).total_seconds()
            hours_remaining = time_remaining / 3600
            
            # Optimal arbitrage window: 1-48 hours
            if hours_remaining < 1:
                return 0.9  # Very close to resolution, high confidence but risky
            elif hours_remaining < 24:
                return 0.8  # Sweet spot
            elif hours_remaining < 48:
                return 0.6  # Good
            else:
                return 0.3  # Too far out, more uncertainty
                
        except Exception as e:
            print(f"⚠️ Error calculating time feature: {e}")
            return 0.5
    
    def calculate_probability_spread(self, opportunity):
        """Calculate how extreme the probability is (closer to 0 or 1 = better for arbitrage)"""
        try:
            prob = opportunity.get('probability', 0.5)
            # Distance from 0.5 (neutral), normalized
            spread = abs(prob - 0.5) * 2
            return spread
        except:
            return 0
    
    def calculate_volume_ratio(self, opportunity):
        """Calculate volume-based confidence"""
        try:
            volume = opportunity.get('volume', 0)
            avg_volume = opportunity.get('avg_volume', volume)
            
            if avg_volume == 0:
                return 0.5
            
            ratio = volume / avg_volume
            # Normalize to 0-1, higher volume = more confidence
            return min(ratio / 2, 1.0)
            
        except:
            return 0.5
    
    def calculate_historical_accuracy(self, opportunity):
        """Calculate historical accuracy for similar event types"""
        try:
            event_type = self.categorize_event(opportunity)
            similar_events = [
                o for o in self.training_data['opportunities'] 
                if self.categorize_event(o) == event_type
            ]
            
            if len(similar_events) < 3:
                return 0.5  # Default for new event types
            
            # Calculate success rate for similar events
            successful = sum(1 for i, event in enumerate(similar_events) 
                           if i < len(self.training_data['outcomes']) 
                           and self.training_data['outcomes'][i]['success'])
            
            return successful / len(similar_events)
            
        except:
            return 0.5
    
    def calculate_mm_activity(self, opportunity):
        """Detect market maker activity patterns"""
        try:
            # Look for signs of active market making
            bid_ask_spread = opportunity.get('bid_ask_spread', 0.02)
            order_book_depth = opportunity.get('order_book_depth', 0)
            
            # Tighter spreads and deeper books indicate active MMs
            mm_score = 0
            if bid_ask_spread < 0.01:  # Very tight spread
                mm_score += 0.4
            elif bid_ask_spread < 0.02:
                mm_score += 0.2
            
            if order_book_depth > 1000:  # Deep order book
                mm_score += 0.3
            elif order_book_depth > 100:
                mm_score += 0.1
            
            return mm_score
            
        except:
            return 0.2  # Default low MM activity
    
    def categorize_event(self, opportunity):
        """Categorize event type for pattern recognition"""
        try:
            title = opportunity.get('title', '').lower()
            description = opportunity.get('description', '').lower()
            text = f"{title} {description}"
            
            # Event categories with different success patterns
            if any(keyword in text for keyword in ['sports', 'nfl', 'nba', 'game', 'match']):
                return 'sports'
            elif any(keyword in text for keyword in ['election', 'political', 'vote', 'candidate']):
                return 'politics'
            elif any(keyword in text for keyword in ['economic', 'fed', 'rate', 'inflation', 'gdp']):
                return 'economics'
            elif any(keyword in text for keyword in ['weather', 'temperature', 'hurricane']):
                return 'weather'
            elif any(keyword in text for keyword in ['crypto', 'bitcoin', 'ethereum', 'price']):
                return 'crypto'
            else:
                return 'general'
                
        except:
            return 'general'
    
    def predict_success_probability(self, opportunity):
        """Predict probability that this arbitrage opportunity will be successful"""
        try:
            features = self.extract_features(opportunity)
            
            # Simple weighted scoring model (can be enhanced with proper ML later)
            score = 0
            for feature_name, value in features.items():
                if feature_name in self.feature_weights:
                    score += value * self.feature_weights[feature_name]
                else:
                    score += value * 0.05  # Small weight for unknown features
            
            # Apply category-specific adjustments
            category_multipliers = {
                'sports': 1.1,      # Sports events are more predictable
                'politics': 0.9,    # Political events can be volatile
                'economics': 1.0,   # Economic events are medium predictability
                'weather': 1.2,     # Weather events are very predictable short-term
                'crypto': 0.8,      # Crypto markets are volatile
                'general': 0.95     # General events, slight discount
            }
            
            event_category = features.get('event_category', 'general')
            score *= category_multipliers.get(event_category, 1.0)
            
            # Ensure score is between 0 and 1
            return max(0, min(score, 1.0))
            
        except Exception as e:
            print(f"⚠️ Error predicting success probability: {e}")
            return 0.5  # Default moderate confidence
    
    def rank_opportunities(self, opportunities):
        """Rank opportunities by predicted success probability"""
        try:
            scored_opportunities = []
            
            for opp in opportunities:
                success_prob = self.predict_success_probability(opp)
                expected_return = opp.get('expected_return', 0)
                
                # Calculate risk-adjusted score
                risk_adjusted_score = success_prob * expected_return
                
                scored_opportunities.append({
                    'opportunity': opp,
                    'success_probability': success_prob,
                    'expected_return': expected_return,
                    'risk_adjusted_score': risk_adjusted_score,
                    'features': self.extract_features(opp)
                })
            
            # Sort by risk-adjusted score (best opportunities first)
            scored_opportunities.sort(key=lambda x: x['risk_adjusted_score'], reverse=True)
            
            return scored_opportunities
            
        except Exception as e:
            print(f"📛 Error ranking opportunities: {e}")
            return [{'opportunity': opp, 'success_probability': 0.5} for opp in opportunities]
    
    def record_outcome(self, opportunity, outcome):
        """Record the outcome of an opportunity for model learning"""
        try:
            # Store opportunity and outcome for training
            self.training_data['opportunities'].append(opportunity)
            self.training_data['outcomes'].append({
                'timestamp': datetime.now().isoformat(),
                'success': outcome.get('success', False),
                'actual_return': outcome.get('actual_return', 0),
                'time_to_resolution': outcome.get('time_to_resolution', 0),
                'slippage': outcome.get('slippage', 0)
            })
            
            # Keep only recent data (last 1000 records)
            if len(self.training_data['opportunities']) > 1000:
                self.training_data['opportunities'] = self.training_data['opportunities'][-1000:]
                self.training_data['outcomes'] = self.training_data['outcomes'][-1000:]
            
            self.save_training_data()
            
            # Trigger model retraining if we have enough data
            if len(self.training_data['opportunities']) > 50 and \
               len(self.training_data['opportunities']) % 10 == 0:
                self.retrain_model()
                
        except Exception as e:
            print(f"📛 Error recording outcome: {e}")
    
    def retrain_model(self):
        """Retrain the model with latest data"""
        try:
            print("🧠 Retraining ML model with latest data...")
            
            if len(self.training_data['opportunities']) < 10:
                return
            
            # Analyze performance by feature
            feature_performance = defaultdict(list)
            
            for i, opportunity in enumerate(self.training_data['opportunities']):
                if i < len(self.training_data['outcomes']):
                    features = self.extract_features(opportunity)
                    outcome = self.training_data['outcomes'][i]
                    
                    for feature_name, feature_value in features.items():
                        feature_performance[feature_name].append({
                            'value': feature_value,
                            'success': outcome['success'],
                            'return': outcome['actual_return']
                        })
            
            # Update feature weights based on performance
            for feature_name, performances in feature_performance.items():
                if len(performances) > 5:  # Need minimum data
                    # Calculate correlation between feature value and success
                    values = [p['value'] for p in performances]
                    successes = [1 if p['success'] else 0 for p in performances]
                    
                    if len(set(values)) > 1:  # Feature has variation
                        correlation = np.corrcoef(values, successes)[0, 1]
                        if not np.isnan(correlation):
                            # Update weight based on correlation strength
                            self.feature_weights[feature_name] = abs(correlation) * 0.5
            
            # Normalize weights
            total_weight = sum(self.feature_weights.values())
            if total_weight > 0:
                for feature in self.feature_weights:
                    self.feature_weights[feature] /= total_weight
            
            print(f"✅ Model retrained with {len(self.training_data['opportunities'])} samples")
            print("📊 Updated feature weights:", 
                  {k: f"{v:.3f}" for k, v in self.feature_weights.items()})
            
        except Exception as e:
            print(f"📛 Error retraining model: {e}")
    
    def generate_insights_report(self):
        """Generate insights from historical data"""
        try:
            if len(self.training_data['opportunities']) < 5:
                return {"message": "Insufficient data for insights"}
            
            # Calculate overall performance metrics
            outcomes = self.training_data['outcomes']
            successful_trades = [o for o in outcomes if o['success']]
            
            success_rate = len(successful_trades) / len(outcomes) if outcomes else 0
            avg_return = np.mean([o['actual_return'] for o in outcomes]) if outcomes else 0
            avg_winning_return = np.mean([o['actual_return'] for o in successful_trades]) if successful_trades else 0
            
            # Analyze by event category
            category_performance = defaultdict(list)
            for i, opp in enumerate(self.training_data['opportunities']):
                if i < len(outcomes):
                    category = self.categorize_event(opp)
                    category_performance[category].append(outcomes[i])
            
            category_stats = {}
            for category, perfs in category_performance.items():
                if len(perfs) > 0:
                    cat_success_rate = sum(1 for p in perfs if p['success']) / len(perfs)
                    cat_avg_return = np.mean([p['actual_return'] for p in perfs])
                    category_stats[category] = {
                        'success_rate': cat_success_rate,
                        'avg_return': cat_avg_return,
                        'sample_size': len(perfs)
                    }
            
            return {
                'timestamp': datetime.now().isoformat(),
                'overall_performance': {
                    'total_trades': len(outcomes),
                    'success_rate': success_rate,
                    'avg_return': avg_return,
                    'avg_winning_return': avg_winning_return
                },
                'category_performance': category_stats,
                'feature_weights': self.feature_weights,
                'top_insights': self.generate_top_insights()
            }
            
        except Exception as e:
            print(f"📛 Error generating insights: {e}")
            return {"error": str(e)}
    
    def generate_top_insights(self):
        """Generate actionable insights from the data"""
        insights = []
        
        try:
            if len(self.training_data['opportunities']) < 10:
                return ["Need more data for meaningful insights"]
            
            # Analyze time patterns
            outcomes_with_time = []
            for i, opp in enumerate(self.training_data['opportunities']):
                if i < len(self.training_data['outcomes']):
                    time_feature = self.calculate_time_feature(opp)
                    outcomes_with_time.append({
                        'time_score': time_feature,
                        'success': self.training_data['outcomes'][i]['success']
                    })
            
            # Find optimal time windows
            high_time_scores = [o for o in outcomes_with_time if o['time_score'] > 0.7]
            if len(high_time_scores) > 3:
                high_time_success = sum(1 for o in high_time_scores if o['success']) / len(high_time_scores)
                if high_time_success > 0.6:
                    insights.append(f"🎯 Opportunities near resolution (< 24hrs) have {high_time_success:.1%} success rate")
            
            # Analyze category performance
            category_perf = {}
            for i, opp in enumerate(self.training_data['opportunities']):
                if i < len(self.training_data['outcomes']):
                    category = self.categorize_event(opp)
                    if category not in category_perf:
                        category_perf[category] = []
                    category_perf[category].append(self.training_data['outcomes'][i]['success'])
            
            for category, successes in category_perf.items():
                if len(successes) > 3:
                    success_rate = sum(successes) / len(successes)
                    if success_rate > 0.7:
                        insights.append(f"🏆 {category.title()} events show {success_rate:.1%} success rate")
                    elif success_rate < 0.4:
                        insights.append(f"⚠️ {category.title()} events have low {success_rate:.1%} success rate")
            
            # Feature importance insights
            top_feature = max(self.feature_weights.items(), key=lambda x: x[1])
            insights.append(f"📊 Most important predictor: {top_feature[0].replace('_', ' ').title()}")
            
            return insights[:5]  # Return top 5 insights
            
        except Exception as e:
            return [f"Error generating insights: {e}"]

# CLI interface
if __name__ == "__main__":
    import sys
    
    predictor = MLOpportunityPredictor()
    
    if len(sys.argv) < 2:
        print("ML Opportunity Predictor v1.0")
        print("Usage:")
        print("  python ml_opportunity_predictor.py insights  - Generate insights report")
        print("  python ml_opportunity_predictor.py retrain  - Retrain model")
        sys.exit(1)
    
    command = sys.argv[1]
    
    if command == 'insights':
        print("🧠 ML INSIGHTS REPORT")
        print("====================")
        report = predictor.generate_insights_report()
        print(json.dumps(report, indent=2))
        
    elif command == 'retrain':
        predictor.retrain_model()
        
    else:
        print(f"Unknown command: {command}")