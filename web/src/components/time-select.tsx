"use client";

import * as React from "react";
import { useTranslations } from "next-intl";

import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/combobox";

const hours = Array.from({ length: 24 }, (_, index) => index.toString().padStart(2, "0"));
const minutes = Array.from({ length: 60 }, (_, index) => index.toString().padStart(2, "0"));

function splitTime(value?: string) {
  const match = value?.slice(0, 5).match(/^(\d{2}):(\d{2})$/);
  return match ? { hour: match[1], minute: match[2] } : { hour: undefined, minute: undefined };
}

function TimePart({
  value,
  items,
  max,
  placeholder,
  ariaLabel,
  onValueChange,
  portalContainer,
}: {
  value?: string;
  items: string[];
  max: number;
  placeholder: string;
  ariaLabel: string;
  onValueChange: (value: string) => void;
  portalContainer?: React.RefObject<HTMLElement | null>;
}) {
  const [inputValue, setInputValue] = React.useState(value ?? "");
  React.useEffect(() => setInputValue(value ?? ""), [value]);

  const commit = (raw: string) => {
    const digits = raw.replace(/\D/g, "").slice(0, 2);
    if (!digits) {
      setInputValue("");
      return;
    }
    const number = Number(digits);
    if (number > max) {
      setInputValue(value ?? "");
      return;
    }
    const next = digits.padStart(2, "0");
    setInputValue(next);
    onValueChange(next);
  };

  return (
    <Combobox
      items={items}
      itemToStringLabel={(item) => item}
      itemToStringValue={(item) => item}
      value={value ?? null}
      inputValue={inputValue}
      onInputValueChange={(next) => setInputValue(next.replace(/\D/g, "").slice(0, 2))}
      onValueChange={(next) => {
        if (typeof next === "string") {
          setInputValue(next);
          onValueChange(next);
        }
      }}
    >
      <ComboboxInput
        className="h-10 w-16 min-w-16 shrink-0"
        placeholder={placeholder}
        aria-label={ariaLabel}
        inputMode="numeric"
        maxLength={2}
        onBlur={() => commit(inputValue)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(inputValue);
        }}
      />
      <ComboboxContent className="max-h-64" sideOffset={4} portalContainer={portalContainer}>
        <ComboboxList>
          {(item) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  );
}

export function TimeSelect({
  value,
  onValueChange,
  optional = false,
  placeholder,
  "aria-label": ariaLabel,
  portalContainer,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  optional?: boolean;
  placeholder?: string;
  "aria-label"?: string;
  portalContainer?: React.RefObject<HTMLElement | null>;
}) {
  const t = useTranslations("time");
  const selected = splitTime(value);
  const hasValue = Boolean(selected.hour && selected.minute);
  const updateHour = (hour: string) => onValueChange(`${hour}:${selected.minute ?? "00"}`);
  const updateMinute = (minute: string) => onValueChange(`${selected.hour ?? "00"}:${minute}`);

  return (
    <div className="flex w-[9.25rem] min-w-0 items-center gap-1.5" title={optional && !hasValue ? (placeholder ?? t("select")) : undefined}>
      <TimePart
        value={selected.hour}
        items={hours}
        max={23}
        placeholder={t("hour")}
        ariaLabel={ariaLabel ? `${ariaLabel} ${t("hour")}` : t("hour")}
        onValueChange={updateHour}
        portalContainer={portalContainer}
      />
      <span className="font-medium text-muted-foreground">:</span>
      <TimePart
        value={selected.minute}
        items={minutes}
        max={59}
        placeholder={t("minute")}
        ariaLabel={ariaLabel ? `${ariaLabel} ${t("minute")}` : t("minute")}
        onValueChange={updateMinute}
        portalContainer={portalContainer}
      />
      {optional && hasValue && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={() => onValueChange("")}
          aria-label={t("clearEnd")}
          title={t("noEnd")}
        >
          <X />
        </Button>
      )}
    </div>
  );
}
