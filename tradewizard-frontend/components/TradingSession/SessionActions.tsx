import { SessionStep } from "@/utils/session";
import { cn } from "@/utils/classNames";
import { BUTTON_BASE, BUTTON_VARIANTS } from "@/constants/ui";

interface SessionActionsProps {
  isComplete: boolean | undefined;
  currentStep: SessionStep;
  onInitialize: () => void;
  onEnd: () => void;
}

export default function SessionActions({
  isComplete,
  currentStep,
  onInitialize,
  onEnd,
}: SessionActionsProps) {
  if (!isComplete) {
    return (
      <button
        onClick={onInitialize}
        disabled={currentStep !== "idle"}
        className={cn(
          BUTTON_BASE,
          BUTTON_VARIANTS.primary,
          "flex-1 py-3 px-4 shadow-indigo-500/20"
        )}
      >
        {currentStep !== "idle"
          ? "Initializing..."
          : "Initialize Trading Session"}
      </button>
    );
  }

  return (
    <>
      <div className="flex-1 bg-green-500/10 border border-green-500/20 rounded-lg px-4 py-3 flex items-center justify-center backdrop-blur-sm">
        <span className="text-green-400 font-medium flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
          Session Active
        </span>
      </div>
      <button
        onClick={onEnd}
        className={cn(
          BUTTON_BASE,
          "bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/10 py-3 px-6"
        )}
      >
        End Session
      </button>
    </>
  );
}
