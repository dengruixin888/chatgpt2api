"use client";

import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import { fetchCurrentVersion, fetchUpdateStatus, startSelfUpdate, type UpdateStatus } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import webConfig from "@/constants/common-env";
import { useVersionCheck } from "@/hooks/use-version-check";
import { cn } from "@/lib/utils";

function typeVariant(type: string): "success" | "danger" | "info" | "violet" | "outline" {
  if (type === "新增") return "success";
  if (type === "修复") return "danger";
  if (type === "调整") return "info";
  if (type === "文档") return "violet";
  return "outline";
}

function updateStatusMeta(state: UpdateStatus | null) {
  if (!state) {
    return { label: "未检查", tone: "secondary" as const };
  }
  if (state.running) {
    return { label: "更新中", tone: "info" as const };
  }
  if (state.status === "success") {
    return { label: "更新完成", tone: "success" as const };
  }
  if (state.status === "failed") {
    return { label: "更新失败", tone: "danger" as const };
  }
  if (state.available) {
    return { label: "可更新", tone: "outline" as const };
  }
  return { label: "不可用", tone: "secondary" as const };
}

export function VersionReleaseDialog({ className }: { className?: string }) {
  const {
    open,
    setOpen,
    openReleaseModal,
    latestVersion,
    releases,
    latestRelease,
    checking,
    hasNewVersion,
    checkLatestRelease,
  } = useVersionCheck();

  const [updateState, setUpdateState] = useState<UpdateStatus | null>(null);
  const [startingUpdate, setStartingUpdate] = useState(false);
  const [detectedVersion, setDetectedVersion] = useState(webConfig.appVersion);
  const statusMeta = useMemo(() => updateStatusMeta(updateState), [updateState]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    let timer: number | null = null;

    const poll = async () => {
      try {
        const data = await fetchUpdateStatus();
        if (!cancelled) {
          setUpdateState(data.update);
          if (data.update.running) {
            timer = window.setTimeout(poll, 2000);
          }
        }
      } catch {
        if (!cancelled) {
          timer = window.setTimeout(poll, 4000);
        }
      }
    };

    void poll();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [open]);

  useEffect(() => {
    if (updateState?.status !== "success") return;
    let cancelled = false;
    let attempts = 0;
    let timer: number | null = null;

    const pollVersion = async () => {
      attempts += 1;
      try {
        const data = await fetchCurrentVersion();
        const nextVersion = String(data.version || "").trim();
        if (!cancelled && nextVersion) {
          setDetectedVersion(nextVersion);
          if (nextVersion !== webConfig.appVersion) {
            toast.success(`已更新到 ${nextVersion}`);
            return;
          }
        }
      } catch {
        // 服务重启期间 /version 可能短暂不可用，继续轮询。
      }
      if (!cancelled && attempts < 120) {
        timer = window.setTimeout(pollVersion, 3000);
      }
    };

    timer = window.setTimeout(pollVersion, 3000);
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [updateState?.status]);

  const handleStartUpdate = async () => {
    setStartingUpdate(true);
    try {
      const data = await startSelfUpdate();
      setUpdateState(data.update);
    } finally {
      setStartingUpdate(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={cn(
          hasNewVersion
            ? "inline-flex h-8 items-center justify-center rounded-full border border-emerald-300 bg-emerald-50 px-3 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100 hover:text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-950/70"
            : "relative px-1 py-1 text-[11px] font-medium text-stone-500 transition hover:text-stone-900 dark:text-stone-300 dark:hover:text-white",
          className,
        )}
        onClick={openReleaseModal}
        title={hasNewVersion ? "检测到新版本，点击查看更新说明" : "查看版本更新"}
      >
        {hasNewVersion ? "更新" : `v${webConfig.appVersion}`}
        {hasNewVersion ? null : <span className="absolute -top-1 -right-1 size-2 rounded-full bg-emerald-500" />}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="w-[min(94vw,760px)] rounded-2xl">
          <DialogHeader>
            <DialogTitle>版本更新</DialogTitle>
          </DialogHeader>
          {hasNewVersion ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm leading-6 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100">
              检测到新版本 v{latestVersion}。
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <VersionCard label="当前版本" value={webConfig.appVersion} />
            <VersionCard
              label="最新版本"
              value={latestVersion}
              action={
                <button
                  type="button"
                  className="text-[11px] text-stone-400 underline-offset-2 hover:text-stone-700 hover:underline dark:hover:text-stone-200"
                  onClick={() => void checkLatestRelease(true)}
                >
                  {checking ? "检查中..." : "检查更新"}
                </button>
              }
            />
          </div>
          <div className="max-h-[60vh] space-y-5 overflow-y-auto pr-1">
            {latestRelease?.version && hasNewVersion ? (
              <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm leading-6 text-stone-700 dark:border-white/10 dark:bg-white/5 dark:text-stone-200">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <div className="mb-1 font-medium text-stone-950 dark:text-stone-100">一键更新</div>
                    <div className="text-xs text-stone-500 dark:text-stone-400">
                      {updateState?.available
                        ? "当前环境支持自动执行更新命令。"
                        : updateState?.reason || "当前环境暂不支持一键更新。"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={statusMeta.tone}>{statusMeta.label}</Badge>
                    <Button
                      size="sm"
                      onClick={() => void handleStartUpdate()}
                      disabled={!updateState?.available || !!updateState?.running || startingUpdate}
                    >
                      {startingUpdate || updateState?.running ? "更新中..." : "立即更新"}
                    </Button>
                  </div>
                </div>
                {updateState?.status === "success" ? (
                  <div className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                    更新任务执行完成，正在自动探测 /version
                    {detectedVersion ? `（当前探测到 ${detectedVersion}）` : ""}。若页面内容未自动变化，请点击下方“刷新页面”。
                  </div>
                ) : null}
                {updateState?.status === "failed" ? (
                  <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/20 dark:text-rose-300">
                    更新失败：{updateState.error || updateState.reason || "未知错误"}
                  </div>
                ) : null}
                <div className="mb-2 grid gap-2 sm:grid-cols-2">
                  {updateState?.base_dir ? (
                    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-stone-950">
                      <div className="mb-1 text-stone-400">运行目录</div>
                      <div className="font-mono break-all">{updateState.base_dir}</div>
                    </div>
                  ) : null}
                  {updateState?.workdir ? (
                    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-stone-950">
                      <div className="mb-1 text-stone-400">Git 目录</div>
                      <div className="font-mono break-all">{updateState.workdir}</div>
                    </div>
                  ) : null}
                  <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs dark:border-white/10 dark:bg-stone-950">
                    <div className="mb-1 text-stone-400">更新时间</div>
                    <div className="font-mono">
                      {updateState?.finished_at ? new Date(updateState.finished_at).toLocaleString() : updateState?.started_at ? new Date(updateState.started_at).toLocaleString() : "-"}
                    </div>
                  </div>
                </div>
                <div className="mb-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => window.location.reload()} disabled={updateState?.running}>
                    刷新页面
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href="https://github.com/basketikun/chatgpt2api" target="_blank" rel="noreferrer">
                      前往 GitHub
                    </a>
                  </Button>
                </div>
                {updateState?.logs?.length ? (
                  <div className="max-h-56 overflow-y-auto rounded-lg border border-stone-200 bg-white p-3 font-mono text-xs dark:border-white/10 dark:bg-stone-950 dark:text-stone-300">
                    {updateState.logs.map((item, index) => {
                      const failed = /失败|error|exception|exit code|exit_code/i.test(item.text);
                      const success = /完成|success/i.test(item.text);
                      return (
                        <div key={`${item.time}-${index}`} className={failed ? "text-rose-600 dark:text-rose-300" : success ? "text-emerald-700 dark:text-emerald-300" : "text-stone-700 dark:text-stone-300"}>
                          <span className="text-stone-400">{new Date(item.time).toLocaleTimeString()}</span>
                          <span className="pl-2">{item.text}</span>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <pre className="overflow-x-auto rounded-lg bg-white p-3 text-xs text-stone-600 dark:bg-stone-950 dark:text-stone-300">{`cd /path/to/chatgpt2api\ngit pull\ndocker compose up -d --build app`}</pre>
                )}
              </div>
            ) : null}
            {releases.map((release) => (
              <div key={release.version} className="border-l border-stone-200 pl-4 dark:border-white/10">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-stone-950 dark:text-stone-100">
                    {release.version === "Unreleased" ? "未发布" : release.version}
                  </span>
                  <span className="text-xs text-stone-500 dark:text-stone-400">{release.date}</span>
                  {release.version === latestVersion ? <Badge variant="success">最新</Badge> : null}
                  {release.version === webConfig.appVersion ? <Badge variant="outline">当前</Badge> : null}
                </div>
                <div className="mt-2 space-y-1.5">
                  {release.items.map((item, index) => (
                    <div key={index} className="flex items-start gap-2 text-sm leading-6 text-stone-700 dark:text-stone-300">
                      <Badge variant={typeVariant(item.type)} className="mt-0.5 shrink-0">
                        {item.type}
                      </Badge>
                      <span className="min-w-0 flex-1">{item.content}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function VersionCard({
  label,
  value,
  action,
}: {
  label: string;
  value: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white/55 p-3 dark:border-white/10 dark:bg-white/5">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs text-stone-500 dark:text-stone-400">{label}</div>
        {action}
      </div>
      <div className="mt-1 text-base font-semibold text-stone-950 dark:text-stone-100">{value}</div>
    </div>
  );
}
