import { BottomTabs } from "@/components/bottom-tabs";
import { PageFrame } from "@/components/page-frame";
import { Sidebar } from "@/components/sidebar";
import { TopBar } from "@/components/top-bar";

// Phone: top bar, one narrow column, tabs along the bottom.
// Laptop (1024px and up): sidebar on the left, a wide content area, no top bar or bottom tabs.
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* Bottom padding (in PageFrame) keeps the last card clear of the tab bar and the iPhone's home bar */}
        <PageFrame>{children}</PageFrame>
        <BottomTabs />
      </div>
    </div>
  );
}
