import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Modal, Pressable, Switch, View } from "react-native";

import { BackLink } from "@/components/ui/back-link";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Screen } from "@/components/ui/screen";
import { SectionHeader } from "@/components/ui/section-header";
import { Text } from "@/components/ui/text";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/errors";
import {
  cachedNotificationSettings,
  notificationsSupported,
  registerForServerPush,
  requestNotificationPermission,
  sendServerPushTest,
  serverPushIsRegistered,
  updateNotificationSettings,
} from "@/lib/notifications";
import type { NotificationSettings } from "@/lib/notifications";
import { InviteInfo, MembershipRole, ShopMember, TenantMembership } from "@/lib/types";

type InvitesData = {
  invite: InviteInfo | null;
  members: ShopMember[];
};

const roleBadge: Record<MembershipRole, "accent" | "neutral" | "ink"> = {
  OWNER: "accent",
  STAFF: "neutral",
  VIEW: "ink",
};

const roleLabel: Record<MembershipRole, string> = {
  OWNER: "Owner",
  STAFF: "Staff",
  VIEW: "View only",
};

function ShopSwitcher({
  tenants,
  visible,
  onClose,
}: {
  tenants: TenantMembership[];
  visible: boolean;
  onClose: () => void;
}) {
  const { switchShop } = useAuth();
  const router = useRouter();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable className="flex-1 items-center justify-end bg-black/40" onPress={onClose}>
        <Pressable
          className="w-full rounded-t-3xl bg-paper-card px-5 pb-8 pt-6"
          onPress={(event) => event.stopPropagation()}>
          <Text display weight="semibold" className="text-xl text-ink">
            Your shops
          </Text>
          <Text className="mt-1 text-sm text-ink-soft">
            Pick the ledger you want to open next.
          </Text>
          <View className="flex flex-col gap-4">
            <FlatList
              data={tenants}
              keyExtractor={(item) => item.tenantId}
              className="mt-4 flex flex-col gap-4"
              renderItem={({ item }) => (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    void switchShop(item.tenantId);
                    onClose();
                  }}
                  className="flex-row items-center justify-between rounded-xl border border-line bg-paper px-4 py-4">
                  <Text className="text-base font-medium text-ink">{item.name}</Text>
                  <Badge tone={roleBadge[item.role]} label={roleLabel[item.role]} />
                </Pressable>
              )}
            />
          </View>
          <Button
            title="Done"
            variant="secondary"
            className="mt-4"
            onPress={() => {
              onClose();
              router.navigate("/");
            }}
          />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const DAILY_TIMES = [
  { label: "Morning", time: "6:00", hour: 6, minute: 0 },
  { label: "Market open", time: "9:00", hour: 9, minute: 0 },
  { label: "Evening", time: "18:00", hour: 18, minute: 0 },
];

function SettingRow({
  label,
  hint,
  value,
  disabled,
  onChange,
}: {
  label: string;
  hint: string;
  value: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <View className="border-t border-line px-5 py-4 first:border-t-0">
      <View className="flex-row items-center justify-between gap-3">
        <View className="flex-1 pr-3">
          <Text className="text-sm font-medium text-ink">{label}</Text>
          <Text className="mt-0.5 text-xs leading-4 text-ink-soft">{hint}</Text>
        </View>
        <Switch
          value={value}
          disabled={disabled}
          onValueChange={onChange}
          trackColor={{ false: "#E9DFCD", true: "#1F5D3C" }}
          thumbColor="#FFFDF8"
        />
      </View>
    </View>
  );
}

