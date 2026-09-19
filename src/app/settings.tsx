import * as Clipboard from "expo-clipboard";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useState } from "react";
import { FlatList, Modal, Pressable, Text, View } from "react-native";

import { BackLink } from "@/components/ui/back-link";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Screen } from "@/components/ui/screen";
import { useAuth } from "@/context/auth-context";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { ApiError } from "@/lib/errors";
import { InviteInfo, MembershipRole, ShopMember, TenantMembership } from "@/lib/types";

type InvitesData = {
  invite: InviteInfo | null;
  members: ShopMember[];
};

function RoleChip({ role }: { role: MembershipRole }) {
  const tone =
    role === "OWNER"
      ? "bg-accent/10 text-accent"
      : role === "STAFF"
        ? "bg-[#E8E2D6] text-ink"
        : "bg-[#EFEAE0] text-ink-soft";
  return <Text className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium", tone)}>{role}</Text>;
}

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
      <Pressable className="flex-1 items-center justify-end bg-black/30" onPress={onClose}>
        <Pressable
          className="w-full rounded-t-2xl bg-paper-card p-5 pb-8"
          onPress={(event) => event.stopPropagation()}>
          <Text className="text-sm font-medium uppercase tracking-widest text-ink-faint">Your shops</Text>
          <FlatList
            data={tenants}
            keyExtractor={(item) => item.tenantId}
            className="mt-3"
            renderItem={({ item }) => (
              <Pressable
                accessibilityRole="button"
                onPress={() => {
                  void switchShop(item.tenantId);
                  onClose();
                }}
                className="flex-row items-center justify-between border-b border-line py-3.5">
                <Text className="text-base font-medium text-ink">{item.name}</Text>
                <RoleChip role={item.role} />
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
        <Text className="text-2xl font-semibold text-ink">Shop</Text>
        <BackLink />
      </View>

      {error ? <Text className="mt-3 text-xs font-medium text-danger">{error}</Text> : null}

      {/* Current shop + switcher */}
      <View className="mt-5 rounded-lg border border-line bg-paper-card p-4">
        <Text className="text-[11px] uppercase tracking-widest text-ink-faint">Current shop</Text>
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="text-lg font-semibold text-ink">{tenant?.name}</Text>
          {role ? <RoleChip role={role} /> : null}
        </View>
        {user ? <Text className="mt-1 text-xs text-ink-soft">Signed in as {user.email}</Text> : null}
        <Button
          title={tenants.length > 1 ? "Switch shop" : "Your shops"}
          variant="secondary"
          className="mt-4"
          onPress={() => setSwitcherOpen(true)}
        />
        {tenants.length > 1 ? (
          <Text className="mt-2 text-xs text-ink-faint">You belong to {tenants.length} shops. Switching opens the other ledger.</Text>
        ) : null}
      </View>

      <ShopSwitcher tenants={tenants} visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />

      {/* Invite code (owner only) */}
      {isOwner ? (
        <View className="mt-5 rounded-lg border border-line bg-paper-card p-4">
          <Text className="text-[11px] uppercase tracking-widest text-ink-faint">Invite a team member</Text>
          {invites?.invite ? (
            <>
              <View className="mt-3 flex-row items-center justify-between">
                <Text className="text-3xl font-semibold tabular-nums tracking-widest text-ink">
                  {invites.invite.code}
                </Text>
                <Button
                  title={copied ? "Copied" : "Copy"}
                  variant="secondary"
                  onPress={() => void handleCopy(invites.invite!.code)}
                />
              </View>
              <Text className="mt-1 text-xs text-ink-faint">Share this code any way you like. It expires {expiry}.</Text>
            </>
          ) : (
            <Text className="mt-2 text-sm text-ink-soft">
              No code right now. Generate one to invite a new member.
            </Text>
          )}
          <Button
            title={invites?.invite ? "New code (invalidates old)" : "Generate code"}
            variant="secondary"
            className="mt-3"
            disabled={busy}
            onPress={() => void handleNewCode()}
          />
        </View>
      ) : null}

      {/* Members (owner only) */}
      {isOwner ? (
        <View className="mt-5 rounded-lg border border-line bg-paper-card">
          <Text className="px-4 pt-4 text-[11px] uppercase tracking-widest text-ink-faint">Members</Text>
          {invites?.members && invites.members.length > 0 ? (
            invites.members.map((member: ShopMember) => {
              const isSelf = member.userId === user?.id;
              const confirming = confirmingMember === member.id;
              return (
                <View key={member.id} className="border-t border-line px-4 py-3">
                  <View className="flex-row items-center justify-between">
                    <View className="flex-1 pr-3">
                      <Text className="text-sm font-medium text-ink">{member.name}</Text>
                      <Text className="text-xs text-ink-faint">{member.email}</Text>
                    </View>
                    <RoleChip role={member.role} />
                  </View>

                  {!isSelf && member.role !== "OWNER" ? (
                    <View className="mt-2 flex-row items-center gap-2">
                      <Text className="text-[11px] text-ink-soft">Role:</Text>
                      {(["STAFF", "VIEW"] as const).map((r) => (
                        <Pressable
                          key={r}
                          accessibilityRole="button"
                          disabled={changingRole === member.id}
                          onPress={() => void handleSetRole(member.id, r)}
                          className={cn(
                            "rounded-full border px-3 py-1",
                            member.role === r ? "border-accent bg-accent/10" : "border-line",
                          )}>
                          <Text className={cn("text-[11px] font-medium", member.role === r ? "text-accent" : "text-ink-soft")}>
                            {r === "STAFF" ? "Staff" : "View only"}
                          </Text>
                        </Pressable>
                      ))}

                      {confirming ? (
                        <View className="ml-auto flex-row items-center gap-2">
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
                          className="ml-auto rounded-full border border-line px-3 py-1">
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
              body="Generate a code to invite someone."
            />
          )}
        </View>
      ) : null}

      {role === "VIEW" ? (
        <View className="mt-5 rounded-lg border border-line bg-paper-card p-4">
          <Text className="text-sm text-ink-soft">
            You have view-only access in this shop, so the ledger stays safe. Ask an owner to widen your role if you
            need to sell.
          </Text>
        </View>
      ) : null}

      <Button title="Sign out" variant="danger" className="mt-8" onPress={() => void handleSignOut()} />
    </Screen>
  );
}