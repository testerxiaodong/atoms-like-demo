"use client";
import { useRef, useState } from "react";
import { Button } from "./ui/button";
import { Dialog } from "@base-ui/react/dialog";
import { Menu } from "@base-ui/react/menu";
import { Ellipsis, Trash2, Loader2 } from "lucide-react";
import { useHydrated } from "@/lib/use-hydrated";

export function ProjectActions({
  project,
  onDeleted,
}: {
  project: { id: string; name: string };
  onDeleted: () => void;
}) {
  const hydrated = useHydrated();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const cancel = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  async function remove() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: "DELETE",
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "删除失败，请重试。");
      }
      if (sessionStorage.getItem("forma:created-project") === project.id)
        sessionStorage.removeItem("forma:created-project");
      sessionStorage.removeItem(`prompt:${project.id}`);
      sessionStorage.removeItem(`autostart:${project.id}`);
      setOpen(false);
      onDeleted();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "连接暂时中断，请重试。",
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      <Menu.Root>
        <Menu.Trigger
          ref={trigger}
          className="project-menu-trigger"
          disabled={!hydrated}
          aria-label={`项目操作 ${project.name}`}
        >
          <Ellipsis size={20} />
        </Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner
            side="bottom"
            align="end"
            sideOffset={6}
            className="project-menu-positioner"
          >
            <Menu.Popup className="project-menu-popup">
              <Menu.Item
                className="project-menu-delete"
                onClick={() => {
                  setError("");
                  setOpen(true);
                }}
              >
                <Trash2 size={16} />
                删除项目
              </Menu.Item>
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
      <Dialog.Root
        open={open}
        onOpenChange={(next) => {
          if (!lock.current) setOpen(next);
        }}
        disablePointerDismissal={busy}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="delete-dialog-backdrop" />
          <Dialog.Popup
            className="delete-dialog"
            initialFocus={cancel}
            finalFocus={trigger}
            aria-busy={busy}
          >
            <div className="delete-dialog-icon">
              <Trash2 size={22} />
            </div>
            <Dialog.Title className="delete-dialog-title">
              删除这个项目？
            </Dialog.Title>
            <Dialog.Description className="delete-dialog-description">
              删除后，项目源码、聊天记录和所有历史版本将被永久移除，无法恢复。
            </Dialog.Description>
            <div className="delete-project-name">{project.name}</div>
            {error && (
              <p role="alert" className="delete-dialog-error">
                {error}
              </p>
            )}
            <div className="delete-dialog-actions">
              <Dialog.Close
                ref={cancel}
                className="delete-cancel"
                disabled={busy}
              >
                取消
              </Dialog.Close>
              <Button
                variant="destructive"
                className="delete-confirm"
                disabled={busy}
                onClick={() => void remove()}
              >
                {busy ? (
                  <>
                    <Loader2 size={15} className="spin" />
                    正在删除…
                  </>
                ) : (
                  "确认删除"
                )}
              </Button>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
