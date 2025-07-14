import React from 'react';
import type { ExplorationStats } from '../types/ExploredArea';
import { formatArea } from '../utils/explorationUtils';

interface ExplorationStatsProps {
  stats: ExplorationStats;
  isVisible: boolean;
}

export function ExplorationStatsComponent({ stats, isVisible }: ExplorationStatsProps) {
  if (!isVisible) return null;

  return (
    <div className="absolute top-4 right-4 z-[1000] bg-black/80 text-white p-4 rounded-lg backdrop-blur-sm border border-green-500/30">
      <div className="text-sm font-mono space-y-2">
        <div className="text-green-400 font-bold border-b border-green-500/30 pb-2 mb-2">
          🗺️ 探索データ
        </div>
        
        <div className="flex justify-between gap-4">
          <span className="text-gray-300">レベル:</span>
          <span className="text-green-400 font-bold">Lv.{stats.explorationLevel}</span>
        </div>
        
        <div className="flex justify-between gap-4">
          <span className="text-gray-300">探索率:</span>
          <span className="text-blue-400">{stats.explorationPercentage.toFixed(1)}%</span>
        </div>
        
        <div className="flex justify-between gap-4">
          <span className="text-gray-300">探索エリア:</span>
          <span className="text-yellow-400">{formatArea(stats.totalExploredArea)}</span>
        </div>
        
        <div className="flex justify-between gap-4">
          <span className="text-gray-300">発見地点:</span>
          <span className="text-purple-400">{stats.exploredPoints}</span>
        </div>

        {/* 探索率プログレスバー */}
        <div className="mt-3">
          <div className="text-xs text-gray-400 mb-1">探索進度</div>
          <div className="w-full bg-gray-700 rounded-full h-2">
            <div 
              className="bg-gradient-to-r from-green-500 to-blue-500 h-2 rounded-full transition-all duration-300"
              style={{ width: `${Math.min(stats.explorationPercentage, 100)}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}