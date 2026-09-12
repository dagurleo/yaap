import { useEffect, useState } from "react";
import { Label } from "@/components/ui/label";
export function TimezoneSelect({
  value,
  onChange,
  name = "timezone",
}: {
  value: string;
  onChange: (value: string) => void;
  name?: string;
}) {
  const [zones, setZones] = useState(["UTC", value]);
  useEffect(() => {
    setZones(["UTC", ...Intl.supportedValuesOf("timeZone")]);
  }, []);
  return (
    <Label htmlFor={name}>
      Reporting timezone
      <select
        id={name}
        name={name}
        className="h-9 rounded-md bg-control px-3 ring-1 ring-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {[...new Set([value, ...zones])].sort().map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll("_", " ")}
          </option>
        ))}
      </select>
      <small>
        Sets when today begins and how dates and times appear across this
        website’s reports.
      </small>
    </Label>
  );
}
