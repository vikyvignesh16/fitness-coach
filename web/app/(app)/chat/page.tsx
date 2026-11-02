import { MessageCircle } from "lucide-react";
import { ComingSoon } from "@/components/coming-soon";

export default function ChatPage() {
  return (
    <ComingSoon icon={MessageCircle} title="Chat with the coach">
      Tell the coach how your day went and ask about your plan. Coming soon.
    </ComingSoon>
  );
}
