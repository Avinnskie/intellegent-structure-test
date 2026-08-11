"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Modal } from "@/components/ui/modal";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import type { PortalUserDto } from "@/lib/server/users.ts";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type ErrorEnvelope = { error?: { code?: string; message?: string } };

const NETWORK_ERROR_MESSAGE = "Tidak dapat menghubungi server. Coba lagi.";

type CreateDraft = {
  email: string;
  displayName: string;
  password: string;
  role: "hr_admin" | "super_admin";
  viewResults: boolean;
};

const EMPTY_CREATE: CreateDraft = {
  email: "",
  displayName: "",
  password: "",
  role: "hr_admin",
  viewResults: true,
};

type EditDraft = {
  userId: string;
  email: string;
  displayName: string;
  role: "hr_admin" | "super_admin";
  viewResults: boolean;
  newPassword: string;
};

export function UserManager({
  users,
  selfId,
}: {
  users: readonly PortalUserDto[];
  selfId: string;
}) {
  const router = useRouter();
  const { push } = useToast();
  const [isBusy, setIsBusy] = useState(false);
  const [create, setCreate] = useState<CreateDraft | null>(null);
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [pendingDeactivate, setPendingDeactivate] = useState<PortalUserDto | null>(null);

  async function call(path: string, method: string, body: unknown): Promise<boolean> {
    setIsBusy(true);
    try {
      const response = await fetch(path, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.ok) {
        router.refresh();
        return true;
      }
      const envelope = (await response.json().catch(() => ({}))) as ErrorEnvelope;
      push("error", envelope.error?.message ?? NETWORK_ERROR_MESSAGE);
      return false;
    } catch {
      push("error", NETWORK_ERROR_MESSAGE);
      return false;
    } finally {
      setIsBusy(false);
    }
  }

  async function handleCreate() {
    if (!create) {
      return;
    }
    const ok = await call("/api/admin/users", "POST", {
      email: create.email.trim(),
      displayName: create.displayName.trim(),
      password: create.password,
      role: create.role,
      viewResults: create.viewResults,
    });
    if (ok) {
      setCreate(null);
      push("success", `Akun ${create.email.trim()} dibuat. Sampaikan kata sandinya secara aman.`);
    }
  }

  async function handleEdit() {
    if (!edit) {
      return;
    }
    const ok = await call(`/api/admin/users/${edit.userId}`, "PUT", {
      displayName: edit.displayName.trim(),
      role: edit.role,
      viewResults: edit.viewResults,
      ...(edit.newPassword.trim() ? { newPassword: edit.newPassword } : {}),
    });
    if (ok) {
      setEdit(null);
      push("success", "Akun diperbarui.");
    }
  }

  async function handleSetStatus(user: PortalUserDto, status: "active" | "inactive") {
    if (await call(`/api/admin/users/${user.id}`, "PUT", { status })) {
      push(
        "success",
        status === "inactive"
          ? `Akun ${user.email} dinonaktifkan.`
          : `Akun ${user.email} diaktifkan.`,
      );
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex justify-end">
        <Button disabled={isBusy} onClick={() => setCreate(EMPTY_CREATE)}>
          Tambah akun
        </Button>
      </div>

      <Modal
        open={create !== null}
        title="Akun baru"
        description="Kata sandi hanya dikirim sekali dan tidak pernah ditampilkan kembali — sampaikan lewat jalur aman dan minta segera diganti."
        size="lg"
        onClose={() => setCreate(null)}
      >
        {create ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="user-email">Email</Label>
                <Input
                  id="user-email"
                  type="email"
                  value={create.email}
                  autoComplete="off"
                  placeholder="nama@perusahaan.com"
                  onChange={(event) => setCreate({ ...create, email: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="user-name">Nama lengkap</Label>
                <Input
                  id="user-name"
                  value={create.displayName}
                  maxLength={200}
                  onChange={(event) => setCreate({ ...create, displayName: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="user-password">
                  Kata sandi awal{" "}
                  <span className="font-normal text-muted-foreground">(min. 8)</span>
                </Label>
                <Input
                  id="user-password"
                  type="password"
                  value={create.password}
                  autoComplete="new-password"
                  onChange={(event) => setCreate({ ...create, password: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select
                  value={create.role}
                  onValueChange={(role) =>
                    setCreate({ ...create, role: role as CreateDraft["role"] })
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string | null) =>
                        value === "super_admin" ? "Super Admin" : "HR Admin"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hr_admin" label="HR Admin">
                      HR Admin
                    </SelectItem>
                    <SelectItem value="super_admin" label="Super Admin">
                      Super Admin
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <label className="flex items-center gap-3 text-sm font-semibold text-foreground">
              <Checkbox
                checked={create.viewResults}
                onCheckedChange={(checked) =>
                  setCreate({ ...create, viewResults: checked === true })
                }
              />
              Izin <code>view_results</code> — dapat melihat hasil tes &amp; mengunduh laporan
            </label>
            <div className="flex flex-wrap gap-3 border-t border-border pt-4">
              <Button
                disabled={
                  isBusy ||
                  create.email.trim() === "" ||
                  create.displayName.trim() === "" ||
                  create.password.length < 8
                }
                onClick={handleCreate}
              >
                Buat akun
              </Button>
              <Button variant="outline" onClick={() => setCreate(null)}>
                Batal
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={edit !== null}
        title={`Edit akun — ${edit?.email ?? ""}`}
        size="lg"
        onClose={() => setEdit(null)}
      >
        {edit ? (
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="edit-name">Nama lengkap</Label>
                <Input
                  id="edit-name"
                  value={edit.displayName}
                  maxLength={200}
                  onChange={(event) => setEdit({ ...edit, displayName: event.target.value })}
                />
              </div>
              <div className="grid gap-2">
                <Label>Role</Label>
                <Select
                  value={edit.role}
                  disabled={edit.userId === selfId}
                  onValueChange={(role) => setEdit({ ...edit, role: role as EditDraft["role"] })}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue>
                      {(value: string | null) =>
                        value === "super_admin" ? "Super Admin" : "HR Admin"
                      }
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="hr_admin" label="HR Admin">
                      HR Admin
                    </SelectItem>
                    <SelectItem value="super_admin" label="Super Admin">
                      Super Admin
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="edit-password">
                  Kata sandi baru{" "}
                  <span className="font-normal text-muted-foreground">(kosongkan bila tetap)</span>
                </Label>
                <Input
                  id="edit-password"
                  type="password"
                  value={edit.newPassword}
                  autoComplete="new-password"
                  onChange={(event) => setEdit({ ...edit, newPassword: event.target.value })}
                />
              </div>
              <label className="flex items-end gap-3 pb-3 text-sm font-semibold text-foreground">
                <Checkbox
                  checked={edit.viewResults}
                  onCheckedChange={(checked) => setEdit({ ...edit, viewResults: checked === true })}
                />
                Izin <code>view_results</code>
              </label>
            </div>
            <div className="flex flex-wrap gap-3 border-t border-border pt-4">
              <Button
                disabled={
                  isBusy ||
                  edit.displayName.trim() === "" ||
                  (edit.newPassword !== "" && edit.newPassword.length < 8)
                }
                onClick={handleEdit}
              >
                Simpan perubahan
              </Button>
              <Button variant="outline" onClick={() => setEdit(null)}>
                Batal
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={pendingDeactivate !== null}
        title={`Nonaktifkan ${pendingDeactivate?.email}?`}
        description="Akun nonaktif tidak dapat masuk portal sampai diaktifkan kembali. Sesi login yang sedang berjalan ditolak pada request berikutnya."
        confirmLabel="Nonaktifkan"
        tone="danger"
        isBusy={isBusy}
        onConfirm={() => {
          const target = pendingDeactivate;
          setPendingDeactivate(null);
          if (target) {
            void handleSetStatus(target, "inactive");
          }
        }}
        onCancel={() => setPendingDeactivate(null)}
      />

      <article className="overflow-x-auto rounded-xl border border-border bg-card p-6">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-2xl font-bold tracking-[-0.03em] text-foreground">
            Akun HR &amp; Super Admin
          </h2>
          <p className="text-sm text-muted-foreground">{users.length} akun</p>
        </div>
        <Table className="mt-6 min-w-full text-left">
          <TableHeader className="text-xs uppercase tracking-[0.08em] text-muted-foreground">
            <TableRow>
              <TableHead className="pb-3">Nama</TableHead>
              <TableHead className="pb-3">Email</TableHead>
              <TableHead className="pb-3">Role</TableHead>
              <TableHead className="pb-3">view_results</TableHead>
              <TableHead className="pb-3">Status</TableHead>
              <TableHead className="pb-3">Login terakhir</TableHead>
              <TableHead className="pb-3">Aksi</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="text-sm text-foreground">
            {users.map((user) => (
              <TableRow key={user.id} className="border-t border-border">
                <TableCell className="py-4 font-semibold">
                  {user.displayName}
                  {user.id === selfId ? (
                    <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
                      Anda
                    </span>
                  ) : null}
                </TableCell>
                <TableCell className="py-4">{user.email}</TableCell>
                <TableCell className="py-4">
                  {user.role === "super_admin" ? "Super Admin" : "HR Admin"}
                </TableCell>
                <TableCell className="py-4">
                  {user.permissions.includes("view_results") ? "✓" : "—"}
                </TableCell>
                <TableCell className="py-4">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold uppercase tracking-[0.08em] ${
                      user.status === "active"
                        ? "bg-accent text-primary"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {user.status === "active" ? "Aktif" : "Nonaktif"}
                  </span>
                </TableCell>
                <TableCell className="py-4">
                  {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString("id-ID") : "—"}
                </TableCell>
                <TableCell className="py-4">
                  <span className="flex flex-wrap gap-1">
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      disabled={isBusy}
                      onClick={() =>
                        setEdit({
                          userId: user.id,
                          email: user.email,
                          displayName: user.displayName,
                          role: user.role,
                          viewResults: user.permissions.includes("view_results"),
                          newPassword: "",
                        })
                      }
                    >
                      Edit
                    </Button>
                    {user.id !== selfId ? (
                      user.status === "active" ? (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-destructive"
                          disabled={isBusy}
                          onClick={() => setPendingDeactivate(user)}
                        >
                          Nonaktifkan
                        </Button>
                      ) : (
                        <Button
                          variant="link"
                          size="sm"
                          className="h-auto p-0 text-muted-foreground"
                          disabled={isBusy}
                          onClick={() => void handleSetStatus(user, "active")}
                        >
                          Aktifkan
                        </Button>
                      )
                    ) : null}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </article>
    </section>
  );
}
