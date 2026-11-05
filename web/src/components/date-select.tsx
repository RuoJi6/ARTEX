"use client";

import * as React from "react";

import { format, parse } from "date-fns";
import { useTranslations } from "next-intl";
import { useLocaleFormatting } from "@/i18n/formatting";
import { CalendarDays, ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

function parseDate(value?: string) {
  if (!value) return undefined;
  const parsed = parse(value, "yyyy-MM-dd", new Date());
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function DateSelect({
  value,
  onValueChange,
  optional = false,
  placeholder,
  "aria-label": ariaLabel,
}: {
  value?: string;
  onValueChange: (value: string) => void;
  optional?: boolean;
  placeholder?: string;
  "aria-label"?: string;
}) {
  const t = useTranslations("date");
  const formatting = useLocaleFormatting();
  const [open, setOpen] = React.useState(false);
  const selected = parseDate(value);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-10 w-full justify-between bg-background px-3 font-normal"
          aria-label={ariaLabel}
          aria-expanded={open}
        >
          <span className="flex items-center gap-2">
            <CalendarDays className="size-4 text-muted-foreground" />
            {selected ? (
              formatting.dateTime(selected, "shortDate")
            ) : (
              <span className="text-muted-foreground">{placeholder ?? t("select")}</span>
            )}
          </span>
          <span className="flex items-center gap-1">
            <ChevronDown className="size-4 text-muted-foreground" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto overflow-hidden p-0">
        <Calendar
          mode="single"
          locale={formatting.calendarLocale}
          captionLayout="dropdown"
          startMonth={new Date(2020, 0, 1)}
          endMonth={new Date(2100, 11, 31)}
          selected={selected}
          defaultMonth={selected ?? new Date()}
          onSelect={(date) => {
            onValueChange(date ? format(date, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
        />
        {optional && selected && (
          <Button
            type="button"
            variant="ghost"
            className="w-full rounded-none border-t"
            onClick={() => {
              onValueChange("");
              setOpen(false);
            }}
          >
            <X data-icon="inline-start" />
            {t("clear")}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
}
