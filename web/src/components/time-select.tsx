"use client";

import * as React from "react";

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
}: {
  value?: string;
  items: string[];
  max: number;
  placeholder: string;
  ariaLabel: string;
  onValueChange: (value: string) => void;
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
        className="h-10 min-w-0"
        placeholder={placeholder}
        aria-label={ariaLabel}
        inputMode="numeric"
        maxLength={2}
        onBlur={() => commit(inputValue)}
        onKeyDown={(event) => {
          if (event.key === "Enter") commit(inputValue);
        }}
      />
      <ComboboxContent className="max-h-64" sideOffset={4}>
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
  placeholder = "选择时间",
  "aria-label": ariaLabel,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  optional?: boolean;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const selected = splitTime(value);
  const hasValue = Boolean(selected.hour && selected.minute);
  const updateHour = (hour: string) => onValueChange(`${hour}:${selected.minute ?? "00"}`);
  const updateMinute = (minute: string) => onValueChange(`${selected.hour ?? "00"}:${minute}`);

  return (
    <div className="flex min-w-0 items-center gap-1" title={optional && !hasValue ? placeholder : undefined}>
      <TimePart
        value={selected.hour}
        items={hours}
        max={23}
        placeholder="小时"
        ariaLabel={ariaLabel ? `${ariaLabel} 小时` : "小时"}
        onValueChange={updateHour}
      />
      <span className="font-medium text-muted-foreground">:</span>
      <TimePart
        value={selected.minute}
        items={minutes}
        max={59}
        placeholder="分钟"
        ariaLabel={ariaLabel ? `${ariaLabel} 分钟` : "分钟"}
        onValueChange={updateMinute}
      />
      {optional && hasValue && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="shrink-0"
          onClick={() => onValueChange("")}
          aria-label="清除结束时间"
          title="不设置结束时间"
        >
          <X />
        </Button>
      )}
    </div>
  );
}
