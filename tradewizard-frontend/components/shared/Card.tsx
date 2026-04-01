import { cn } from "@/utils/classNames";
import { CARD_STYLES } from "@/constants/ui";

interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  onMouseEnter?: () => void;
  role?: string;
  "aria-labelledby"?: string;
}

export default function Card({
  children,
  className,
  hover = false,
  onMouseEnter,
  role,
  "aria-labelledby": ariaLabelledBy,
}: CardProps) {
  return (
    <div
      className={cn(
        "bg-white/5 backdrop-blur-xl rounded-xl border border-white/10 shadow-xl ring-1 ring-white/5 transition-all duration-300",
        hover && "hover:bg-white/10 hover:border-white/20 hover:ring-white/10 hover:-translate-y-1 hover:shadow-2xl cursor-pointer",
        className
      )}
      onMouseEnter={onMouseEnter}
      role={role}
      aria-labelledby={ariaLabelledBy}
    >
      {children}
    </div>
  );
}