export default function SettingsScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { tenant, role, tenants, user, isOwner, signOut } = useAuth();
  const [switcherOpen, setSwitcherOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingMember, setConfirmingMember] = useState<string | null>(null);
  const [changingRole, setChangingRole] = useState<string | null>(null);
  const [notif, setNotif] = useState<NotificationSettings>(() => ({
    ...cachedNotificationSettings(),
  }));
  const [pushBusy, setPushBusy] = useState(false);
  const [pushStatus, setPushStatus] = useState<string | null>(null);

  const devicesQuery = useQuery({
    queryKey: ["push-devices"],
    queryFn: () => api<{ devices: { id: string; platform: string }[] }>("/api/notifications/devices"),
    enabled: isOwner && notificationsSupported(),
  });
  const devices = devicesQuery.data?.devices ?? [];

  const notifSupported = notificationsSupported();

  const invitesQuery = useQuery({
    queryKey: ["invites"],
    queryFn: () => api<InvitesData>("/api/invites"),
    enabled: isOwner,
  });

  const invites = invitesQuery.data;

  const refreshInvites = async () => {
    const fresh = await api<InvitesData>("/api/invites");
    queryClient.setQueryData(["invites"], fresh);
  };

  const handleNewCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const code = await api<InviteInfo>("/api/invites", { method: "POST", body: {} });
      queryClient.setQueryData(["invites"], { invite: code, members: invites?.members ?? [] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't generate a code");
    } finally {
      setBusy(false);
    }
  };

  const handleCopy = async (code: string) => {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSetRole = async (memberId: string, roleToSet: MembershipRole) => {
    setChangingRole(memberId);
    setError(null);
    try {
      await api(`/api/invites/members/${memberId}`, { method: "PATCH", body: { role: roleToSet } });
      await refreshInvites();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change the role");
    } finally {
      setChangingRole(null);
    }
  };

  const handleRemove = async (memberId: string) => {
    setError(null);
    try {
      await api(`/api/invites/members/${memberId}`, { method: "DELETE" });
      await refreshInvites();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't remove the member");
    }
    setConfirmingMember(null);
  };

  const handleSignOut = async () => {
    await signOut();
    router.dismissAll?.();
    router.replace("/login");
  };

  const toggleDaily = async (value: boolean) => {
    if (value && !(await requestNotificationPermission())) {
      setError("Notifications are off system-wide. Allow Oloja in your phone settings, then try again.");
      return;
    }
    setError(null);
    const updated = await updateNotificationSettings({ dailyEnabled: value });
    setNotif({ ...updated });
  };

  const chooseDailyTime = async (hour: number, minute: number) => {
    if (!(await requestNotificationPermission())) {
      setError("Notifications are off system-wide. Allow Oloja in your phone settings, then try again.");
      return;
    }
    setError(null);
    const updated = await updateNotificationSettings({
      dailyEnabled: true,
      dailyHour: hour,
      dailyMinute: minute,
    });
    setNotif({ ...updated });
  };

  const toggleEvents = async (value: boolean) => {
    setError(null);
    const updated = await updateNotificationSettings({ eventEnabled: value });
    setNotif({ ...updated });
  };

  // Server push needs BOTH the system permission and a token handed to the
  // server, so the test button does both in one tap rather than dead-ending on
  // an owner who never found the notification switch.
  const handlePushTest = async () => {
    setPushBusy(true);
    setPushStatus(null);
    try {
      const state = await registerForServerPush();
      if (state === "unavailable" && !serverPushIsRegistered()) {
        setPushStatus(
          "Not ready yet: allow notifications for Oloja in your phone settings, then tap again. " +
            "Push also needs the installed Android app.",
        );
        return;
      }

      const result = await sendServerPushTest();
      setPushStatus(result.message);
      if (result.ok) await devicesQuery.refetch();
    } catch (err) {
      setPushStatus(err instanceof ApiError ? err.message : "Could not reach the server");
    } finally {
      setPushBusy(false);
    }
  };

  const expiry = invites?.invite?.expiresAt
    ? new Date(invites.invite.expiresAt).toLocaleDateString("en-GB", { day: "numeric", month: "long" })
    : null;

  return (
    <Screen scroll>
      <View className="flex-row items-center justify-between">
        <Text display weight="semibold" className="text-2xl text-ink">
          Manage your shop
        </Text>
        <BackLink />
      </View>

      {error ? (
        <View className="mt-3 rounded-xl border border-danger/30 bg-danger-tint px-3 py-2.5">
          <Text className="text-sm text-danger-deep">{error}</Text>
        </View>
      ) : null}

      {/* Current shop + switcher */}
      <View className="mt-5">
        <SectionHeader title="Current shop" />
        <Card className="p-5">
          <View className="flex-row items-center justify-between">
            <Text display weight="semibold" className="flex-1 pr-3 text-xl text-ink" numberOfLines={2}>
              {tenant?.name}
            </Text>
            {role ? <Badge tone={roleBadge[role]} label={roleLabel[role]} /> : null}
          </View>
          {user ? <Text className="mt-1 text-sm text-ink-soft">Signed in as {user.email}</Text> : null}
          <Button
            title={tenants.length > 1 ? "Switch shop" : "Your shops"}
            variant="secondary"
            className="mt-4"
            onPress={() => setSwitcherOpen(true)}
          />
          {tenants.length > 1 ? (
            <Text className="mt-2 text-xs text-ink-faint">
              You belong to {tenants.length} shops. Switching opens the other ledger.
            </Text>
          ) : null}
        </Card>
      </View>

      <ShopSwitcher tenants={tenants} visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />

      {/* Invite code (owner only) */}
      {isOwner ? (
        <View className="mt-6">
          <SectionHeader title="Invite a team member" />
          <Card className="p-5">
            {invites?.invite ? (
              <>
                <View className="flex-row items-center justify-between gap-3">
                  <Text
                    weight="bold"
                    className="text-3xl tracking-[0.18em] text-accent-deep"
                    style={{ fontVariant: ["tabular-nums"] }}>
                    {invites.invite.code}
                  </Text>
                  <Button
                    title={copied ? "Copied" : "Copy"}
                    variant="secondary"
                    onPress={() => void handleCopy(invites.invite!.code)}
                  />
                </View>
                <Text className="mt-1 text-xs text-ink-faint">
                  Share this code any way you like. It expires {expiry}.
                </Text>
              </>
            ) : (
              <Text className="text-sm leading-5 text-ink-soft">
                No code right now. Generate one and the person joins as staff, and their phone
                opens straight into your shop.
              </Text>
            )}
            <Button
              title={invites?.invite ? "New code (invalidates old)" : "Generate code"}
              variant="secondary"
              className="mt-4"
              disabled={busy}
              onPress={() => void handleNewCode()}
            />
          </Card>
        </View>
      ) : null}

      {/* Members (owner only) */}
      {isOwner ? (
        <View className="mt-6">
          <SectionHeader title="Members" />
          <Card className="overflow-hidden">
            {invites?.members && invites.members.length > 0 ? (
              invites.members.map((member: ShopMember) => {
                const isSelf = member.userId === user?.id;
                const confirming = confirmingMember === member.id;
                return (
                  <View key={member.id} className="border-t border-line px-5 py-4 first:border-t-0">
                    <View className="flex-row items-center justify-between gap-2">
                      <View className="min-w-0 flex-1">
                        <Text className="text-sm font-medium text-ink">{member.name}</Text>
                        <Text className="text-xs text-ink-faint">{member.email}</Text>
                      </View>
                      <Badge tone={roleBadge[member.role]} label={roleLabel[member.role]} />
                    </View>

                    {!isSelf && member.role !== "OWNER" ? (
                      <View className="mt-3 flex-row flex-wrap items-center gap-2">
                        <Text className="text-[13px] text-ink-soft">Role:</Text>
                        {(["STAFF", "VIEW"] as const).map((r) => (
                          <Pressable
                            key={r}
                            accessibilityRole="button"
                            disabled={changingRole === member.id}
                            onPress={() => void handleSetRole(member.id, r)}
                            className={cn(
                              "rounded-full border px-3 py-1",
                              member.role === r ? "border-accent bg-accent-tint" : "border-line bg-paper",
                            )}>
                            <Text
                              className={cn(
                                "text-[13px] font-medium",
                                member.role === r ? "text-accent-deep" : "text-ink-soft",
                              )}>
                              {r === "STAFF" ? "Staff" : "View only"}
                            </Text>
                          </Pressable>
                        ))}

                        {confirming ? (
                          <View className="flex-row items-center gap-2">
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => void handleRemove(member.id)}
                              className="rounded-full bg-danger px-3 py-1">
                              <Text className="text-[13px] font-semibold text-white">Remove</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => setConfirmingMember(null)}
                              className="rounded-full border border-line px-3 py-1">
                              <Text className="text-[13px] text-ink-soft">Cancel</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setConfirmingMember(member.id)}
                            className="rounded-full border border-line px-3 py-1">
                            <Text className="text-[13px] font-medium text-danger">Remove</Text>
                          </Pressable>
                        )}
                      </View>
                    ) : null}

                    {isSelf ? <Text className="mt-1 text-[13px] text-ink-faint">{"That's you."}</Text> : null}
                  </View>
                );
              })
            ) : (
              <EmptyState
                title="No members yet"
                body="Generate a code above to invite someone."
              />
            )}
          </Card>
        </View>
      ) : null}

      <View className="mt-6">
        <SectionHeader title="Join another shop" />
        <Card className="p-5">
          <Text className="text-sm leading-5 text-ink-soft">
            Got a code from someone&apos;s shop? Join it and start working their ledger as staff.
          </Text>
          <Button
            title="Join a shop with a code"
            variant="secondary"
            className="mt-4"
            onPress={() => router.push("/invite")}
          />
        </Card>
      </View>

      {role === "VIEW" ? (
        <Card className="mt-6 p-5">
          <Text className="text-sm leading-5 text-ink-soft">
            You have view-only access in this shop, so the ledger stays safe. Ask an owner to widen
            your role if you need to sell.
          </Text>
        </Card>
      ) : null}

      {notifSupported ? (
        <View className="mt-6">
          <SectionHeader title="Notifications" />
          <Card className="overflow-hidden">
            <SettingRow
              label="Daily whisper"
              hint="A quiet morning note when your ledger has a read for the day."
              value={notif.dailyEnabled}
              onChange={(value) => void toggleDaily(value)}
            />
            {notif.dailyEnabled ? (
              <View className="border-t border-line px-5 py-4">
                <Text className="text-xs text-ink-soft">Time of day:</Text>
                <View className="mt-2 flex-row flex-wrap gap-2">
                  {DAILY_TIMES.map((t) => {
                    const active =
                      notif.dailyHour === t.hour && notif.dailyMinute === t.minute;
                    return (
                      <Pressable
                        key={t.label}
                        accessibilityRole="button"
                        onPress={() => void chooseDailyTime(t.hour, t.minute)}
                        className={cn(
                          "rounded-full border px-3 py-1.5",
                          active ? "border-accent bg-accent-tint" : "border-line bg-paper",
                        )}>
                        <Text
                          className={cn(
                            "text-xs font-medium",
                            active ? "text-accent-deep" : "text-ink-soft",
                          )}>
                          {t.label} · {t.time}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
                <Text className="mt-2 text-[13px] text-ink-faint">
                  This schedules on this device only - it works even when the app is closed.
                </Text>
              </View>
            ) : null}
            <SettingRow
              label="Event notices"
              hint="Ping for things worth knowing now: out of stock, restock limits hit, a balance cleared."
              value={notif.eventEnabled}
              onChange={(value) => void toggleEvents(value)}
            />
            {isOwner ? (
              <View className="border-t border-line px-5 py-4">
                <Text className="text-sm font-medium text-ink">Shelf alerts by push</Text>
                <Text className="mt-1 text-[13px] leading-5 text-ink-soft">
                  When stock crosses its alert limit, or a sale empties a product, the server pings
                  every phone you allow below - even with the app closed.
                </Text>

                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send a test push"
                  disabled={pushBusy}
                  onPress={handlePushTest}
                  className={cn(
                    "mt-3 flex-row items-center justify-center rounded-xl border border-accent bg-accent-tint px-4 py-3",
                    pushBusy && "opacity-60",
                  )}>
                  <Text className="text-base font-semibold text-accent-deep">
                    {pushBusy ? "Sending..." : "Send a test push"}
                  </Text>
                </Pressable>

                <Text
                  className={cn(
                    "mt-2 text-[13px] leading-5",
                    pushStatus === "ok" ? "text-success-deep" : "text-ink-faint",
                  )}>
                  {pushStatus ?? `Registered phones: ${devices.length}`}
                </Text>

                {devices.length > 1 ? (
                  <Text className="mt-1 text-[13px] leading-5 text-ink-faint">
                    Phones you no longer use get cleared automatically once the app is uninstalled.
                  </Text>
                ) : null}
              </View>
            ) : null}
          </Card>
        </View>
      ) : null}
      <Button title="Sign out" variant="danger" className="mt-8" onPress={() => void handleSignOut()} />
    </Screen>
  );
}