import * as Clipboard from "expo-clipboard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Modal, Pressable, View } from "react-native";

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
          <FlatList
            data={tenants}
            keyExtractor={(item) => item.tenantId}
            className="mt-4"
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
                        <Text className="text-[11px] text-ink-soft">Role:</Text>
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
                                "text-[11px] font-medium",
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
                              <Text className="text-[11px] font-semibold text-white">Remove</Text>
                            </Pressable>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => setConfirmingMember(null)}
                              className="rounded-full border border-line px-3 py-1">
                              <Text className="text-[11px] text-ink-soft">Cancel</Text>
                            </Pressable>
                          </View>
                        ) : (
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => setConfirmingMember(member.id)}
                            className="rounded-full border border-line px-3 py-1">
                            <Text className="text-[11px] font-medium text-danger">Remove</Text>
                          </Pressable>
                        )}
                      </View>
                    ) : null}

                    {isSelf ? <Text className="mt-1 text-[11px] text-ink-faint">{"That's you."}</Text> : null}
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

      <Button title="Sign out" variant="danger" className="mt-8" onPress={() => void handleSignOut()} />
    </Screen>
  );
}