import {
  CalendarCheck,
  ChevronDown,
  CreditCard,
  Download,
  Flag,
  Mail,
  MousePointerClick,
  Route,
  ShoppingCart,
  Sparkles,
  Target,
  UserPlus,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  defaultGoalIcon,
  entityIconNames,
  validEntityIcon,
  type EntityIconName,
} from "@/lib/entity-icons";
import { cn } from "@/lib/utils";

const icons: Record<EntityIconName, { label: string; icon: LucideIcon }> = {
  target: { label: "Target", icon: Target },
  flag: { label: "Flag", icon: Flag },
  route: { label: "Journey", icon: Route },
  "user-plus": { label: "Sign up", icon: UserPlus },
  "shopping-cart": { label: "Purchase", icon: ShoppingCart },
  "credit-card": { label: "Payment", icon: CreditCard },
  "mouse-pointer": { label: "Click", icon: MousePointerClick },
  mail: { label: "Message", icon: Mail },
  download: { label: "Download", icon: Download },
  "calendar-check": { label: "Booking", icon: CalendarCheck },
  sparkles: { label: "Activation", icon: Sparkles },
  zap: { label: "Action", icon: Zap },
};

export function EntityIcon({
  name,
  className,
}: {
  name: EntityIconName | string | null | undefined;
  className?: string;
}) {
  const resolved = validEntityIcon(name) ? name : defaultGoalIcon;
  const Icon = icons[resolved].icon;
  return (
    <Icon
      aria-hidden="true"
      className={cn("size-4 shrink-0 stroke-current", className)}
    />
  );
}

export function EntityIconPicker({
  value,
  onChange,
}: {
  value: EntityIconName;
  onChange: (value: EntityIconName) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className="w-full justify-start"
          aria-label={`Choose icon. ${icons[value].label} selected`}
        >
          <EntityIcon name={value} />
          <span className="min-w-0 flex-1 truncate text-left">
            {icons[value].label}
          </span>
          <ChevronDown aria-hidden="true" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-2">
        <div
          role="radiogroup"
          aria-label="Icon"
          className="grid grid-cols-2 gap-1"
        >
          {entityIconNames.map((name) => (
            <Button
              key={name}
              variant={name === value ? "secondary" : "ghost"}
              role="radio"
              aria-checked={name === value}
              className="min-w-0 justify-start"
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
            >
              <EntityIcon name={name} />
              <span className="truncate">{icons[name].label}</span>
            </Button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
