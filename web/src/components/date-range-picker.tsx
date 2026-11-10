"use client";

import * as React from "react";

import { format, subDays } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useDateLocale } from "@/i18n/use-date-locale";

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (value: DateRange | undefined) => void;
}

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const { t } = useTranslation();
  const { dateLocale, datePattern } = useDateLocale();
  const [open, setOpen] = React.useState(false);
  const [internalDateRange, setInternalDateRange] = React.useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = subDays(to, 29);
    return { from, to };
  });
  const dateRange = value ?? internalDateRange;
  let dateRangeLabel = t("date.select");

  if (dateRange?.from) {
    dateRangeLabel = format(dateRange.from, datePattern, { locale: dateLocale });
  }

  if (dateRange?.from && dateRange.to) {
    dateRangeLabel = `${format(dateRange.from, datePattern, { locale: dateLocale })} - ${format(dateRange.to, datePattern, { locale: dateLocale })}`;
  }

  const handleDateChange = (nextValue: DateRange | undefined) => {
    if (!value) {
      setInternalDateRange(nextValue);
    }
    onChange?.(nextValue);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" id="date" className="font-normal">
          {dateRangeLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="end">
        <Calendar
          mode="range"
          locale={dateLocale}
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={handleDateChange}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}
