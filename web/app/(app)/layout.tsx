import { BottomTabs } from "@/components/bottom-tabs";
import { TopBar } from "@/components/top-bar";

export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <>
      <TopBar />
      {/* Bottom padding keeps the last card clear of the tab bar and the iPhone's home bar */}
      <main className="mx-auto w-full max-w-2xl flex-1 space-y-6 px-4 pt-6 pb-[calc(5.5rem+env(safe-area-inset-bottom))]">
        {children}
      </main>
      <BottomTabs />
    </>
  );
}
