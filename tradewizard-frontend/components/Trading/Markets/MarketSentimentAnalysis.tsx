"use client";

import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Activity, Users, MessageSquare, Calendar } from "lucide-react";
import Card from "@/components/shared/Card";
import { formatNumber } from "@/utils/formatting";

interface SentimentData {
  overall: 'bullish' | 'bearish' | 'neutral';
  score: number; // -1 to 1
  confidence: number; // 0 to 1
  sources: {
    news: { sentiment: number; articles: number; };
    social: { sentiment: number; mentions: number; };
    trading: { sentiment: number; volume: number; };
  };
  trends: {
    hourly: number[];
    daily: number[];
  };
  keyMentions: {
    text: string;
    source: string;
    timestamp: string;
    sentiment: 'positive' | 'negative' | 'neutral';
  }[];
}

interface MarketSentimentAnalysisProps {
  conditionId: string | null;
  marketQuestion: string;
}

export default function MarketSentimentAnalysis({ 
  conditionId, 
  marketQuestion 
}: MarketSentimentAnalysisProps) {
  const [sentimentData, setSentimentData] = useState<SentimentData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!conditionId) return;

    const fetchSentimentData = async () => {
      setIsLoading(true);
      setError(null);

      try {
        // This would be replaced with actual API call to sentiment analysis service
        // For now, we'll simulate the data
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const mockData: SentimentData = {
          overall: Math.random() > 0.5 ? 'bullish' : 'bearish',
          score: (Math.random() - 0.5) * 2, // -1 to 1
          confidence: 0.6 + Math.random() * 0.3, // 0.6 to 0.9
          sources: {
            news: {
              sentiment: (Math.random() - 0.5) * 2,
              articles: Math.floor(Math.random() * 50) + 10
            },
            social: {
              sentiment: (Math.random() - 0.5) * 2,
              mentions: Math.floor(Math.random() * 1000) + 100
            },
            trading: {
              sentiment: (Math.random() - 0.5) * 2,
              volume: Math.floor(Math.random() * 100000) + 10000
            }
          },
          trends: {
            hourly: Array.from({ length: 24 }, () => (Math.random() - 0.5) * 2),
            daily: Array.from({ length: 7 }, () => (Math.random() - 0.5) * 2)
          },
          keyMentions: [
            {
              text: "Strong momentum building ahead of the deadline",
              source: "Twitter",
              timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
              sentiment: 'positive'
            },
            {
              text: "Market conditions suggest uncertainty in the outcome",
              source: "Reddit",
              timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
              sentiment: 'negative'
            },
            {
              text: "Technical analysis points to continued volatility",
              source: "News",
              timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
              sentiment: 'neutral'
            }
          ]
        };

        setSentimentData(mockData);
      } catch (err) {
        setError('Failed to load sentiment data');
        console.error('Sentiment analysis error:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSentimentData();
  }, [conditionId]);

  if (!conditionId) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-400">
          <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>Sentiment analysis not available</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-6">
        <div className="animate-pulse space-y-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-indigo-500/20 rounded-full" />
            <div className="h-6 bg-white/10 rounded w-48" />
          </div>
          <div className="grid grid-cols-3 gap-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-white/10 rounded w-full" />
                <div className="h-8 bg-white/10 rounded w-full" />
              </div>
            ))}
          </div>
        </div>
      </Card>
    );
  }

  if (error || !sentimentData) {
    return (
      <Card className="p-6">
        <div className="text-center text-gray-400">
          <Activity className="w-12 h-12 mx-auto mb-3 text-red-400" />
          <p className="font-medium text-white">Sentiment Analysis Unavailable</p>
          <p className="text-sm mt-1">{error || 'No sentiment data available'}</p>
        </div>
      </Card>
    );
  }

  const getSentimentColor = (sentiment: number) => {
    if (sentiment > 0.2) return 'text-green-400 bg-green-500/20 border-green-500/30';
    if (sentiment < -0.2) return 'text-red-400 bg-red-500/20 border-red-500/30';
    return 'text-gray-400 bg-white/5 border-white/10';
  };

  const getSentimentIcon = (sentiment: number) => {
    if (sentiment > 0.2) return <TrendingUp className="w-4 h-4" />;
    if (sentiment < -0.2) return <TrendingDown className="w-4 h-4" />;
    return <Activity className="w-4 h-4" />;
  };

  const formatSentiment = (score: number) => {
    const percentage = Math.abs(score * 100);
    const direction = score > 0 ? 'Bullish' : score < 0 ? 'Bearish' : 'Neutral';
    return `${direction} ${percentage.toFixed(0)}%`;
  };

  const getMentionSentimentColor = (sentiment: 'positive' | 'negative' | 'neutral') => {
    switch (sentiment) {
      case 'positive': return 'border-l-green-400 bg-green-500/10';
      case 'negative': return 'border-l-red-400 bg-red-500/10';
      default: return 'border-l-gray-400 bg-white/5';
    }
  };

  const timeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diffInHours = Math.floor((now.getTime() - time.getTime()) / (1000 * 60 * 60));
    
    if (diffInHours < 1) return 'Just now';
    if (diffInHours === 1) return '1 hour ago';
    if (diffInHours < 24) return `${diffInHours} hours ago`;
    
    const diffInDays = Math.floor(diffInHours / 24);
    if (diffInDays === 1) return '1 day ago';
    return `${diffInDays} days ago`;
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-4 border-b border-white/10 bg-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Activity className="w-5 h-5 text-indigo-400" />
            <h3 className="font-semibold text-white">Market Sentiment</h3>
          </div>
          <div className={`px-3 py-1 rounded-full text-sm font-medium border ${getSentimentColor(sentimentData.score)}`}>
            <div className="flex items-center gap-1">
              {getSentimentIcon(sentimentData.score)}
              {formatSentiment(sentimentData.score)}
            </div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-6">
        {/* Overall Sentiment Score */}
        <div className="text-center">
          <div className="relative w-32 h-32 mx-auto mb-4">
            <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="rgba(255, 255, 255, 0.1)"
                strokeWidth="8"
              />
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke={sentimentData.score > 0 ? '#10b981' : sentimentData.score < 0 ? '#ef4444' : '#6b7280'}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${Math.abs(sentimentData.score) * 314} 314`}
                className="transition-all duration-1000 ease-out"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <div className="text-2xl font-bold text-white">
                  {(Math.abs(sentimentData.score) * 100).toFixed(0)}%
                </div>
                <div className="text-xs text-gray-400 uppercase tracking-wide">
                  {sentimentData.overall}
                </div>
              </div>
            </div>
          </div>
          <div className="text-sm text-gray-400">
            Confidence: {(sentimentData.confidence * 100).toFixed(0)}%
          </div>
        </div>

        {/* Source Breakdown */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-gray-300">Sentiment Sources</h4>
          <div className="grid grid-cols-1 gap-3">
            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-center gap-3">
                <MessageSquare className="w-4 h-4 text-indigo-400" />
                <div>
                  <div className="font-medium text-sm text-white">News Articles</div>
                  <div className="text-xs text-gray-400">
                    {sentimentData.sources.news.articles} articles analyzed
                  </div>
                </div>
              </div>
              <div className={`px-2 py-1 rounded text-xs font-medium border ${getSentimentColor(sentimentData.sources.news.sentiment)}`}>
                {formatSentiment(sentimentData.sources.news.sentiment)}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-center gap-3">
                <Users className="w-4 h-4 text-purple-400" />
                <div>
                  <div className="font-medium text-sm text-white">Social Media</div>
                  <div className="text-xs text-gray-400">
                    {formatNumber(sentimentData.sources.social.mentions)} mentions
                  </div>
                </div>
              </div>
              <div className={`px-2 py-1 rounded text-xs font-medium border ${getSentimentColor(sentimentData.sources.social.sentiment)}`}>
                {formatSentiment(sentimentData.sources.social.sentiment)}
              </div>
            </div>

            <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/10">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-4 h-4 text-green-400" />
                <div>
                  <div className="font-medium text-sm text-white">Trading Activity</div>
                  <div className="text-xs text-gray-400">
                    ${formatNumber(sentimentData.sources.trading.volume)} volume
                  </div>
                </div>
              </div>
              <div className={`px-2 py-1 rounded text-xs font-medium border ${getSentimentColor(sentimentData.sources.trading.sentiment)}`}>
                {formatSentiment(sentimentData.sources.trading.sentiment)}
              </div>
            </div>
          </div>
        </div>

        {/* Sentiment Trend */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-gray-300">24-Hour Trend</h4>
          <div className="h-16 flex items-end justify-between gap-1">
            {sentimentData.trends.hourly.slice(-12).map((value, index) => (
              <div
                key={index}
                className={`w-full rounded-t ${
                  value > 0 ? 'bg-green-500' : value < 0 ? 'bg-red-500' : 'bg-gray-400'
                }`}
                style={{
                  height: `${Math.max(4, Math.abs(value) * 32 + 4)}px`,
                  opacity: 0.7 + Math.abs(value) * 0.3
                }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-gray-400">
            <span>12h ago</span>
            <span>Now</span>
          </div>
        </div>

        {/* Key Mentions */}
        <div className="space-y-3">
          <h4 className="font-medium text-sm text-gray-300">Recent Mentions</h4>
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {sentimentData.keyMentions.map((mention, index) => (
              <div
                key={index}
                className={`p-3 border-l-4 rounded-r-lg ${getMentionSentimentColor(mention.sentiment)}`}
              >
                <p className="text-sm leading-relaxed mb-2 text-gray-300">{mention.text}</p>
                <div className="flex items-center justify-between text-xs text-gray-400">
                  <span className="font-medium">{mention.source}</span>
                  <div className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {timeAgo(mention.timestamp)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
}