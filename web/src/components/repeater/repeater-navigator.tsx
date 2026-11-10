"use client";
import * as React from "react";

import { ChevronDown, ChevronRight, ListFilter, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { repeaterGroupLabel } from "@/i18n/fixed-ui-text";
import { useUITranslation } from "@/i18n/use-ui-translation";
import { cn } from "@/lib/utils";

import { DEFAULT_FILTERS, matchesRepeaterFilters } from "./repeater-filter";
import { RepeaterHistory } from "./repeater-history";
import type { RepeaterWorkspace } from "./repeater-state";
import { useRepeaterStore } from "./repeater-store";

type Rename = { kind: "tab" | "group"; id: string; name: string };

export function RepeaterNavigator({
  workspace,
  onRename,
  className,
}: {
  workspace: RepeaterWorkspace;
  onRename: (value: Rename) => void;
  className?: string;
}) {
  const { ui } = useUITranslation();

  const store = useRepeaterStore();
  const [filters, setFilters] = React.useState(DEFAULT_FILTERS);
  const [expanded, setExpanded] = React.useState(false);
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = React.useState(false);
  const visible = React.useMemo(
    () => workspace.tabs.filter((tab) => matchesRepeaterFilters(tab, filters)),
    [workspace.tabs, filters],
  );
  const selectedIds = workspace.tabs.filter((tab) => selected.has(tab.id)).map((tab) => tab.id);
  const visibleIds = new Set(visible.map((tab) => tab.id));
  const hiddenSelected = selectedIds.filter((id) => !visibleIds.has(id)).length;
  const filtering = Object.entries(filters).some(
    ([key, value]) => value !== DEFAULT_FILTERS[key as keyof typeof filters],
  );
  const allSelected = visible.length > 0 && visible.every((tab) => selected.has(tab.id));
  const active = workspace.tabs.find((tab) => tab.id === workspace.activeTabId);
  const methods = [
    ...new Set([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
      ...workspace.tabs.map((tab) => tab.method.toUpperCase()),
    ]),
  ];
  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  return (
    <nav
      aria-label={ui("screen.fc223c0df3262b")}
      className={cn(
        "flex h-[28rem] min-h-0 w-full shrink-0 flex-col gap-3 overflow-y-auto rounded-md border p-3 lg:h-[calc(100dvh-14rem)] lg:min-h-[480px] lg:w-80 xl:h-auto xl:min-h-0",
        className,
      )}
    >
      <div className="flex shrink-0 flex-col gap-2">
        <Input
          aria-label={ui("screen.fda520e604583d")}
          placeholder={ui("screen.6e6941313da548")}
          value={filters.query}
          onChange={(event) => setFilters({ ...filters, query: event.target.value })}
        />
        <div className="flex gap-2">
          <Select value={filters.method} onValueChange={(method) => setFilters({ ...filters, method })}>
            <SelectTrigger aria-label={ui("screen.f7112463197f46")} className="min-w-0 flex-1">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="all">{ui("screen.470f9e522dbc29")}</SelectItem>
                {methods.map((method) => (
                  <SelectItem key={method} value={method}>
                    {method}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
          <Button
            variant={expanded ? "secondary" : "outline"}
            size="sm"
            aria-expanded={expanded}
            aria-controls="repeater-extra-filters"
            onClick={() => setExpanded(!expanded)}
          >
            <ListFilter />
            {ui("screen.b5f15473fdc0fe")}
          </Button>
        </div>
        {expanded ? (
          <div id="repeater-extra-filters" className="flex flex-col gap-2">
            <Field className="gap-1">
              <FieldLabel htmlFor="repeater-filter-path" className="text-xs">
                {ui("screen.f92b5d1f891e9d")}
              </FieldLabel>
              <Input
                id="repeater-filter-path"
                placeholder={ui("screen.5f684326ba3c85")}
                value={filters.path}
                onChange={(event) => setFilters({ ...filters, path: event.target.value })}
              />
            </Field>
            <Field className="gap-1">
              <FieldLabel htmlFor="repeater-filter-response" className="text-xs">
                {ui("screen.28ad983da52dd4")}
              </FieldLabel>
              <Input
                id="repeater-filter-response"
                placeholder={ui("screen.20287a861cf93e")}
                value={filters.response}
                onChange={(event) => setFilters({ ...filters, response: event.target.value })}
              />
            </Field>
            <Select value={filters.status} onValueChange={(status) => setFilters({ ...filters, status })}>
              <SelectTrigger aria-label={ui("screen.92300e2435969a")} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectItem value="all">{ui("screen.798f5938d3f7e9")}</SelectItem>
                  <SelectItem value="pending">{ui("screen.069599567d45f1")}</SelectItem>
                  <SelectItem value="error">{ui("screen.ac77953a1e064e")}</SelectItem>
                  {["1xx", "2xx", "3xx", "4xx", "5xx"].map((status) => (
                    <SelectItem key={status} value={status}>
                      {status}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
        ) : null}
        <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
          <span>
            {visible.length} / {workspace.tabs.length} {ui("screen.757f0ae7517f1a")}
          </span>
          {filtering ? (
            <Button variant="ghost" size="sm" className="h-6 px-1 text-xs" onClick={() => setFilters(DEFAULT_FILTERS)}>
              {ui("screen.657d9cbf45ec9e")}
            </Button>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 flex-col gap-2 border-y py-2">
        <div className="flex items-center gap-2">
          <Checkbox
            id="repeater-select-visible"
            aria-label={ui("screen.137fb1c9ccee7f")}
            checked={allSelected || (visible.some((tab) => selected.has(tab.id)) ? "indeterminate" : false)}
            disabled={!visible.length}
            onCheckedChange={(checked) =>
              setSelected((current) => {
                const next = new Set(current);
                for (const tab of visible) {
                  if (checked === true) next.add(tab.id);
                  else next.delete(tab.id);
                }
                return next;
              })
            }
          />
          <label htmlFor="repeater-select-visible" className="text-xs">
            {ui("screen.d9b7280fd8f576")}
          </label>
          <span className="ml-auto text-muted-foreground text-xs">
            {ui("screen.7ecf1cde648680")}
            {selectedIds.length} {ui("screen.f004f1d84cf962")}
            {hiddenSelected ? ui("screen.0d33ef85548f7a", { v0: hiddenSelected }) : ""}
          </span>
          {selectedIds.length ? (
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={ui("screen.d79018168daf3c")}
              onClick={() => setSelected(new Set())}
            >
              <X />
            </Button>
          ) : null}
        </div>
        {selectedIds.length ? (
          <div className="flex gap-2">
            <Select
              value=""
              onValueChange={(groupId) => {
                store.setTabsGroup(selectedIds, groupId);
                toast.success(ui("screen.0e2f7204bc2207", { v0: selectedIds.length }));
                setSelected(new Set());
              }}
            >
              <SelectTrigger aria-label={ui("screen.0c918c6fde83b9")} className="min-w-0 flex-1">
                <SelectValue placeholder={ui("screen.06f235c40339e8")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  {workspace.groups.map((group) => (
                    <SelectItem key={group.id} value={group.id}>
                      {repeaterGroupLabel(group, ui)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
            <Button variant="destructive" size="sm" onClick={() => setDeleting(true)}>
              {ui("screen.435bf8a234fde6")}
            </Button>
          </div>
        ) : null}
      </div>
      <section className="min-h-24 flex-1 overflow-y-auto" aria-label={ui("screen.21ffc350cd2320")}>
        {workspace.groups.map((group) => {
          const tabs = visible.filter((tab) => tab.groupId === group.id);
          if (filtering && !tabs.length) return null;
          const collapsed = group.collapsed && !filtering;
          return (
            <div key={group.id} className="flex flex-col gap-1">
              <div className="flex min-w-0 items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={ui("screen.b11c875c169055", {
                    v0: collapsed ? ui("screen.00bd3960fea8ea") : ui("screen.84a07f292f1f78"),
                    v1: repeaterGroupLabel(group, ui),
                  })}
                  disabled={filtering}
                  onClick={() => store.toggleGroupCollapsed(group.id)}
                >
                  {collapsed ? <ChevronRight /> : <ChevronDown />}
                </Button>
                <span className="min-w-0 flex-1 truncate font-medium text-sm" title={repeaterGroupLabel(group, ui)}>
                  {repeaterGroupLabel(group, ui)}
                </span>
                <span className="text-muted-foreground text-xs">{tabs.length}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={ui("screen.5be75ef58016bd", { v0: repeaterGroupLabel(group, ui) })}
                  onClick={() => onRename({ kind: "group", id: group.id, name: group.name })}
                >
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={ui("screen.eda16098de09ef", { v0: repeaterGroupLabel(group, ui) })}
                  title={ui("screen.040692852ad543")}
                  onClick={() => store.createTab({}, { groupId: group.id })}
                >
                  <Plus />
                </Button>
              </div>
              {!collapsed
                ? tabs.map((tab) => (
                    <div
                      key={tab.id}
                      className={cn(
                        "flex min-w-0 items-center gap-1 rounded-md px-1",
                        active?.id === tab.id && "bg-accent",
                      )}
                    >
                      <Checkbox
                        aria-label={ui("screen.003189d0f66ebd", { v0: tab.title })}
                        checked={selected.has(tab.id)}
                        onCheckedChange={(checked) => toggle(tab.id, checked === true)}
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        aria-current={active?.id === tab.id ? "page" : undefined}
                        className="min-w-0 flex-1 justify-start px-1"
                        onClick={() => store.setActiveTab(tab.id)}
                        onDoubleClick={() => onRename({ kind: "tab", id: tab.id, name: tab.title })}
                        title={`${tab.title}\n${tab.url}`}
                      >
                        <span className="truncate">{tab.title}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={ui("screen.66306b30e2d84b", { v0: tab.title })}
                        onClick={() => onRename({ kind: "tab", id: tab.id, name: tab.title })}
                      >
                        <Pencil />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={ui("screen.6528dff69c7ef3", { v0: tab.title })}
                        onClick={() => store.closeTab(tab.id)}
                      >
                        <X />
                      </Button>
                    </div>
                  ))
                : null}
            </div>
          );
        })}
        {!visible.length ? <p className="p-2 text-muted-foreground text-xs">{ui("screen.a8cce2ca69cab0")}</p> : null}
      </section>
      <div className="flex max-h-[35%] min-h-20 flex-1 flex-col">
        <RepeaterHistory tab={active} />
      </div>
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {ui("screen.9680c7c49ddbcc")}
              {selectedIds.length} {ui("screen.e9e9aa99190749")}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {ui("screen.44636187667003")}
              {hiddenSelected ? ui("screen.af7787403c8e1e", { v0: hiddenSelected }) : ""}
              {ui("screen.e1a8e2b32fe1fd")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{ui("screen.2cd0f3be8738a8")}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={!selectedIds.length}
              onClick={() => {
                store.closeTabs(selectedIds);
                toast.success(ui("screen.0340e869c18a26", { v0: selectedIds.length }));
                setSelected(new Set());
              }}
            >
              {ui("screen.a3ea3c17b401bd")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}
