"use client";

import { useWallet } from "@/providers/WalletContext";
import Card from "@/components/shared/Card";

import SessionInfo from "@/components/TradingSession/SessionInfo";
import SessionStatus from "@/components/TradingSession/SessionStatus";
import SessionSuccess from "@/components/TradingSession/SessionSuccess";
import SessionActions from "@/components/TradingSession/SessionActions";
import SessionProgress from "@/components/TradingSession/SessionProgress";

import type {
  TradingSession as TradingSessionType,
  SessionStep,
} from "@/utils/session";

interface Props {
  session: TradingSessionType | null;
  currentStep: SessionStep;
  error: Error | null;
  isComplete: boolean | undefined;
  initialize: () => Promise<void>;
  endSession: () => void;
}

export default function TradingSession({
  session,
  currentStep,
  error,
  isComplete,
  initialize,
  endSession,
}: Props) {
  const { eoaAddress } = useWallet();

  if (!eoaAddress) {
    return null;
  }

  return (
    <Card className="p-6">
      <SessionStatus isComplete={isComplete} />
      <SessionInfo isComplete={isComplete} />
      <SessionProgress currentStep={currentStep} />
      {isComplete && session && <SessionSuccess session={session} />}

      {error && (
        <div className="bg-red-500/10 border border-red-500/20 backdrop-blur-sm rounded-xl p-4 mb-4 shadow-inner shadow-red-500/5">
          <p className="text-sm text-red-300 font-medium mb-1 flex items-center gap-2">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            Session Error
          </p>
          <pre className="text-xs text-red-400 whitespace-pre-wrap pl-6 font-mono opacity-80">
            {error.message}
          </pre>
        </div>
      )}

      <div className="flex gap-3 mt-6">
        <SessionActions
          isComplete={isComplete}
          currentStep={currentStep}
          onInitialize={initialize}
          onEnd={endSession}
        />
      </div>
    </Card>
  );
}
