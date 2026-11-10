"use client";

import * as React from "react";

import { ArrowDownIcon, ArrowUpIcon, XIcon } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
} from "@/components/ui/combobox";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLiveTranslation } from "@/i18n/use-live-translation";
import type { LLMProfile } from "@/lib/types";

interface TaskLLMProfileChainProps {
  profiles: LLMProfile[];
  value: string[];
  onValueChange: (value: string[]) => void;
  activeProfileId?: string;
  onActiveProfileChange?: (value: string) => void;
  disabled?: boolean;
  inputId?: string;
  portalContainer?: React.RefObject<HTMLElement | null>;
}

function ProfileRoleBadge({ index, currentIndex }: { index: number; currentIndex: number }) {
  const { t: translate } = useLiveTranslation();
  if (index === currentIndex) return <Badge variant="default">{translate("taskUI.profileCurrent")}</Badge>;
  if (index < currentIndex) {
    return (
      <Badge variant="outline" title={translate("taskUI.profileSkippedHelp")}>
        {translate("taskUI.profileSkipped")}
      </Badge>
    );
  }
  return <Badge variant="secondary">{translate("taskUI.profileBackup", { index: index - currentIndex })}</Badge>;
}

export function TaskLLMProfileChain({
  profiles,
  value,
  onValueChange,
  activeProfileId,
  onActiveProfileChange,
  disabled = false,
  inputId,
  portalContainer,
}: TaskLLMProfileChainProps) {
  const { t: translate } = useLiveTranslation();
  const chatProfiles = React.useMemo(() => profiles.filter((profile) => profile.format !== "jev"), [profiles]);
  const profilesByID = React.useMemo(
    () => new Map(chatProfiles.map((profile) => [profile.id, profile])),
    [chatProfiles],
  );
  const itemIDs = React.useMemo(() => chatProfiles.map((profile) => profile.id), [chatProfiles]);
  const profilesUnavailable = chatProfiles.length === 0;
  const currentProfileID = activeProfileId && value.includes(activeProfileId) ? activeProfileId : value[0];
  const currentIndex = value.indexOf(currentProfileID);
  // api_key_hint is display-only and is empty for valid keys shorter than four
  // characters. The task API remains authoritative for profile validation.

  const profileLabel = React.useCallback(
    (id: string) => {
      const profile = profilesByID.get(id);
      return profile ? `${profile.name} ${profile.model}` : translate("taskUI.profileId", { id });
    },
    [profilesByID, translate],
  );

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset;
    if (target < 0 || target >= value.length) return;
    const next = [...value];
    [next[index], next[target]] = [next[target], next[index]];
    onValueChange(next);
  };

  const remove = (id: string) => {
    const next = value.filter((profileID) => profileID !== id);
    onValueChange(next);
    if (activeProfileId === id) onActiveProfileChange?.(next[0] ?? "");
  };

  const handleValueChange = (next: string[]) => {
    onValueChange(next);
    if (activeProfileId && !next.includes(activeProfileId)) {
      onActiveProfileChange?.(next[0] ?? "");
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <Combobox
        items={itemIDs}
        itemToStringValue={profileLabel}
        multiple
        value={value}
        onValueChange={handleValueChange}
        disabled={disabled}
      >
        <ComboboxChips>
          <ComboboxValue>
            {value.map((id) => (
              <ComboboxChip key={id}>{profilesByID.get(id)?.name ?? `#${id}`}</ComboboxChip>
            ))}
          </ComboboxValue>
          <ComboboxChipsInput
            id={inputId}
            placeholder={profiles.length > 0 ? translate("taskUI.profileSearch") : translate("taskUI.profileNone")}
            disabled={disabled ? true : profilesUnavailable}
          />
        </ComboboxChips>
        <ComboboxContent portalContainer={portalContainer}>
          <ComboboxEmpty>{translate("taskUI.profileNoMatches")}</ComboboxEmpty>
          <ComboboxList>
            {(id) => {
              const profile = profilesByID.get(id);
              return (
                <ComboboxItem key={id} value={id} disabled={!profile}>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate">
                        {profile?.name ?? translate("taskUI.profileId", { id })}
                        {profile?.is_default ? translate("taskUI.profileActive") : ""}
                      </span>
                    </span>
                    {profile && <span className="truncate text-muted-foreground text-xs">{profile.model}</span>}
                  </div>
                </ComboboxItem>
              );
            }}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>

      {value.length === 0 ? (
        <p className="text-muted-foreground text-xs">{translate("taskUI.profileDefaultHelp")}</p>
      ) : (
        <div className="flex flex-col divide-y rounded-lg border">
          {value.map((id, index) => {
            const profile = profilesByID.get(id);
            return (
              <div
                key={id}
                className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2.5 py-2 sm:flex"
              >
                <span className="w-5 shrink-0 text-center text-muted-foreground text-xs tabular-nums">{index + 1}</span>
                <div className="min-w-0 sm:flex-1">
                  <p className="truncate font-medium text-sm">
                    {profile?.name ?? translate("taskUI.profileId", { id })}
                  </p>
                  <div className="flex min-w-0 items-center gap-2">
                    <p className="truncate text-muted-foreground text-xs">
                      {profile?.model ?? translate("taskUI.profileUnavailable")}
                    </p>
                  </div>
                </div>
                <ProfileRoleBadge index={index} currentIndex={currentIndex} />
                <div className="col-span-2 col-start-2 flex shrink-0 items-center gap-1 justify-self-end sm:col-auto sm:justify-self-auto">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={translate("taskUI.profileUp")}
                    onClick={() => move(index, -1)}
                    disabled={disabled ? true : index === 0}
                  >
                    <ArrowUpIcon data-icon="inline-start" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={translate("taskUI.profileDown")}
                    onClick={() => move(index, 1)}
                    disabled={disabled ? true : index === value.length - 1}
                  >
                    <ArrowDownIcon data-icon="inline-start" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={translate("taskUI.profileRemove")}
                    onClick={() => remove(id)}
                    disabled={disabled}
                  >
                    <XIcon data-icon="inline-start" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {onActiveProfileChange && value.length > 0 && (
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="font-medium text-sm">{translate("taskUI.currentProfile")}</span>
          <Select
            value={activeProfileId && value.includes(activeProfileId) ? activeProfileId : value[0]}
            onValueChange={onActiveProfileChange}
            disabled={disabled}
          >
            <SelectTrigger size="sm" className="w-full sm:min-w-48 sm:max-w-64">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                {value.map((id) => {
                  const profile = profilesByID.get(id);
                  return (
                    <SelectItem key={id} value={id} disabled={!profile}>
                      {profile?.name ?? translate("taskUI.profileId", { id })}
                    </SelectItem>
                  );
                })}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}
