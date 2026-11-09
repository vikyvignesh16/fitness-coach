"use client";

import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { logout } from "@/app/login/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MENU_LINKS } from "@/lib/nav";

export function TopBar() {
  return (
    <header className="bg-background/95 lg:hidden sticky top-0 z-10 border-b pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="mx-auto flex max-w-2xl items-center justify-between px-4">
        <span className="text-sm font-semibold tracking-wide">ATHLETE</span>
        <DropdownMenu>
          <DropdownMenuTrigger render={<Button variant="ghost" size="icon" aria-label="Menu" />}>
            <Menu aria-hidden className="size-6" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-48">
            {MENU_LINKS.map((l) => (
              <DropdownMenuItem key={l.href} render={<Link href={l.href} />} className="min-h-11 text-base">
                {l.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <form action={logout}>
              <DropdownMenuItem render={<button type="submit" />} className="min-h-11 w-full text-base">
                <LogOut aria-hidden className="size-4" /> Sign out
              </DropdownMenuItem>
            </form>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
