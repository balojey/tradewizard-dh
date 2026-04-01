"use client";

import React, { useState, useMemo } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Area, AreaChart } from "recharts";
import { Calendar, TrendingUp, TrendingDown, Activity, Zap, AlertCircle } from "lucide-react";
import Card from "@/components/shared/Card";
import { formatNumber } from "@/utils/formatting";
import usePriceHistory, { TimeRange, PriceHistoryPoint } from "@/hooks/usePriceHistory";

interface PriceEvent {
  timestamp: string;
  type: 'news' | 'trade' | 'social';
  title: string;
  impact: 'positive' | 'negative' | 'neutral';
  priceChange: number;
}

interface PriceHistoryChartProps {
  conditionId: string | null;
  tokenId: string | null;
  currentPrice: number;
  outcomes: string[];
  tokenIds: string[];
  outcomePrices: number[];
  recommendedTokenId?: string | null;
  aiRecommendation?: {
    entryZone: [number, number];
    targetZone: [number, number];
    consensusProbability: number;
  };
}

export default function PriceHistoryChart({ 
  conditionId, 
  tokenId,
  currentPrice,
  outcomes,
  tokenIds,
  outcomePrices,
  recommendedTokenId,
  aiRecommendation 
}: PriceHistoryChartProps) {
  const [selectedRange, setSelectedRange] = useState<TimeRange>('1D');
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(
    recommendedTokenId || tokenId
  );

  // Update selected token when recommended token changes
  React.useEffect(() => {
    if (recommendedTokenId && recommendedTokenId !== selectedTokenId) {
      setSelectedTokenId(recommendedTokenId);
    }
  }, [recommendedTokenId]);

  const timeRanges: { label: string; value: TimeRange; hours: number }[] = [
    { label: '1H', value: '1H', hours: 1 },
    { label: '4H', value: '4H', hours: 4 },
    { label: '1D', value: '1D', hours: 24 },
    { label: '7D', value: '7D', hours: 168 },
    { label: '30D', value: '30D', hours: 720 },
  ];

  // Get current price for selected token
  const selectedTokenIndex = tokenIds.indexOf(selectedTokenId || '');
  const selectedTokenPrice = selectedTokenIndex !== -1 ? outcomePrices[selectedTokenIndex] : currentPrice;
  const selectedOutcome = selectedTokenIndex !== -1 ? outcomes[selectedTokenIndex] : 'Unknown';

  // Fetch real price history data for selected token
  const { 
    data: priceHistoryResponse, 
    isLoading, 
    error,
    refetch 
  } = usePriceHistory(conditionId, selectedTokenId, selectedRange, {
    enabled: !!conditionId && !!selectedTokenId,
    refetchInterval: selectedRange === '1H' ? 30_000 : 60_000, // More frequent updates for shorter timeframes
  });

  const priceData = priceHistoryResponse?.data || [];
  const dataSource = priceHistoryResponse?.dataSource || 'synthetic';

  const chartData = useMemo(() => {
    return priceData.map(point => ({
      ...point,
      time: new Date(point.timestamp).getTime(),
      formattedTime: new Date(point.timestamp).toLocaleTimeString([], { 
        hour: '2-digit', 
        minute: '2-digit',
        ...(selectedRange === '7D' || selectedRange === '30D' ? { 
          month: 'short', 
          day: 'numeric' 
        } : {})
      })
    }));
  }, [priceData, selectedRange]);

  const priceChange = useMemo(() => {
    if (chartData.length < 2) return { value: 0, percentage: 0 };
    
    const first = chartData[0].price;
    const last = chartData[chartData.length - 1].price;
    const change = last - first;
    const percentage = (change / first) * 100;
    
    return { value: change, percentage };
  }, [chartData]);

  // Create token selector options
  const tokenOptions = outcomes.map((outcome, index) => ({
    tokenId: tokenIds[index],
    outcome,
    price: outcomePrices[index] || 0,
    isRecommended: tokenIds[index] === recommendedTokenId,
  }));

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-black/90 backdrop-blur-sm p-3 border border-white/20 rounded-lg shadow-lg">
          <p className="text-sm font-medium text-white">{data.formattedTime}</p>
          <p className="text-sm">
            <span className="text-gray-400">Price: </span>
            <span className="font-medium text-white">${data.price.toFixed(3)}</span>
          </p>
          <p className="text-sm">
            <span className="text-gray-400">Volume: </span>
            <span className="font-medium text-white">{formatNumber(data.volume)}</span>
          </p>
          <p className="text-sm">
            <span className="text-gray-400">Range: </span>
            <span className="font-medium text-white">${data.low.toFixed(3)} - ${data.high.toFixed(3)}</span>
          </p>
        </div>
      );
    }
    return null;
  };

  if (!conditionId || !selectedTokenId) {
    return (
      <Card className="p-3 sm:p-6">
        <div className="text-center text-gray-400">
          <Activity className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 opacity-50" />
          <p className="text-sm sm:text-base">Price history not available</p>
          <p className="text-xs sm:text-sm mt-1">Missing market or token information</p>
        </div>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <Card className="p-3 sm:p-6">
        <div className="animate-pulse space-y-3 sm:space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <div className="h-5 sm:h-6 bg-white/10 rounded w-32 sm:w-48" />
            <div className="flex gap-1 sm:gap-2">
              {[1, 2, 3, 4, 5].map(i => (
                <div key={i} className="h-6 sm:h-8 w-8 sm:w-12 bg-white/10 rounded" />
              ))}
            </div>
          </div>
          <div className="h-48 sm:h-64 bg-white/10 rounded" />
          <div className="text-center text-xs sm:text-sm text-gray-400">
            Loading real price data...
          </div>
        </div>
      </Card>
    );
  }

  if (error || chartData.length === 0) {
    return (
      <Card className="p-3 sm:p-6">
        <div className="text-center text-gray-400">
          <AlertCircle className="w-8 h-8 sm:w-12 sm:h-12 mx-auto mb-2 sm:mb-3 text-red-400" />
          <p className="font-medium text-sm sm:text-base text-white">Price History Unavailable</p>
          <p className="text-xs sm:text-sm mt-1">{error?.message || 'No price data available for this market'}</p>
          <button
            onClick={() => refetch()}
            className="mt-2 sm:mt-3 px-3 sm:px-4 py-1.5 sm:py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm rounded-lg transition-colors"
          >
            Retry
          </button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="p-3 sm:p-4 border-b border-white/10 bg-white/5">
        <div className="flex flex-col gap-3 sm:gap-4">
          {/* Header Row - Mobile Optimized */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-0">
            <div className="flex items-start gap-2 sm:gap-3">
              <Activity className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-400 mt-0.5 flex-shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-base sm:text-lg text-white">Price History</h3>
                  {dataSource === 'synthetic' && (
                    <span className="px-1.5 py-0.5 sm:px-2 bg-yellow-500/20 text-yellow-400 text-xs rounded-full border border-yellow-500/30 whitespace-nowrap">
                      Simulated
                    </span>
                  )}
                  {dataSource === 'real' && (
                    <span className="px-1.5 py-0.5 sm:px-2 bg-green-500/20 text-green-400 text-xs rounded-full border border-green-500/30 whitespace-nowrap">
                      Real Data
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 sm:gap-2 text-xs sm:text-sm mt-1 flex-wrap">
                  <span className="text-gray-400 whitespace-nowrap">Current: ${selectedTokenPrice.toFixed(3)}</span>
                  <span className={`font-medium whitespace-nowrap ${
                    priceChange.percentage > 0 ? 'text-green-400' : 
                    priceChange.percentage < 0 ? 'text-red-400' : 'text-gray-400'
                  }`}>
                    {priceChange.percentage > 0 ? '+' : ''}{priceChange.percentage.toFixed(2)}%
                  </span>
                  <span className="text-gray-500 hidden sm:inline">•</span>
                  <span className="text-gray-400 text-xs whitespace-nowrap">{priceData.length} points</span>
                </div>
              </div>
            </div>
            
            {/* Time Range Buttons - Mobile Scrollable */}
            <div className="flex gap-1 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
              {timeRanges.map(range => (
                <button
                  key={range.value}
                  onClick={() => setSelectedRange(range.value)}
                  className={`px-2 py-1 sm:px-3 text-xs sm:text-sm font-medium rounded transition-colors whitespace-nowrap flex-shrink-0 ${
                    selectedRange === range.value
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* Token Selector Row - Mobile Optimized */}
          {tokenOptions.length > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
              <span className="text-xs sm:text-sm font-medium text-gray-300 flex-shrink-0">Viewing:</span>
              <div className="flex gap-1.5 sm:gap-2 overflow-x-auto no-scrollbar pb-1 sm:pb-0">
                {tokenOptions.map((option) => (
                  <button
                    key={option.tokenId}
                    onClick={() => setSelectedTokenId(option.tokenId)}
                    className={`
                      relative px-2 py-1 sm:px-3 sm:py-1.5 text-xs sm:text-sm font-medium rounded-lg transition-all whitespace-nowrap flex-shrink-0
                      ${selectedTokenId === option.tokenId
                        ? 'bg-indigo-600 text-white shadow-lg'
                        : 'bg-white/10 text-gray-300 hover:bg-white/20 hover:text-white'
                      }
                    `}
                  >
                    <div className="flex items-center gap-1 sm:gap-2">
                      <span className="truncate max-w-[60px] sm:max-w-none">{option.outcome}</span>
                      <span className="text-xs opacity-75">${option.price.toFixed(3)}</span>
                      {option.isRecommended && (
                        <div className="absolute -top-0.5 -right-0.5 sm:-top-1 sm:-right-1 w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full border border-white/20" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
              {recommendedTokenId && (
                <div className="flex items-center gap-1 text-xs text-green-400 mt-1 sm:mt-0">
                  <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-400 rounded-full flex-shrink-0" />
                  <span className="whitespace-nowrap">AI Recommended</span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-3 sm:p-4">
        <div className="h-48 sm:h-64 mb-3 sm:mb-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255, 255, 255, 0.1)" />
              <XAxis 
                dataKey="formattedTime"
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
                height={30}
              />
              <YAxis 
                domain={['dataMin - 0.01', 'dataMax + 0.01']}
                tick={{ fontSize: 10, fill: '#9ca3af' }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(value) => `$${value.toFixed(3)}`}
              />
              <Tooltip content={<CustomTooltip />} />
              
              {/* AI Recommendation Zones */}
              {aiRecommendation && (
                <>
                  <ReferenceLine 
                    y={aiRecommendation.entryZone[0]} 
                    stroke="#10b981" 
                    strokeDasharray="5 5"
                    label={{ value: "Entry Min", position: "insideTopRight", fill: '#10b981', fontSize: 10 }}
                  />
                  <ReferenceLine 
                    y={aiRecommendation.entryZone[1]} 
                    stroke="#10b981" 
                    strokeDasharray="5 5"
                    label={{ value: "Entry Max", position: "insideTopRight", fill: '#10b981', fontSize: 10 }}
                  />
                  <ReferenceLine 
                    y={aiRecommendation.targetZone[0]} 
                    stroke="#f59e0b" 
                    strokeDasharray="5 5"
                    label={{ value: "Target Min", position: "insideTopRight", fill: '#f59e0b', fontSize: 10 }}
                  />
                  <ReferenceLine 
                    y={aiRecommendation.targetZone[1]} 
                    stroke="#f59e0b" 
                    strokeDasharray="5 5"
                    label={{ value: "Target Max", position: "insideTopRight", fill: '#f59e0b', fontSize: 10 }}
                  />
                  <ReferenceLine 
                    y={aiRecommendation.consensusProbability} 
                    stroke="#8b5cf6" 
                    strokeWidth={2}
                    label={{ value: "AI Fair Price", position: "insideTopRight", fill: '#8b5cf6', fontSize: 10 }}
                  />
                </>
              )}
              
              <Area
                type="monotone"
                dataKey="price"
                stroke="#6366f1"
                strokeWidth={2}
                fill="url(#priceGradient)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Data source information - Mobile Optimized */}
        <div className="mt-3 sm:mt-4 p-2 sm:p-3 bg-white/5 rounded-lg border border-white/10">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
            <div className="flex-1">
              <h4 className="font-medium text-xs sm:text-sm text-gray-300 mb-1">Data Information</h4>
              <p className="text-xs text-gray-400 leading-relaxed">
                {dataSource === 'real' 
                  ? `Showing ${priceData.length} real price points from Polymarket CLOB API`
                  : `Showing ${priceData.length} simulated data points (real data unavailable)`
                }
              </p>
            </div>
            {aiRecommendation && (
              <div className="flex-shrink-0">
                <h4 className="font-medium text-xs sm:text-sm text-gray-300 mb-2">AI Trading Zones</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-xs">
                  <div className="space-y-1.5 sm:space-y-1">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="w-3 h-0.5 sm:w-4 bg-green-400 border-dashed border-green-400" style={{ borderWidth: '1px 0' }} />
                      <span className="text-gray-400 text-xs">Entry Zone</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="w-3 h-0.5 sm:w-4 bg-yellow-400 border-dashed border-yellow-400" style={{ borderWidth: '1px 0' }} />
                      <span className="text-gray-400 text-xs">Target Zone</span>
                    </div>
                  </div>
                  <div className="space-y-1.5 sm:space-y-1">
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="w-3 h-0.5 sm:w-4 bg-purple-400" />
                      <span className="text-gray-400 text-xs">AI Fair Price</span>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2">
                      <div className="w-3 h-0.5 sm:w-4 bg-indigo-400" />
                      <span className="text-gray-400 text-xs">Market Price</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}