"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, LoaderCircle, Play, RotateCcw, Save, Square, Upload, UserPlus } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { recoverOutlookRegister } from "@/lib/api";

import { useSettingsStore } from "../../settings/store";

function splitLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function providerPoolText(provider: Record<string, unknown> | null | undefined) {
  if (!provider) return "";
  const accountLines = String(provider.account_lines || "").trim();
  if (accountLines) return accountLines;
  const accountLine = String(provider.account_line || "").trim();
  if (accountLine) return accountLine;
  const email = String(provider.email || "").trim();
  const password = String(provider.password || "").trim();
  const clientId = String(provider.client_id || "").trim();
  const refreshToken = String(provider.refresh_token || "").trim();
  if (email && password && clientId && refreshToken) {
    return `${email}----${password}----${clientId}----${refreshToken}`;
  }
  return email;
}

export function RegisterCard() {
  const config = useSettingsStore((state) => state.registerConfig);
  const isLoading = useSettingsStore((state) => state.isLoadingRegister);
  const isSaving = useSettingsStore((state) => state.isSavingRegister);
  const setProxy = useSettingsStore((state) => state.setRegisterProxy);
  const setDynamicProxyField = useSettingsStore((state) => state.setRegisterDynamicProxyField);
  const setTotal = useSettingsStore((state) => state.setRegisterTotal);
  const setThreads = useSettingsStore((state) => state.setRegisterThreads);
  const setMode = useSettingsStore((state) => state.setRegisterMode);
  const setTargetQuota = useSettingsStore((state) => state.setRegisterTargetQuota);
  const setTargetAvailable = useSettingsStore((state) => state.setRegisterTargetAvailable);
  const setCheckInterval = useSettingsStore((state) => state.setRegisterCheckInterval);
  const setMailField = useSettingsStore((state) => state.setRegisterMailField);
  const addProvider = useSettingsStore((state) => state.addRegisterProvider);
  const updateProvider = useSettingsStore((state) => state.updateRegisterProvider);
  const save = useSettingsStore((state) => state.saveRegister);
  const toggle = useSettingsStore((state) => state.toggleRegister);
  const reset = useSettingsStore((state) => state.resetRegister);

  const [poolText, setPoolText] = useState("");
  const [recovering, setRecovering] = useState(false);
  const [recoverResult, setRecoverResult] = useState<{
    imported: Array<{ mailbox_base: string; email: string; added: number; skipped: number; refresh_errors: Array<Record<string, unknown>> }>;
    missing: string[];
    errors: Array<{ email: string; error: string }>;
  } | null>(null);
  const stats = config?.stats || { success: 0, fail: 0, done: 0, running: 0, threads: config?.threads || 1 };
  const dynamicProxy = config?.dynamic_proxy || {
    enabled: false,
    protocol: "http" as const,
    host: "",
    port: "",
    username_template: "",
    password_template: "",
    session_length: 8,
  };

  const providers = config?.mail.providers || [];
  const currentProvider = (providers[0] as Record<string, unknown> | undefined) || {};
  const maxAliases = Number(currentProvider.max_aliases || 0);

  useEffect(() => {
    const current = providers[0] || null;
    const value = providerPoolText((current as Record<string, unknown> | null) || null);
    setPoolText((previous) => (previous ? previous : value));
  }, [providers]);

  useEffect(() => {
    if (!providers.length) {
      addProvider();
    }
  }, [addProvider, providers.length]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-stone-200 bg-white/80 p-10">
        <LoaderCircle className="size-5 animate-spin text-stone-400" />
      </div>
    );
  }

  if (!config) return null;

  const outlookLines = splitLines(poolText);

  const handleRecover = async () => {
    if (recovering) return;
    const lines = splitLines(poolText);
    if (lines.length === 0) {
      toast.error("请先输入 Outlook 号池");
      return;
    }
    setRecovering(true);
    setRecoverResult(null);
    try {
      const result = await recoverOutlookRegister(lines);
      setRecoverResult(result.result);
      if (result.result.missing.length) {
        toast.warning(`有 ${result.result.missing.length} 个邮箱未注册`);
      } else {
        toast.success("回收导入完成");
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "回收导入失败");
    } finally {
      setRecovering(false);
    }
  };

  const syncPoolText = (value: string) => {
    setPoolText(value);
    if (!providers.length) {
      addProvider();
    }
    updateProvider(0, {
      enable: true,
      type: "outlook",
      account_lines: value,
      account_line: value.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)[0] || "",
      email: "",
      password: "",
      client_id: "",
      refresh_token: "",
    });
  };

  return (
    <div className="grid h-[calc(100vh-132px)] min-h-[720px] gap-0 overflow-hidden rounded-xl border border-stone-200 bg-white/70 xl:grid-cols-[380px_minmax(0,1fr)]">
      <section className="space-y-4 overflow-y-auto border-b border-stone-200 p-4 xl:border-r xl:border-b-0">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-stone-100">
              <UserPlus className="size-5 text-stone-600" />
            </div>
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Outlook 号池</h2>
              <p className="mt-1 text-xs text-stone-500">一行一个账号：邮箱----密码----client id----refresh token</p>
            </div>
          </div>
          <Button className="h-9 rounded-xl bg-stone-950 px-4 text-white hover:bg-stone-800" onClick={() => void save()} disabled={isSaving || config.enabled}>
            {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />}
            保存
          </Button>
        </div>

        <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
          <label className="text-sm font-medium text-stone-700">号池文本</label>
          <Textarea
            value={poolText}
            onChange={(event) => syncPoolText(event.target.value)}
            placeholder="邮箱----密码----client id----refresh token"
            className="min-h-44 rounded-xl border-stone-200 bg-white font-mono text-xs"
            disabled={config.enabled}
          />
          <div className="flex items-center justify-between text-xs text-stone-500">
            <span>当前 {outlookLines.length} 行</span>
            <span>支持多行粘贴</span>
          </div>
        </div>

        <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
          <label className="text-sm font-medium text-stone-700">每个基础邮箱最大 alias 数</label>
          <Input
            value={String(maxAliases || 0)}
            onChange={(event) => updateProvider(0, { max_aliases: Number(event.target.value) || 0 })}
            placeholder="0 表示不限制"
            className="h-10 rounded-xl border-stone-200 bg-white"
            disabled={config.enabled}
          />
          <p className="text-xs text-stone-500">达到上限后会自动切换到号池里的下一个 Outlook 基础邮箱。</p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button className="h-10 rounded-xl bg-stone-950 px-3 text-white hover:bg-stone-800" onClick={handleRecover} disabled={recovering || config.enabled}>
            {recovering ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />}
            回收导入
          </Button>
          <Button variant="outline" className="h-10 rounded-xl border-stone-200 bg-white px-3 text-stone-700" onClick={() => void toggle()} disabled={isSaving}>
            {isSaving ? <LoaderCircle className="size-4 animate-spin" /> : config.enabled ? <Square className="size-4" /> : <Play className="size-4" />}
            {config.enabled ? "停止" : "启动"}
          </Button>
          <Button variant="outline" className="h-10 rounded-xl border-stone-200 bg-white px-3 text-stone-700" onClick={() => void reset()} disabled={isSaving || config.enabled}>
            <RotateCcw className="size-4" />
            重置
          </Button>
          <Button variant="outline" className="h-10 rounded-xl border-stone-200 bg-white px-3 text-stone-700" onClick={() => void save()} disabled={isSaving || config.enabled}>
            <Save className="size-4" />
            保存
          </Button>
        </div>

        {recoverResult ? (
          <div className="space-y-3 rounded-xl border border-stone-200 bg-white p-3">
            <div className="text-sm font-semibold text-stone-800">回收结果</div>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700">导入 {recoverResult.imported.length}</div>
              <div className="rounded-lg bg-amber-50 p-2 text-amber-700">未注册 {recoverResult.missing.length}</div>
              <div className="rounded-lg bg-rose-50 p-2 text-rose-700">错误 {recoverResult.errors.length}</div>
            </div>
            {recoverResult.missing.length ? (
              <div className="space-y-2">
                <div className="text-xs font-medium text-stone-500">未注册邮箱列表</div>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-2 font-mono text-xs">
                  {recoverResult.missing.map((item) => (
                    <div key={item}>{item}</div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="space-y-3 border-t border-stone-200 pt-3">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm text-stone-700">注册模式</label>
              <select value={config.mode || "total"} onChange={(event) => setMode(event.target.value as "total" | "quota" | "available")} disabled={config.enabled} className="h-10 w-full rounded-xl border border-stone-200 bg-white px-3">
                <option value="total">注册总数</option>
                <option value="quota">号池剩余额度</option>
                <option value="available">可用账号数量</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-sm text-stone-700">注册总数</label>
              <Input value={String(config.total)} onChange={(event) => setTotal(event.target.value)} className="h-10 rounded-xl border-stone-200 bg-white" disabled={config.enabled || config.mode !== "total"} />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-stone-700">线程数</label>
              <Input value={String(config.threads)} onChange={(event) => setThreads(event.target.value)} className="h-10 rounded-xl border-stone-200 bg-white" disabled={config.enabled} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm text-stone-700">注册代理</label>
              <Input value={config.proxy} onChange={(event) => setProxy(event.target.value)} placeholder="http://127.0.0.1:7890" className="h-10 rounded-xl border-stone-200 bg-white" disabled={config.enabled} />
            </div>
            <label className="flex items-center gap-3 pt-8 text-sm text-stone-700">
              <Checkbox checked={Boolean(dynamicProxy.enabled)} onCheckedChange={(checked) => setDynamicProxyField("enabled", Boolean(checked))} disabled={config.enabled} />
              启用动态代理
            </label>
            <div className="space-y-2">
              <label className="text-sm text-stone-700">检查间隔</label>
              <Input value={String(config.check_interval || "")} onChange={(event) => setCheckInterval(event.target.value)} className="h-10 rounded-xl border-stone-200 bg-white" disabled={config.enabled || config.mode === "total"} />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <label className="text-sm text-stone-700">请求超时</label>
              <Input value={String(config.mail.request_timeout || "")} onChange={(event) => setMailField("request_timeout", event.target.value)} className="h-10 rounded-xl border-stone-200 bg-white" disabled={config.enabled} />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-stone-700">等待验证码超时</label>
              <Input value={String(config.mail.wait_timeout || "")} onChange={(event) => setMailField("wait_timeout", event.target.value)} className="h-10 rounded-xl border-stone-200 bg-white" disabled={config.enabled} />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-stone-700">轮询间隔</label>
              <Input value={String(config.mail.wait_interval || "")} onChange={(event) => setMailField("wait_interval", event.target.value)} className="h-10 rounded-xl border-stone-200 bg-white" disabled={config.enabled} />
            </div>
          </div>
        </div>
      </section>

      <section className="flex min-h-0 flex-col p-4">
        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">运行结果</h2>
              <p className="mt-1 text-sm text-stone-500">号池模式下，注册时按输入顺序轮换 Outlook 账号。</p>
            </div>
            <Badge variant={config.enabled ? "success" : "secondary"} className="rounded-md">
              {config.enabled ? "运行中" : "已停止"}
            </Badge>
          </div>

          <div className="grid grid-cols-4 gap-2">
            {[
              ["成功 / 成功率", `${stats.success} / ${stats.success_rate || 0}%`],
              ["失败", stats.fail],
              ["完成", stats.done],
              ["运行 / 线程", `${stats.running} / ${stats.threads}`],
              ["运行时间", `${stats.elapsed_seconds || 0}s`],
              ["平均注册单个", `${stats.avg_seconds || 0}s`],
              ["当前额度", stats.current_quota || 0],
              ["正常账号", stats.current_available || 0],
            ].map(([label, value]) => (
              <div key={label} className="border border-stone-200 bg-white/70 px-3 py-2">
                <div className="text-xs text-stone-400">{label}</div>
                <div className="mt-1 text-base font-semibold text-stone-800">{value}</div>
              </div>
            ))}
          </div>

          <div className="flex items-center gap-2 border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <AlertTriangle className="size-4 shrink-0" />
            回收导入只会把已注册的 Outlook 邮箱账号重新导入号池，未注册的邮箱会在结果里列出来。
          </div>
        </div>

        <div className="mt-4 flex min-h-0 flex-1 flex-col space-y-3 overflow-hidden border-t border-stone-200 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">实时日志</h3>
              <p className="mt-1 text-xs text-amber-700">如果遇到 400，通常是邮箱或环境被限制。</p>
            </div>
            <Badge variant="secondary" className="rounded-md">
              {config.logs?.length || 0}
            </Badge>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border border-stone-200 bg-white/70 p-3 font-mono text-xs leading-6">
            {config.logs?.length ? (
              config.logs
                .slice()
                .reverse()
                .map((item, index) => (
                  <div
                    key={`${item.time}-${index}`}
                    className={item.level === "red" ? "text-rose-600" : item.level === "green" ? "text-emerald-700" : item.level === "yellow" ? "text-amber-700" : "text-stone-700"}
                  >
                    <span className="text-stone-400">{new Date(item.time).toLocaleTimeString()}</span>
                    <span className="pl-2">{item.text}</span>
                  </div>
                ))
            ) : (
              <div className="text-stone-500">暂无日志</div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
