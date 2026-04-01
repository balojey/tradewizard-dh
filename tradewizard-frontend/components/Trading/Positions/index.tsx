"use client";

import { useState, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTrading } from "@/providers/TradingProvider";
import useRedeemPosition from "@/hooks/useRedeemPosition";
import useUserPositions, { PolymarketPosition } from "@/hooks/useUserPositions";

import ErrorState from "@/components/shared/ErrorState";
import EmptyState from "@/components/shared/EmptyState";
import LoadingState from "@/components/shared/LoadingState";
import PositionCard from "@/components/Trading/Positions/PositionCard";
import PositionFilters from "@/components/Trading/Positions/PositionFilters";
import OrderPlacementModal from "@/components/Trading/OrderModal";

import { DUST_THRESHOLD } from "@/constants/validation";
import { POLLING_INTERVAL, POLLING_DURATION } from "@/constants/query";
import { createPollingInterval } from "@/utils/polling";

export default function UserPositions() {
  const { clobClient, relayClient, eoaAddress, safeAddress } = useTrading();

  const {
    data: positions,
    isLoading,
    error,
  } = useUserPositions(safeAddress as string | undefined);

  const [hideDust, setHideDust] = useState(true);
  const [redeemingAsset, setRedeemingAsset] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedPosition, setSelectedPosition] = useState<PolymarketPosition | null>(null);

  const { redeemPosition, isRedeeming } = useRedeemPosition();
  const queryClient = useQueryClient();

  const handleMarketSell = (position: PolymarketPosition) => {
    setSelectedPosition(position);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedPosition(null);
  };

  const handleRedeem = async (position: PolymarketPosition) => {
    if (!relayClient) {
      alert("Relay client not initialized");
      return;
    }

    setRedeemingAsset(position.asset);
    try {
      await redeemPosition(relayClient, {
        conditionId: position.conditionId,
        outcomeIndex: position.outcomeIndex,
        negativeRisk: position.negativeRisk,
        size: position.size,
      });

      queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });
      queryClient.invalidateQueries({ queryKey: ["polygon-balances"] });

      createPollingInterval(
        () => {
          queryClient.invalidateQueries({ queryKey: ["polymarket-positions"] });
          queryClient.invalidateQueries({ queryKey: ["polygon-balances"] });
        },
        POLLING_INTERVAL,
        POLLING_DURATION
      );
    } catch (err) {
      console.error("Failed to redeem position:", err);
      alert("Failed to redeem position. Please try again.");
    } finally {
      setRedeemingAsset(null);
    }
  };

  const activePositions = useMemo(() => {
    if (!positions) return [];

    let filtered = positions.filter((p) => p.size >= DUST_THRESHOLD);

    if (hideDust) {
      filtered = filtered.filter((p) => p.currentValue >= DUST_THRESHOLD);
    }

    return filtered;
  }, [positions, hideDust]);

  if (isLoading) {
    return <LoadingState message="Loading positions..." />;
  }

  if (error) {
    return <ErrorState error={error} title="Error loading positions" />;
  }

  if (!positions || activePositions.length === 0) {
    return (
      <EmptyState
        title="No Open Positions"
        message="You don't have any open positions."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with Position Count and Dust Toggle */}
      <PositionFilters
        positionCount={activePositions.length}
        hideDust={hideDust}
        onToggleHideDust={() => setHideDust(!hideDust)}
      />

      {/* Dust Warning Banner */}
      {hideDust && positions && positions.length > activePositions.length && (
        <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3">
          <p className="text-yellow-300 text-sm">
            Hiding {positions.length - activePositions.length} dust position(s)
            (value &lt; ${DUST_THRESHOLD.toFixed(2)})
          </p>
        </div>
      )}

      {/* Positions List */}
      <div className="space-y-3">
        {activePositions.map((position) => (
          <PositionCard
            key={`${position.conditionId}-${position.outcomeIndex}`}
            position={position}
            onRedeem={handleRedeem}
            onSell={handleMarketSell}
            isSelling={false}
            isRedeeming={redeemingAsset === position.asset}
            isPendingVerification={false}
            isSubmitting={false}
            canSell={!!clobClient}
            canRedeem={!!relayClient}
          />
        ))}
      </div>

      {/* Sell Order Modal */}
      {selectedPosition && (
        <OrderPlacementModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          marketTitle={selectedPosition.title}
          outcome={selectedPosition.outcome}
          currentPrice={selectedPosition.curPrice}
          tokenId={selectedPosition.asset}
          negRisk={selectedPosition.negativeRisk}
          clobClient={clobClient}
          orderSide="SELL"
          userPosition={{
            size: selectedPosition.size,
            avgPrice: selectedPosition.avgPrice
          }}
        />
      )}
    </div>
  );
}
