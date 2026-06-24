"use client";

import { LoaderCircle } from "lucide-react";

import { SearchPanel } from "@/app/debug/components/search-panel";
import { useAuthGuard } from "@/lib/use-auth-guard";

export default function SearchPage() {
  const { isCheckingAuth, session } = useAuthGuard(["admin"]);

  if (isCheckingAuth || !session || session.role !== "admin") {
    return (
      <div className="flex min-h-[calc(100vh-49px)] items-center justify-center">
        <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return <SearchPanel />;
}
