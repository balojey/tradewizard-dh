
import { cn } from "@/utils/classNames";

interface PercentageGaugeProps {
    value: number; // 0 to 100
    size?: number;
    label?: string;
    className?: string;
}

export default function PercentageGauge({
    value,
    size = 60,
    label = "chance",
    className,
}: PercentageGaugeProps) {
    const radius = 24;
    const circumference = 2 * Math.PI * radius;
    
    // Clamped value
    const percentage = Math.min(Math.max(value, 0), 100);
    const offset = circumference - (percentage / 100) * circumference;

    // Responsive text sizing based on gauge size
    const getTextSizes = (gaugeSize: number) => {
        if (gaugeSize <= 40) {
            return {
                percentage: "text-xs",
                label: "text-[8px]"
            };
        } else if (gaugeSize <= 48) {
            return {
                percentage: "text-sm",
                label: "text-[9px]"
            };
        } else {
            return {
                percentage: "text-sm",
                label: "text-[10px]"
            };
        }
    };

    const textSizes = getTextSizes(size);

    return (
        <div 
            className={cn("relative flex flex-col items-center justify-center", className)} 
            style={{ width: size, height: size }}
        >
            <svg
                className="transform -rotate-90 w-full h-full"
                viewBox="0 0 60 60"
            >
                {/* Background Track */}
                <circle
                    className="text-gray-700/50"
                    strokeWidth="4"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx="30"
                    cy="30"
                />
                {/* Progress Circle */}
                <circle
                    className={cn(
                        "transition-all duration-500 ease-out",
                        percentage >= 70 ? "text-green-500" :
                        percentage >= 50 ? "text-yellow-500" :
                        percentage >= 30 ? "text-orange-500" :
                        "text-red-500"
                    )}
                    strokeWidth="4"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="transparent"
                    r={radius}
                    cx="30"
                    cy="30"
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={cn(
                    "font-bold leading-none text-white",
                    textSizes.percentage
                )}>
                    {Math.round(percentage)}%
                </span>
                {label && size > 40 && (
                    <span className={cn(
                        "text-gray-500 leading-none mt-0.5",
                        textSizes.label
                    )}>
                        {label}
                    </span>
                )}
            </div>
        </div>
    );
}
